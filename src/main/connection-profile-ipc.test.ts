import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerConnectionProfileIpc } from './connection-profile-ipc.ts'
import { ConnectionProfileStore } from './connections-store.ts'
import type { SecretStore } from './secrets/store.ts'
import type { DataSourceProfile, PostgresProfile } from '../shared/types.ts'

const IPC_PASSWORD = 'SYNTHETIC_IPC_PASSWORD_DO_NOT_EXPOSE'
const IPC_LEGACY_PASSWORD =
  'SYNTHETIC_IPC_LEGACY_PASSWORD_DO_NOT_EXPOSE'

class FakeSecrets implements SecretStore {
  values = new Map<string, string>()
  available = true

  private key(owner: string, id: string) {
    return `${owner}/${id}`
  }

  async has(owner: 'ai' | 'datasource', id: string) {
    return this.values.has(this.key(owner, id))
  }

  async get(owner: 'ai' | 'datasource', id: string) {
    if (!this.available) throw new Error('unavailable')
    return this.values.get(this.key(owner, id)) ?? null
  }

  async set(owner: 'ai' | 'datasource', id: string, value: string) {
    if (!this.available) throw new Error('unavailable')
    this.values.set(this.key(owner, id), value)
  }

  async delete(owner: 'ai' | 'datasource', id: string) {
    this.values.delete(this.key(owner, id))
  }
}

function postgres(password = ''): PostgresProfile {
  return {
    kind: 'postgres',
    version: 2,
    id: 'pg-ipc',
    name: 'Postgres IPC',
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'reader',
    password,
    hasPassword: Boolean(password),
    tlsMode: 'disable',
    readonly: true,
  }
}

function legacyPostgres(password: string) {
  return {
    kind: 'postgres',
    version: 1,
    id: 'pg-ipc',
    name: 'Legacy Postgres IPC',
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'reader',
    password,
    ssl: false,
    readonly: true,
  }
}

function asPostgres(value: unknown): PostgresProfile {
  assert.equal(
    (value as DataSourceProfile | undefined)?.kind,
    'postgres',
  )
  return value as PostgresProfile
}

function ipcHarness() {
  type Handler = (event: unknown, ...args: unknown[]) => unknown
  const handlers = new Map<string, Handler>()
  const ipc = {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler)
    },
  } as unknown as Parameters<typeof registerConnectionProfileIpc>[0]

  const invoke = async (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    assert.ok(handler, `Missing IPC handler for ${channel}`)
    return handler({}, ...args)
  }

  return { ipc, invoke }
}

test('profile IPC never returns a persisted PostgreSQL password', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connection-ipc-'))
  const secrets = new FakeSecrets()
  const store = new ConnectionProfileStore(directory, secrets)
  const { ipc, invoke } = ipcHarness()
  registerConnectionProfileIpc(ipc, store)

  try {
    const saved = asPostgres(
      await invoke('connections:upsert', postgres(IPC_PASSWORD)),
    )
    assert.equal(saved.password, '')
    assert.equal(saved.hasPassword, true)
    assert.equal(saved.credentialState, 'secure')
    assert.equal(JSON.stringify(saved).includes(IPC_PASSWORD), false)
    assert.equal(secrets.values.get('datasource/pg-ipc'), IPC_PASSWORD)

    const listed = (await invoke('connections:list')) as DataSourceProfile[]
    const listedPostgres = asPostgres(listed[0])
    assert.equal(listedPostgres.password, '')
    assert.equal(listedPostgres.hasPassword, true)
    assert.equal(listedPostgres.credentialState, 'secure')
    assert.equal(JSON.stringify(listed).includes(IPC_PASSWORD), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('credential migration retry IPC returns only sanitized credential state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connection-ipc-'))
  const secrets = new FakeSecrets()
  secrets.available = false
  await writeFile(
    join(directory, 'connections.json'),
    JSON.stringify([legacyPostgres(IPC_LEGACY_PASSWORD)]),
  )
  const store = new ConnectionProfileStore(directory, secrets)
  const { ipc, invoke } = ipcHarness()
  registerConnectionProfileIpc(ipc, store)

  try {
    const before = (await invoke('connections:list')) as DataSourceProfile[]
    const legacy = asPostgres(before[0])
    assert.equal(legacy.password, '')
    assert.equal(legacy.credentialState, 'legacy-plaintext')
    assert.equal(JSON.stringify(before).includes(IPC_LEGACY_PASSWORD), false)

    secrets.available = true
    const retried = asPostgres(
      await invoke('connection:retry-credential-migration', 'pg-ipc'),
    )
    assert.equal(retried.password, '')
    assert.equal(retried.hasPassword, true)
    assert.equal(retried.credentialState, 'secure')
    assert.equal(JSON.stringify(retried).includes(IPC_LEGACY_PASSWORD), false)
    assert.equal(
      secrets.values.get('datasource/pg-ipc'),
      IPC_LEGACY_PASSWORD,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
