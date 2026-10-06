import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateStoredProfile } from './profile-migration.ts'
import { ConnectionProfileStore } from './connections-store.ts'
import type { SecretStore } from './secrets/store.ts'
import type { DataSourceProfile, PostgresProfile } from '../shared/types.ts'

class FakeSecrets implements SecretStore {
  values = new Map<string, string>()
  available = true
  key(owner: string, id: string) {
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

const postgres = (password = '', hasPassword = false) => ({
  kind: 'postgres' as const,
  version: 2 as const,
  id: 'pg-one',
  name: 'Postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'reader',
  password,
  hasPassword,
  tlsMode: 'disable' as const,
  readonly: true,
})

const legacyPostgres = (password = '', ssl = false) => ({
  kind: 'postgres' as const,
  version: 1 as const,
  id: 'pg-one',
  name: 'Postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'reader',
  password,
  ssl,
  readonly: true,
})

const storedPostgres = () => {
  const {
    password: _password,
    hasPassword: _hasPassword,
    ...stored
  } = postgres()
  return stored
}

function asPostgres(profile: DataSourceProfile | undefined): PostgresProfile {
  assert.equal(profile?.kind, 'postgres')
  return profile as PostgresProfile
}

test('secure save, preserve, replace, remove, and delete never persist a password', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  const store = new ConnectionProfileStore(directory, secrets)
  try {
    const saved = asPostgres(await store.upsert(postgres('synthetic-password')))
    assert.equal(saved.password, '')
    assert.equal(saved.credentialState, 'secure')
    assert.equal(secrets.values.get('datasource/pg-one'), 'synthetic-password')
    let disk = await readFile(join(directory, 'connections.json'), 'utf8')
    assert.equal(disk.includes('synthetic-password'), false)
    assert.equal(Object.hasOwn(JSON.parse(disk)[0], 'password'), false)

    await store.upsert({ ...postgres('', true), name: 'Renamed' })
    assert.equal(secrets.values.get('datasource/pg-one'), 'synthetic-password')
    await store.upsert(postgres('replacement-password', true))
    assert.equal(
      secrets.values.get('datasource/pg-one'),
      'replacement-password',
    )
    await store.upsert(postgres('', false))
    assert.equal(await secrets.has('datasource', 'pg-one'), false)
    assert.equal(asPostgres((await store.list())[0]).password, '')

    await store.upsert(postgres('synthetic-password'))
    await store.remove('pg-one')
    assert.equal(await secrets.has('datasource', 'pg-one'), false)
    disk = await readFile(join(directory, 'connections.json'), 'utf8')
    assert.equal(disk.includes('password'), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('passwordless profiles remain passwordless during resolution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  try {
    const store = new ConnectionProfileStore(directory, secrets)
    const saved = asPostgres(await store.upsert(postgres()))
    assert.equal(
      asPostgres(await store.resolveForConnection(saved)).password,
      '',
    )
    assert.equal(secrets.values.size, 0)
    const transient = asPostgres(
      await store.resolveForConnection({
        ...saved,
        password: 'synthetic-password',
      }),
    )
    assert.equal(transient.password, 'synthetic-password')
    assert.equal(secrets.values.size, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('legacy migration is verified, sanitized, and survives restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  await writeFile(
    join(directory, 'connections.json'),
    JSON.stringify([legacyPostgres('legacy-test-password', true)]),
  )
  try {
    const store = new ConnectionProfileStore(directory, secrets)
    const listed = asPostgres((await store.list())[0])
    assert.equal(listed?.password, '')
    assert.equal(listed.version, 2)
    assert.equal(listed.tlsMode, 'require')
    assert.equal(listed?.credentialState, 'secure')
    assert.equal(
      asPostgres(await store.resolveForConnection(listed)).password,
      'legacy-test-password',
    )
    const disk = await readFile(join(directory, 'connections.json'), 'utf8')
    assert.equal(disk.includes('legacy-test-password'), false)
    assert.equal(Object.hasOwn(JSON.parse(disk)[0], 'password'), false)

    const restarted = new ConnectionProfileStore(directory, secrets)
    const afterRestart = asPostgres((await restarted.list())[0])
    assert.equal(
      asPostgres(await restarted.resolveForConnection(afterRestart)).password,
      'legacy-test-password',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('an existing secure secret wins crash recovery without being overwritten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  secrets.values.set('datasource/pg-one', 'replacement-password')
  await writeFile(
    join(directory, 'connections.json'),
    JSON.stringify([legacyPostgres('legacy-test-password')]),
  )
  try {
    const store = new ConnectionProfileStore(directory, secrets)
    const listed = asPostgres((await store.list())[0])
    assert.equal(
      asPostgres(await store.resolveForConnection(listed)).password,
      'replacement-password',
    )
    assert.equal(
      (await readFile(join(directory, 'connections.json'), 'utf8')).includes(
        'legacy-test-password',
      ),
      false,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('secure credential presence survives unavailable decryption and metadata save', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  secrets.values.set('datasource/pg-one', 'synthetic-password')
  secrets.available = false
  await writeFile(
    join(directory, 'connections.json'),
    JSON.stringify([storedPostgres()]),
  )
  try {
    const store = new ConnectionProfileStore(directory, secrets)
    const listed = asPostgres((await store.list())[0])
    assert.equal(listed.password, '')
    assert.equal(listed.hasPassword, true)
    assert.equal(listed.credentialState, 'secure')

    const renamed = asPostgres(
      await store.upsert({ ...listed, name: 'Renamed Postgres' }),
    )
    assert.equal(renamed.hasPassword, true)
    assert.equal(await secrets.has('datasource', 'pg-one'), true)

    secrets.available = true
    assert.equal(
      asPostgres(await store.resolveForConnection(renamed)).password,
      'synthetic-password',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('retry keeps an authoritative secure credential after unavailable crash recovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  secrets.values.set('datasource/pg-one', 'replacement-password')
  secrets.available = false
  const path = join(directory, 'connections.json')
  await writeFile(
    path,
    JSON.stringify([legacyPostgres('legacy-test-password')]),
  )
  try {
    const store = new ConnectionProfileStore(directory, secrets)
    const legacy = asPostgres((await store.list())[0])
    assert.equal(legacy.credentialState, 'legacy-plaintext')

    secrets.available = true
    const retried = asPostgres(await store.retryMigration('pg-one'))
    assert.equal(retried.credentialState, 'secure')
    assert.equal(
      secrets.values.get('datasource/pg-one'),
      'replacement-password',
    )
    assert.equal(
      (await readFile(path, 'utf8')).includes('legacy-test-password'),
      false,
    )
    assert.equal(
      asPostgres(await store.resolveForConnection(retried)).password,
      'replacement-password',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('unavailable migration stays usable in memory and supports retry and removal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'connections-store-'))
  const secrets = new FakeSecrets()
  secrets.available = false
  const path = join(directory, 'connections.json')
  const original = JSON.stringify([legacyPostgres('legacy-test-password')])
  await writeFile(path, original)
  try {
    const store = new ConnectionProfileStore(directory, secrets)
    const listed = asPostgres((await store.list())[0])
    assert.equal(listed.password, '')
    assert.equal(listed.credentialState, 'legacy-plaintext')
    assert.equal(
      asPostgres(await store.resolveForConnection(listed)).password,
      'legacy-test-password',
    )
    assert.equal(await readFile(path, 'utf8'), original)

    secrets.available = true
    const retried = await store.retryMigration('pg-one')
    assert.equal(asPostgres(retried).credentialState, 'secure')
    assert.equal(
      (await readFile(path, 'utf8')).includes('legacy-test-password'),
      false,
    )

    await writeFile(path, original)
    secrets.available = false
    const removalStore = new ConnectionProfileStore(directory, secrets)
    const legacy = asPostgres((await removalStore.list())[0])
    await removalStore.upsert({ ...legacy, hasPassword: false })
    assert.equal(
      (await readFile(path, 'utf8')).includes('legacy-test-password'),
      false,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('legacy saved connections migrate to versioned PostgreSQL profiles', () => {
  const migrated = migrateStoredProfile({
    id: 'old',
    name: 'Old',
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'reader',
    password: '',
    ssl: false,
    readonly: true,
  })
  assert.equal(migrated.status, 'migrated')
  if (migrated.status !== 'migrated') return
  assert.equal(migrated.profile.kind, 'postgres')
  assert.equal(migrated.profile.version, 2)
  assert.equal(migrated.profile.id, 'old')
  if (migrated.profile.kind === 'postgres')
    assert.equal(migrated.profile.tlsMode, 'disable')
})

test('profiles for unknown future adapters are not reinterpreted as PostgreSQL', () => {
  const stored = { id: 'bq', kind: 'bigquery', version: 1 }
  assert.deepEqual(migrateStoredProfile(stored), {
    status: 'unsupported',
    stored,
  })
})

test('a future PostgreSQL profile version is quarantined unchanged', () => {
  const stored = {
    id: 'future',
    kind: 'postgres',
    version: 3,
    futureOption: true,
  }
  assert.deepEqual(migrateStoredProfile(stored), {
    status: 'unsupported',
    stored,
  })
})

test('PostgreSQL v1 ssl false migrates to v2 TLS disabled', () => {
  const stored = {
    ...legacyPostgres(),
    id: 'current',
    name: 'Current',
    ssl: false,
  }
  const result = migrateStoredProfile(stored)
  assert.equal(result.status, 'migrated')
  if (result.status !== 'migrated' || result.profile.kind !== 'postgres') return
  assert.equal(result.profile.version, 2)
  assert.equal(result.profile.tlsMode, 'disable')
  assert.equal(Object.hasOwn(result.stored, 'ssl'), false)
})

test('PostgreSQL v1 ssl true migrates to v2 require compatibility mode', () => {
  const result = migrateStoredProfile({
    ...legacyPostgres(),
    ssl: true,
  })
  assert.equal(result.status, 'migrated')
  if (result.status !== 'migrated' || result.profile.kind !== 'postgres') return
  assert.equal(result.profile.version, 2)
  assert.equal(result.profile.tlsMode, 'require')
  assert.equal(Object.hasOwn(result.stored, 'ssl'), false)
})

test('a current PostgreSQL v2 profile round-trips unchanged', () => {
  const stored = {
    ...postgres(),
    tlsMode: 'verify-full' as const,
    tlsCa:
      '-----BEGIN CERTIFICATE-----\\nSYNTHETIC-TEST-CA\\n-----END CERTIFICATE-----',
  }
  const result = migrateStoredProfile(stored)
  assert.equal(result.status, 'current')
  if (result.status !== 'current' || result.profile.kind !== 'postgres') return
  assert.equal(result.profile.version, 2)
  assert.equal(result.profile.tlsMode, 'verify-full')
  assert.equal(result.profile.tlsCa, stored.tlsCa)
  assert.equal(result.stored, stored)
})

test('BigQuery billing caps persist and an absent legacy cap migrates to uncapped', () => {
  const capped = {
    id: 'bq',
    name: 'BQ',
    kind: 'bigquery',
    version: 1,
    billingProject: 'billing',
    maximumBytesBilled: '1000',
    readonly: true,
  }
  const current = migrateStoredProfile(capped)
  assert.equal(current.status, 'current')
  if (current.status === 'current' && current.profile.kind === 'bigquery')
    assert.equal(current.profile.maximumBytesBilled, '1000')

  const { maximumBytesBilled: _cap, ...legacy } = capped
  const migrated = migrateStoredProfile(legacy)
  assert.equal(migrated.status, 'migrated')
  if (migrated.status === 'migrated' && migrated.profile.kind === 'bigquery')
    assert.equal(migrated.profile.maximumBytesBilled, '1073741824')
})

test('Tempo gcx profiles persist independently from Prometheus profiles', () => {
  const stored = {
    id: 'traces',
    name: 'Production traces',
    kind: 'tempo',
    version: 1,
    readonly: true,
    transport: { kind: 'gcx', context: 'production' },
  }
  const result = migrateStoredProfile(stored)
  assert.equal(result.status, 'current')
  if (result.status !== 'current') return
  assert.equal(result.profile.kind, 'tempo')
  assert.deepEqual(result.profile.transport, {
    kind: 'gcx',
    context: 'production',
  })
})
test('observability Grafana handoff config and Tempo datasource UID remain optional and round-trip', () => {
  const oldTempo = {
    kind: 'tempo',
    version: 1,
    id: 't1',
    name: 'Traces',
    readonly: true,
    transport: { kind: 'gcx' },
  }
  assert.equal(migrateStoredProfile(oldTempo).status, 'current')
  const configured = {
    ...oldTempo,
    transport: { kind: 'gcx', datasourceUid: 'tempo-main' },
    grafana: {
      baseUrl: 'https://example.com/grafana',
      orgId: 4,
      datasourceType: 'tempo',
    },
  }
  const result = migrateStoredProfile(configured)
  assert.equal(result.status, 'current')
  if (result.status === 'current') assert.deepEqual(result.profile, configured)
})
