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
import {
  AI_LIMITS,
  type AiBuilderProposalRequest,
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
  intent: 'generate',
  prompt: 'count orders',
  context: { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
}
const builderRequest: AiBuilderProposalRequest = {
  requestId: 'builder-req',
  prompt: 'sum revenue by country',
  state: {
    relation: { schema: 'public', name: 'orders' },
    xColumn: 'created_at',
    valueColumn: null,
    aggregation: 'count',
    timeColumn: 'created_at',
    timeBucket: 'day',
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
  },
  columns: [
    { name: 'created_at', dataType: 'timestamptz' },
    { name: 'country', dataType: 'text' },
    { name: 'revenue', dataType: 'numeric' },
  ],
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

test('OpenRouter query generation identifies each canonical SQL dialect without changing the structured schema', async () => {
  const cases = [
    ['postgres', /PostgreSQL/],
    ['duckdb', /DuckDB SQL/],
    ['google-sql', /GoogleSQL \/ BigQuery Standard SQL/],
  ] as const
  let expectedSchema = ''
  for (const [dialect, expected] of cases) {
    let sent: Record<string, unknown> | undefined
    const provider = new OpenRouterProvider(
      'key',
      'model',
      async (_url, init) => {
        sent = JSON.parse(String(init?.body))
        return completion()
      },
    )
    await provider.proposeQuery(
      {
        ...request,
        currentQuery: 'SELECT * FROM public.orders',
        context: {
          ...request.context,
          language: { kind: 'sql', dialect },
        },
      },
      signal(),
    )
    const serializedMessages = JSON.stringify(sent?.messages)
    assert.match(serializedMessages, expected)
    if (dialect !== 'postgres')
      assert.doesNotMatch(serializedMessages, /Generate PostgreSQL/)
    const schema = JSON.stringify(
      (sent?.response_format as { json_schema?: { schema?: unknown } })
        .json_schema?.schema,
    )
    if (!expectedSchema) expectedSchema = schema
    else assert.equal(schema, expectedSchema)
  }
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

test('OpenRouter Builder proposals use a dedicated SQL-free structured contract without oneOf', async () => {
  let sent: Record<string, unknown> | undefined
  const provider = new OpenRouterProvider(
    'key',
    'model',
    async (_url, init) => {
      sent = JSON.parse(String(init?.body))
      return completion({
        kind: 'proposal',
        patch: {
          xColumn: 'country',
          valueColumn: 'revenue',
          aggregation: 'sum',
        },
        explanation: 'Sum revenue by country.',
        assumptions: [],
        reason: '',
      })
    },
  )

  assert.deepEqual(await provider.proposeBuilder(builderRequest, signal()), {
    kind: 'proposal',
    proposal: {
      patch: {
        xColumn: 'country',
        valueColumn: 'revenue',
        aggregation: 'sum',
      },
      explanation: 'Sum revenue by country.',
      assumptions: [],
    },
  })

  const schema = (
    sent?.response_format as {
      json_schema?: { schema?: Record<string, unknown> }
    }
  ).json_schema?.schema
  assert.equal(JSON.stringify(schema).includes('oneOf'), false)
  assert.match(
    JSON.stringify(sent?.messages),
    /Return Builder changes, never SQL/,
  )
  assert.match(
    JSON.stringify(sent?.messages),
    /number of X.*count measure.*X axis/i,
  )
  assert.match(
    JSON.stringify(sent?.messages),
    /number of collections over the last 7 days grouped hourly/i,
  )
  assert.equal(JSON.stringify(sent).includes('test-placeholder'), false)
})

test('OpenRouter normalizes a mistaken categorical X for count-over-time requests', async () => {
  const provider = new OpenRouterProvider('key', 'model', async () =>
    completion({
      kind: 'proposal',
      patch: {
        xColumn: 'country',
        aggregation: 'count',
        timeBucket: 'hour',
        timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
      },
      explanation: 'Count collections hourly.',
      assumptions: [],
      reason: '',
    }),
  )

  assert.deepEqual(
    await provider.proposeBuilder(
      {
        ...builderRequest,
        prompt: 'number of collections over the last 7 days grouped hourly',
      },
      signal(),
    ),
    {
      kind: 'proposal',
      proposal: {
        patch: { timeBucket: 'hour' },
        explanation: 'Count collections hourly.',
        assumptions: [],
      },
    },
  )
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
      settings = new AiSettingsStore(directory, secrets, memoryEncryption)
    let tested = ''
    const service = new AiService(settings, (key, model) => ({
      listModels: async () => [],
      test: async () => {
        tested = `${key}:${model}`
      },
      proposeQuery: async () => proposalStep,
      proposeBuilder: async () => {
        throw new Error('not used in query tests')
      },
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
    assert.deepEqual(
      await new AiSettingsStore(directory, secrets, memoryEncryption).get(),
      {
        provider: 'openrouter',
        model: 'missing-from-catalog',
        hasApiKey: true,
      },
    )
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
    const settings = new AiSettingsStore(directory, secrets, memoryEncryption)

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

test('replacement OpenRouter key wins over an in-flight legacy migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-legacy-race-'))
  try {
    await writeLegacySecret(directory, 'legacy-key')
    const memory = new MemorySecrets()
    let migrationReached!: () => void
    let releaseMigration!: () => void
    const reached = new Promise<void>((resolve) => {
      migrationReached = resolve
    })
    const released = new Promise<void>((resolve) => {
      releaseMigration = resolve
    })
    let pauseFirstHas = true
    const secrets: SecretStore = {
      has: async (owner, id) => {
        const result = await memory.has(owner, id)
        if (pauseFirstHas) {
          pauseFirstHas = false
          migrationReached()
          await released
        }
        return result
      },
      get: (owner, id) => memory.get(owner, id),
      set: (owner, id, value) => memory.set(owner, id, value),
      delete: (owner, id) => memory.delete(owner, id),
    }
    const settings = new AiSettingsStore(directory, secrets, memoryEncryption)

    const migration = settings.get()
    await reached
    const replacement = settings.save({
      model: 'replacement-model',
      apiKey: 'replacement-key',
    })
    releaseMigration()

    await Promise.all([migration, replacement])
    assert.equal(
      await memory.get('ai', 'openrouter-api-key'),
      'replacement-key',
    )
    assert.equal(await settings.getApiKey(), 'replacement-key')
    await assert.rejects(readFile(join(directory, 'ai-secrets.json'), 'utf8'), {
      code: 'ENOENT',
    })
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
    const settings = new AiSettingsStore(directory, secrets, memoryEncryption)

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

    assert.equal(await settings.getApiKey(), 'legacy-key')
    assert.deepEqual(await settings.save({ model: 'updated', apiKey: '' }), {
      provider: 'openrouter',
      model: 'updated',
      hasApiKey: true,
    })
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
  const settings = new AiSettingsStore(
    directory,
    new MemorySecrets(),
    memoryEncryption,
  )
  let hang = true
  const service = new AiService(
    settings,
    () => ({
      listModels: async () => (hang ? new Promise(() => {}) : []),
      test: async () => {},
      proposeQuery: async () => proposalStep,
      proposeBuilder: async () => {
        throw new Error('not used in query tests')
      },
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
        language: { kind: 'sql', dialect: 'mysql' },
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

test('generation validation accepts only canonical SQL dialects and reconstructs the allowlisted context', () => {
  for (const dialect of ['postgres', 'duckdb', 'google-sql'] as const) {
    const clean = proposalRequest({
      ...request,
      profile: {
        path: '/Users/example/private/customer-data.csv',
        password: 'secret',
      },
      context: {
        ...request.context,
        language: { kind: 'sql', dialect },
        connectionString: 'secret',
      },
    })
    assert.equal(clean.context.language.dialect, dialect)
    assert.equal(
      JSON.stringify(clean).includes(
        '/Users/example/private/customer-data.csv',
      ),
      false,
    )
    assert.equal(JSON.stringify(clean).includes('connectionString'), false)
  }
  assert.throws(() =>
    proposalRequest({
      ...request,
      context: {
        ...request.context,
        language: { kind: 'promql' },
      },
    }),
  )
})

test('repair validation enforces intent and sanitizes error context again', () => {
  const clean = proposalRequest({
    requestId: 'repair',
    intent: 'repair',
    currentQuery: 'SELECT device_id FROM orders',
    error:
      'ERROR: column orders.device_id does not exist SQLSTATE 42703 password=hunter2',
    context: request.context,
  })
  assert.equal(clean.intent, 'repair')
  assert.match(clean.error ?? '', /SQLSTATE 42703/)
  assert.equal(clean.error?.includes('hunter2'), false)
  assert.throws(() => proposalRequest({ ...request, intent: 'repair' }))
  assert.throws(() => proposalRequest({ ...request, error: 'not allowed' }))
  for (const dialect of ['duckdb', 'google-sql'] as const)
    assert.throws(() =>
      proposalRequest({
        requestId: 'repair',
        intent: 'repair',
        currentQuery: 'SELECT * FROM orders',
        error: 'syntax error',
        context: {
          ...request.context,
          language: { kind: 'sql', dialect },
        },
      }),
    )
})
