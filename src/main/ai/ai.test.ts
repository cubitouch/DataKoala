import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiSettingsStore } from './settings.ts'
import { EncryptedSecretStore } from '../secrets/store.ts'
import type { Encryption, SecretOwner, SecretStore } from '../secrets/store.ts'
import { AiService } from './service.ts'
import { OpenRouterProvider } from './openrouter.ts'
import { proposalRequest } from './validation.ts'
import type { AiQueryProposalRequest } from '../../shared/ai.ts'
const valid = {
  query: 'SELECT count(*) FROM public.orders',
  explanation: 'Counts orders.',
  assumptions: [],
}
const request: AiQueryProposalRequest = {
  requestId: 'req',
  prompt: 'count orders',
  context: { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
}
class MemorySecrets implements SecretStore {
  private values = new Map<string, string>()
  private key(owner: SecretOwner, id: string) {
    return `${owner}:${id}`
  }
  async has(owner: SecretOwner, id: string) {
    return this.values.has(this.key(owner, id))
  }
  async get(owner: SecretOwner, id: string) {
    return this.values.get(this.key(owner, id)) ?? null
  }
  async set(owner: SecretOwner, id: string, value: string) {
    this.values.set(this.key(owner, id), value)
  }
  async delete(owner: SecretOwner, id: string) {
    this.values.delete(this.key(owner, id))
  }
}
const memoryEncryption: Encryption = {
  available: async () => true,
  encrypt: async (value) => Buffer.from(value),
  decrypt: async (value) => ({
    result: value.toString(),
    shouldReEncrypt: false,
  }),
}
async function writeLegacySecret(directory: string, value: string) {
  const encrypted = await memoryEncryption.encrypt(value)
  await writeFile(
    join(directory, 'ai-secrets.json'),
    JSON.stringify({ version: 1, encrypted: encrypted.toString('base64') }),
    { mode: 0o600 },
  )
}
const completion = (content: unknown = valid) =>
  Response.json({
    choices: [
      {
        message: {
          content:
            typeof content === 'string' ? content : JSON.stringify(content),
        },
      },
    ],
  })
const signal = () => new AbortController().signal

test('OpenRouter models, structured request and proposal parsing use only explicit query context', async () => {
  let sent: Record<string, unknown> | undefined
  const provider = new OpenRouterProvider(
    'test-placeholder',
    'vendor/model',
    async (url, init) => {
      if (String(url).endsWith('/models'))
        return Response.json({
          data: [{ id: 'z', name: 'Zebra' }, { id: 'a' }, {}, null],
        })
      sent = JSON.parse(String(init?.body))
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer test-placeholder',
      )
      return completion()
    },
  )
  assert.deepEqual(await provider.listModels(signal()), [
    { id: 'a', name: 'a' },
    { id: 'z', name: 'Zebra' },
  ])
  assert.deepEqual(await provider.proposeQuery(request, signal()), valid)
  assert.deepEqual(sent?.provider, { require_parameters: true })
  assert.equal((sent?.response_format as { type: string }).type, 'json_schema')
  assert.equal(sent?.model, 'vendor/model')
  assert.equal(JSON.stringify(sent).includes('test-placeholder'), false)
  await provider.test(signal())
  assert.equal(sent?.max_tokens, 256)
})
for (const [status, code] of [
  [401, 'authentication'],
  [403, 'authentication'],
  [429, 'rate-limit'],
  [400, 'model'],
  [404, 'model'],
  [500, 'provider'],
] as const) {
  test(`HTTP ${status} is normalized without leaking provider content`, async () => {
    const provider = new OpenRouterProvider(
      'secret',
      'model',
      async () => new Response('secret provider payload', { status }),
    )
    await assert.rejects(
      provider.proposeQuery(request, signal()),
      (error: { code?: string; message?: string }) =>
        error.code === code && !error.message?.includes('secret'),
    )
  })
}
for (const content of [
  'not json',
  { ...valid, query: 1 },
  { explanation: 'no query', assumptions: [] },
  { ...valid, assumptions: [1] },
  { ...valid, extra: 'field' },
]) {
  test(`rejects malformed structured output ${JSON.stringify(content)}`, async () => {
    const provider = new OpenRouterProvider('key', 'model', async () =>
      completion(content),
    )
    await assert.rejects(provider.proposeQuery(request, signal()), {
      code: 'invalid-response',
    })
  })
}
test('malformed outer JSON is normalized', async () => {
  const provider = new OpenRouterProvider(
    'key',
    'model',
    async () => new Response('{bad'),
  )
  await assert.rejects(provider.proposeQuery(request, signal()), {
    code: 'invalid-response',
  })
})
test('settings preserve the model and blank key; tests do not save; removal deletes credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-settings-'))
  try {
    const secrets = new MemorySecrets(),
      settings = new AiSettingsStore(directory, secrets, memoryEncryption)
    let tested = ''
    const service = new AiService(settings, (key, model) => ({
      listModels: async () => [],
      test: async () => {
        tested = `${key}:${model}`
      },
      proposeQuery: async () => valid,
    }))
    await service.saveSettings({ model: 'old', apiKey: 'saved-key' })
    await service.test(1, 'test', { model: 'new', apiKey: 'draft-key' })
    assert.equal(tested, 'draft-key:new')
    assert.deepEqual(await settings.get(), {
      provider: 'openrouter',
      model: 'old',
      hasApiKey: true,
    })
    await service.saveSettings({ model: 'missing-from-catalog', apiKey: '' })
    assert.equal(await secrets.get('ai', 'openrouter-api-key'), 'saved-key')
    assert.deepEqual(await new AiSettingsStore(directory, secrets, memoryEncryption).get(), {
      provider: 'openrouter',
      model: 'missing-from-catalog',
      hasApiKey: true,
    })
    assert.equal(
      JSON.stringify(await service.getSettings()).includes('saved-key'),
      false,
    )
    assert.equal(
      (await readFile(join(directory, 'ai-settings.json'), 'utf8')).includes(
        'saved-key',
      ),
      false,
    )
    await service.removeApiKey()
    assert.equal(await secrets.get('ai', 'openrouter-api-key'), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('legacy OpenRouter secret migrates once and survives restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-legacy-secret-'))
  try {
    await writeLegacySecret(directory, 'legacy-key')
    const secrets = new EncryptedSecretStore(directory, memoryEncryption)
    const settings = new AiSettingsStore(
      directory,
      secrets,
      memoryEncryption,
    )

    assert.equal(await settings.getApiKey(), 'legacy-key')
    await assert.rejects(readFile(join(directory, 'ai-secrets.json'), 'utf8'), {
      code: 'ENOENT',
    })

    const restarted = new AiSettingsStore(
      directory,
      new EncryptedSecretStore(directory, memoryEncryption),
      memoryEncryption,
    )
    assert.equal(await restarted.getApiKey(), 'legacy-key')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('legacy OpenRouter migration never overwrites an existing shared secret', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-legacy-secret-'))
  try {
    await writeLegacySecret(directory, 'legacy-key')
    const secrets = new EncryptedSecretStore(directory, memoryEncryption)
    await secrets.set('ai', 'openrouter-api-key', 'shared-key')
    const settings = new AiSettingsStore(
      directory,
      secrets,
      memoryEncryption,
    )

    assert.equal(await settings.getApiKey(), 'shared-key')
    await assert.rejects(readFile(join(directory, 'ai-secrets.json'), 'utf8'), {
      code: 'ENOENT',
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('failed legacy migration leaves the legacy secret untouched', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-legacy-secret-'))
  try {
    await writeLegacySecret(directory, 'legacy-key')
    const failingSecrets: SecretStore = {
      has: async () => false,
      get: async () => null,
      set: async () => {
        throw new Error('write failed')
      },
      delete: async () => {},
    }
    const settings = new AiSettingsStore(
      directory,
      failingSecrets,
      memoryEncryption,
    )

    await assert.rejects(settings.getApiKey())
    assert.equal(
      (await readFile(join(directory, 'ai-secrets.json'), 'utf8')).includes(
        Buffer.from('legacy-key').toString('base64'),
      ),
      true,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('unavailable encryption keeps the legacy secret and summary intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-legacy-secret-'))
  const unavailable: Encryption = {
    ...memoryEncryption,
    available: async () => false,
  }
  try {
    await writeLegacySecret(directory, 'legacy-key')
    const settings = new AiSettingsStore(
      directory,
      new EncryptedSecretStore(directory, unavailable),
      unavailable,
    )

    assert.equal((await settings.get()).hasApiKey, true)
    await assert.rejects(settings.getApiKey(), { code: 'unavailable' })
    assert.equal(
      (await readFile(join(directory, 'ai-secrets.json'), 'utf8')).length > 0,
      true,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('timeout, owner-scoped cancellation, duplicate protection and all completion paths clean up requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-service-'))
  const settings = new AiSettingsStore(directory, new MemorySecrets(), memoryEncryption)
  let hang = true
  const service = new AiService(
    settings,
    () => ({
      listModels: async () => (hang ? new Promise(() => {}) : []),
      test: async () => {},
      proposeQuery: async () => valid,
    }),
    25,
  )
  try {
    const pending = service.listModels(1, 'same')
    const duplicate = await service.listModels(1, 'same')
    assert.equal(duplicate.ok, false)
    await service.cancel(2, 'same')
    const timeout = await pending
    assert.equal(timeout.ok ? '' : timeout.code, 'timeout')
    const cancelled = service.listModels(1, 'same')
    await service.cancel(1, 'same')
    const result = await cancelled
    assert.equal(result.ok ? '' : result.code, 'cancelled')
    const destroyed = service.listModels(1, 'same')
    service.cancelOwner(1)
    assert.equal((await destroyed).ok, false)
    hang = false
    assert.deepEqual(await service.listModels(1, 'same'), {
      ok: true,
      value: [],
    })
    assert.deepEqual(await service.listModels(1, 'same'), {
      ok: true,
      value: [],
    })
    const failure = new AiService(settings, () => {
      throw new Error('sensitive key')
    })
    assert.equal(
      JSON.stringify(await failure.listModels(1, 'same')).includes(
        'sensitive key',
      ),
      false,
    )
    assert.equal(
      JSON.stringify(await failure.listModels(1, 'same')).includes(
        'already running',
      ),
      false,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('IPC validation allowlists metadata and rejects oversized or unsupported context', () => {
  const clean = proposalRequest({
    ...request,
    password: 'secret',
    rows: [{ private: true }],
    context: {
      ...request.context,
      hostname: 'secret-host',
      relations: [
        {
          schema: 'public',
          name: 'orders',
          kind: 'table',
          password: 'secret',
          columns: [{ name: 'id', dataType: 'uuid', values: ['private'] }],
        },
      ],
    },
  })
  assert.equal(JSON.stringify(clean).includes('secret'), false)
  assert.equal(JSON.stringify(clean).includes('private'), false)
  assert.throws(() =>
    proposalRequest({
      ...request,
      context: {
        ...request.context,
        language: { kind: 'sql', dialect: 'bigquery' },
      },
    }),
  )
  assert.throws(() => proposalRequest({ ...request, prompt: 'x'.repeat(8001) }))
  assert.throws(() =>
    proposalRequest({
      ...request,
      context: {
        ...request.context,
        relations: Array(9).fill(clean.context.relations[0]),
      },
    }),
  )
})
