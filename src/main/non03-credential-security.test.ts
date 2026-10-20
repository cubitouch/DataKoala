import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EncryptedSecretStore } from './secrets/store.ts'
import type { Encryption } from './secrets/store.ts'
import { AiSettingsStore } from './ai/settings.ts'
import { BigQueryDiscoveryService } from './bigquery-discovery.ts'
import { BigQueryAdapter } from './adapters/bigquery-adapter.ts'
import { BigQueryProviderError } from './bigquery-errors.ts'

const encryption: Encryption = {
  available: async () => true,
  encrypt: async (value) => Buffer.from(value),
  decrypt: async (value) => ({
    result: value.toString(),
    shouldReEncrypt: false,
  }),
}

// Characterization evidence only: this reversible fake is NOT encryption.
test('NON03 backend failures redact synthetic sensitive exception text and preserve ciphertext', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'non03-'))
  try {
    const store = new EncryptedSecretStore(directory, encryption)
    await store.set('ai', 'key', 'SYNTHETIC_NON03')
    const path = join(directory, 'secrets.json')
    const before = await readFile(path, 'utf8')
    for (const operation of ['available', 'encrypt', 'decrypt'] as const) {
      const failing = new EncryptedSecretStore(directory, {
        ...encryption,
        [operation]: async () => {
          throw new Error('SYNTHETIC_NON03')
        },
      })
      await assert.rejects(
        operation === 'encrypt'
          ? failing.set('ai', 'key', 'replacement')
          : failing.get('ai', 'key'),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.message.includes('SYNTHETIC_NON03'), false)
          return true
        },
      )
      assert.equal(await readFile(path, 'utf8'), before)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('NON03 corrupted AI legacy data is retained, cannot become a key, and can be explicitly removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'non03-'))
  try {
    const path = join(directory, 'ai-secrets.json')
    await writeFile(path, '{SYNTHETIC_BROKEN_LEGACY')
    const settings = new AiSettingsStore(
      directory,
      new EncryptedSecretStore(directory, encryption),
      encryption,
    )
    assert.equal((await settings.get()).hasApiKey, true)
    await assert.rejects(settings.getApiKey(), { code: 'invalid-persistence' })
    assert.equal(await readFile(path, 'utf8'), '{SYNTHETIC_BROKEN_LEGACY')
    assert.equal((await settings.removeApiKey()).hasApiKey, false)
    await assert.rejects(readFile(path), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('NON03 missing ADC and revoked auth fail discovery without creating a dataset client', async () => {
  for (const message of [
    'Could not load default credentials',
    'invalid_grant: revoked synthetic credential',
  ]) {
    const failure = new Error(message)
    const service = new BigQueryDiscoveryService(
      () => {
        throw new Error('must not construct dataset client')
      },
      {
        getProjectId: async () => {
          throw failure
        },
        getClient: async () => {
          throw failure
        },
      } as never,
    )
    await assert.rejects(
      service.discoverDefaults(),
      (error) =>
        error instanceof BigQueryProviderError && error.cause === failure,
    )
    await assert.rejects(
      service.discoverProjects(),
      (error) =>
        error instanceof BigQueryProviderError && error.cause === failure,
    )
  }
})

test('NON03 authentication guidance omits unnecessary raw synthetic provider text without claiming credential leakage', async () => {
  const adapter = new BigQueryAdapter(
    () =>
      ({
        getDatasets: async () => {
          throw Object.assign(
            new Error('credential rejected token=SYNTHETIC_NON03_TOKEN'),
            { code: 401 },
          )
        },
      }) as never,
  )
  const result = await adapter.test({
    kind: 'bigquery',
    version: 1,
    id: 'non03',
    name: 'Synthetic',
    billingProject: 'synthetic-billing',
    maximumBytesBilled: '',
    readonly: true,
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.error, /Application Default Credentials/)
    assert.equal(result.error.includes('SYNTHETIC_NON03_TOKEN'), false)
  }
})
