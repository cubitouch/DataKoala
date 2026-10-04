import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EncryptedSecretStore,
  SHARED_SECRETS_FILENAME,
} from './store.ts'
import type { Encryption } from './store.ts'

type EncryptionState = {
  available: boolean
  generation: number
  shouldReEncrypt: boolean
}

function fakeEncryption(state: EncryptionState): Encryption {
  return {
    available: async () => state.available,
    encrypt: async (value) =>
      Buffer.from(
        JSON.stringify({
          generation: ++state.generation,
          value,
        }),
      ),
    decrypt: async (value) => {
      const parsed = JSON.parse(value.toString()) as {
        generation: number
        value: string
      }
      return {
        result: parsed.value,
        shouldReEncrypt: state.shouldReEncrypt,
      }
    },
  }
}

async function temporaryStore() {
  const directory = await mkdtemp(join(tmpdir(), 'secret-store-'))
  const state: EncryptionState = {
    available: true,
    generation: 0,
    shouldReEncrypt: false,
  }
  return {
    directory,
    state,
    store: new EncryptedSecretStore(directory, fakeEncryption(state)),
  }
}

test('secret persistence is refused when encryption is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'secret-store-'))
  const state: EncryptionState = {
    available: false,
    generation: 0,
    shouldReEncrypt: false,
  }
  const store = new EncryptedSecretStore(directory, fakeEncryption(state))
  try {
    await assert.rejects(store.set('ai', 'openrouter-api-key', 'secret'), {
      code: 'unavailable',
    })
    await assert.rejects(
      readFile(join(directory, SHARED_SECRETS_FILENAME), 'utf8'),
      { code: 'ENOENT' },
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('secret round trip persists only encrypted bytes with restrictive permissions', async () => {
  const { directory, store } = await temporaryStore()
  try {
    await store.set('ai', 'openrouter-api-key', 'plain-secret')
    assert.equal(await store.has('ai', 'openrouter-api-key'), true)
    assert.equal(
      await store.get('ai', 'openrouter-api-key'),
      'plain-secret',
    )

    const path = join(directory, SHARED_SECRETS_FILENAME)
    const stored = await readFile(path, 'utf8')
    assert.equal(stored.includes('plain-secret'), false)
    if (process.platform !== 'win32')
      assert.equal((await stat(path)).mode & 0o777, 0o600)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('deleting one secret preserves unrelated secrets', async () => {
  const { directory, store } = await temporaryStore()
  try {
    await store.set('ai', 'openrouter-api-key', 'ai-secret')
    await store.set('datasource', 'postgres-one', 'database-secret')
    await store.delete('ai', 'openrouter-api-key')

    assert.equal(await store.has('ai', 'openrouter-api-key'), false)
    assert.equal(await store.get('ai', 'openrouter-api-key'), null)
    assert.equal(
      await store.get('datasource', 'postgres-one'),
      'database-secret',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('multiple owner/id pairs survive replacement and restart', async () => {
  const { directory, state, store } = await temporaryStore()
  try {
    await store.set('ai', 'openrouter-api-key', 'ai-secret')
    await store.set('datasource', 'postgres-one', 'first-password')
    await store.set('datasource', 'postgres-two', 'second-password')
    await store.set('datasource', 'postgres-one', 'replacement-password')

    const restarted = new EncryptedSecretStore(
      directory,
      fakeEncryption(state),
    )
    assert.equal(
      await restarted.get('ai', 'openrouter-api-key'),
      'ai-secret',
    )
    assert.equal(
      await restarted.get('datasource', 'postgres-one'),
      'replacement-password',
    )
    assert.equal(
      await restarted.get('datasource', 'postgres-two'),
      'second-password',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('concurrent writes cannot discard another secret update', async () => {
  const { directory, store } = await temporaryStore()
  try {
    await Promise.all([
      store.set('ai', 'openrouter-api-key', 'ai-secret'),
      store.set('datasource', 'postgres-one', 'first-password'),
      store.set('datasource', 'postgres-two', 'second-password'),
    ])

    assert.equal(
      await store.get('ai', 'openrouter-api-key'),
      'ai-secret',
    )
    assert.equal(
      await store.get('datasource', 'postgres-one'),
      'first-password',
    )
    assert.equal(
      await store.get('datasource', 'postgres-two'),
      'second-password',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('reading a secret rewrites ciphertext when re-encryption is requested', async () => {
  const { directory, state, store } = await temporaryStore()
  try {
    await store.set('ai', 'openrouter-api-key', 'plain-secret')
    const path = join(directory, SHARED_SECRETS_FILENAME)
    const before = await readFile(path, 'utf8')

    state.shouldReEncrypt = true
    assert.equal(
      await store.get('ai', 'openrouter-api-key'),
      'plain-secret',
    )
    const after = await readFile(path, 'utf8')

    assert.notEqual(after, before)
    assert.equal(after.includes('plain-secret'), false)
    assert.equal(state.generation, 2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('malformed persistence fails safely without destroying unrelated records', async () => {
  const { directory, store } = await temporaryStore()
  const path = join(directory, SHARED_SECRETS_FILENAME)
  try {
    await store.set('ai', 'openrouter-api-key', 'ai-secret')
    const stored = JSON.parse(await readFile(path, 'utf8')) as {
      version: number
      secrets: unknown[]
    }
    stored.secrets.unshift({ owner: 'datasource', broken: true })
    await writeFile(path, JSON.stringify(stored), { mode: 0o600 })

    assert.equal(
      await store.get('ai', 'openrouter-api-key'),
      'ai-secret',
    )
    const preserved = JSON.parse(await readFile(path, 'utf8')) as {
      secrets: unknown[]
    }
    assert.deepEqual(preserved.secrets[0], {
      owner: 'datasource',
      broken: true,
    })

    const targeted = preserved.secrets.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { owner?: unknown }).owner === 'ai',
    ) as { encrypted?: unknown } | undefined
    assert.ok(targeted)
    targeted.encrypted = 'not-base64!'
    await writeFile(path, JSON.stringify(preserved), { mode: 0o600 })
    await assert.rejects(store.get('ai', 'openrouter-api-key'), {
      code: 'invalid-persistence',
    })
    assert.equal(
      (await readFile(path, 'utf8')).includes('not-base64!'),
      true,
    )

    await writeFile(path, '{malformed', { mode: 0o600 })
    await assert.rejects(store.has('ai', 'openrouter-api-key'), {
      code: 'invalid-persistence',
    })
    assert.equal(await readFile(path, 'utf8'), '{malformed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
