import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiSettingsStore, EncryptedSecretStore } from './settings.ts'
import type { SecretStore } from './settings.ts'
import { AiService } from './service.ts'
import { OpenRouterProvider } from './openrouter.ts'
import { proposalRequest } from './validation.ts'
import {
  AI_LIMITS,
  type AiQueryProposalRequest,
  type AiQueryStep,
} from '../../shared/ai.ts'

const proposal = {
  query: 'SELECT count(*) FROM public.orders',
  explanation: 'Counts orders.',
  assumptions: [],
}
const proposalWire = {
  kind: 'proposal',
  ...proposal,
  searchTerms: [],
  reason: '',
}
const proposalStep: AiQueryStep = { kind: 'proposal', proposal }
const contextRequestWire = {
  kind: 'context-request',
  query: '',
  explanation: '',
  assumptions: [],
  searchTerms: ['device'],
  reason: 'The request mentions device but no matching metadata was supplied.',
}
const request: AiQueryProposalRequest = {
  requestId: 'req',
  prompt: 'count orders',
  context: { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
}
class MemorySecrets implements SecretStore {
  value: string | null = null
  async has() {
    return this.value !== null
  }
  async get() {
    return this.value
  }
  async set(value: string) {
    this.value = value
  }
  async delete() {
    this.value = null
  }
}
const completion = (content: unknown = proposalWire) =>
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
  assert.deepEqual(await provider.proposeQuery(request, signal()), proposalStep)
  assert.deepEqual(sent?.provider, { require_parameters: true })
  assert.equal((sent?.response_format as { type: string }).type, 'json_schema')
  const responseFormat = sent?.response_format as {
    json_schema?: { schema?: Record<string, unknown> }
  }
  assert.equal(
    JSON.stringify(responseFormat.json_schema?.schema).includes('oneOf'),
    false,
  )
  assert.equal(sent?.model, 'vendor/model')
  assert.equal(JSON.stringify(sent).includes('test-placeholder'), false)
  assert.match(JSON.stringify(sent?.messages), /context-request/)
  await provider.test(signal())
  assert.equal(sent?.max_tokens, 256)
})

test('OpenRouter normalizes a bounded context request into the provider-neutral step', async () => {
  const provider = new OpenRouterProvider('key', 'model', async () =>
    completion(contextRequestWire),
  )
  assert.deepEqual(await provider.proposeQuery(request, signal()), {
    kind: 'context-request',
    request: {
      searchTerms: ['device'],
      reason: contextRequestWire.reason,
    },
  })
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
  proposal,
  { ...proposalWire, query: 1 },
  { ...proposalWire, assumptions: [1] },
  { ...proposalWire, extra: 'field' },
  { ...proposalWire, searchTerms: ['device'] },
  { ...contextRequestWire, query: 'SELECT * FROM devices' },
  { ...contextRequestWire, searchTerms: [] },
  {
    ...contextRequestWire,
    searchTerms: Array(AI_LIMITS.contextRequestTerms + 1).fill('device'),
  },
  {
    ...contextRequestWire,
    searchTerms: ['x'.repeat(AI_LIMITS.contextRequestTermCharacters + 1)],
  },
  {
    ...contextRequestWire,
    reason: 'x'.repeat(AI_LIMITS.contextRequestReason + 1),
  },
  { ...contextRequestWire, searchTerms: ['SELECT * FROM devices'] },
  { ...contextRequestWire, searchTerms: ['ipc'] },
  { ...contextRequestWire, searchTerms: ['password'] },
  { ...contextRequestWire, searchTerms: ['describeTable'] },
]) {
  test(`rejects malformed structured output ${JSON.stringify(content).slice(0, 120)}`, async () => {
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
      settings = new AiSettingsStore(directory, secrets)
    let tested = ''
    const service = new AiService(settings, (key, model) => ({
      listModels: async () => [],
      test: async () => {
        tested = `${key}:${model}`
      },
      proposeQuery: async () => proposalStep,
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
    assert.equal(await secrets.get(), 'saved-key')
    assert.deepEqual(await new AiSettingsStore(directory, secrets).get(), {
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
    assert.equal(await secrets.get(), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('secret persistence requires encryption and deletion removes the encrypted file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-secret-'))
  let available = false,
    encryptedValue = ''
  const secrets = new EncryptedSecretStore(directory, {
    available: async () => available,
    encrypt: async (value) => {
      encryptedValue = value
      return Buffer.from('opaque-ciphertext')
    },
    decrypt: async () => ({ result: encryptedValue, shouldReEncrypt: false }),
  })
  try {
    await assert.rejects(secrets.set('placeholder-key'), {
      code: 'configuration',
    })
    assert.equal(await secrets.has(), false)
    available = true
    await secrets.set('placeholder-key')
    const stored = await readFile(join(directory, 'ai-secrets.json'), 'utf8')
    assert.equal(stored.includes('placeholder-key'), false)
    assert.equal(await secrets.get(), 'placeholder-key')
    await secrets.delete()
    assert.equal(await secrets.has(), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('timeout, owner-scoped cancellation, duplicate protection and all completion paths clean up requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-service-'))
  const settings = new AiSettingsStore(directory, new MemorySecrets())
  let hang = true
  const service = new AiService(
    settings,
    () => ({
      listModels: async () => (hang ? new Promise(() => {}) : []),
      test: async () => {},
      proposeQuery: async () => proposalStep,
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
