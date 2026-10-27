import { createQuerySession, useStore } from '@store/useStore'
import {
  captureAiBuilderSnapshot,
  prepareAiBuilderContext,
} from '@lib/ai/builderWorkflow'
import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { IPC } from '../../shared/ipc-channels'
import { AI_LIMITS, type AiResult } from '../../shared/ai'
import { registerAiIpc } from './ipc'

type Handler = (
  event: unknown,
  ...args: unknown[]
) => Promise<AiResult<unknown>>
const harness = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  settings: vi.fn(async () => ({ model: 'test/model', hasApiKey: true })),
  key: vi.fn(async () => 'synthetic-key'),
}))
vi.mock('@lib/api', () => ({ api: {} }))
vi.mock('electron', () => ({
  app: { getPath: () => '/unused-test-directory' },
  ipcMain: {
    handle: (channel: string, handler: Handler) =>
      harness.handlers.set(channel, handler),
  },
}))
vi.mock('../secrets/electron-encryption', () => ({
  createElectronEncryption: () => ({}),
}))
vi.mock('./settings', () => ({
  AiSettingsStore: class {
    get = harness.settings
    getApiKey = harness.key
  },
}))

const query = {
  requestId: 'same',
  intent: 'generate',
  prompt: 'count',
  context: { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
}
const builder = {
  requestId: 'same',
  prompt: 'count',
  state: {
    relation: { schema: 'public', name: 'orders' },
    xColumn: null,
    valueColumn: null,
    aggregation: 'count',
    timeColumn: null,
    timeBucket: 'day',
  },
  columns: [{ name: 'country', dataType: 'text' }],
}
const anomaly = {
  requestId: 'same',
  chart: {
    chartType: 'line',
    xColumn: 'x',
    valueColumn: 'y',
    series: [
      {
        name: 's',
        originalPointCount: 3,
        validPointCount: 3,
        sampleCoverage: 1,
        samplingMethod: 'all-points',
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      },
    ],
  },
}
const plan = {
  requestId: 'same',
  sql: 'SELECT 1',
  mode: 'explain',
  plan: { truncated: false, nodes: [{ id: '0', nodeType: 'Result' }] },
}
const cases = [
  {
    channel: IPC.AI_PROPOSE,
    request: query,
    wire: {
      kind: 'proposal',
      query: 'SELECT 1',
      explanation: '',
      assumptions: [],
      searchTerms: [],
      reason: '',
    },
    message:
      'The model returned an invalid query step. Try again or choose another model.',
  },
  {
    channel: IPC.AI_PROPOSE_BUILDER,
    request: builder,
    wire: {
      kind: 'proposal',
      patch: {},
      explanation: '',
      assumptions: [],
      reason: '',
    },
    message:
      'The model returned an invalid Builder proposal. Try again or choose another model.',
  },
  {
    channel: IPC.AI_ANALYZE_ANOMALIES,
    request: anomaly,
    wire: { summary: 'summary', anomalies: [], limitations: [], followUps: [] },
    message:
      'The model returned an invalid anomaly analysis. Try again or choose another model.',
  },
  {
    channel: IPC.AI_ANALYZE_PLAN,
    request: plan,
    wire: { summary: 'summary', hints: [] },
    message:
      'The model returned invalid or ungrounded performance hints. Try again or choose another model.',
  },
]
const completion = (wire: unknown) =>
  Response.json({
    choices: [
      {
        message: {
          content: typeof wire === 'string' ? wire : JSON.stringify(wire),
        },
      },
    ],
  })
const fetcher = vi.fn<typeof fetch>()
class Sender extends EventEmitter {
  constructor(public id: number) {
    super()
  }
}
let sender: Sender
const invoke = (channel: string, input: unknown, owner = sender) => {
  const handler = harness.handlers.get(channel)
  expect(handler).toBeDefined()
  return handler!({ sender: owner }, input)
}
beforeEach(() => {
  harness.handlers.clear()
  harness.settings.mockClear()
  harness.key.mockClear()
  fetcher.mockReset()
  vi.stubGlobal('fetch', fetcher)
  sender = new Sender(1)
  registerAiIpc()
})
afterEach(() => {
  sender.emit('destroyed')
  vi.unstubAllGlobals()
})

for (const capability of cases) {
  test(`${capability.channel}: malformed IPC input rejects before settings or provider access`, async () => {
    for (const payload of [
      null,
      [],
      { ...capability.request, requestId: 42 },
    ]) {
      expect(await invoke(capability.channel, payload)).toMatchObject({
        ok: false,
        code: 'validation',
      })
    }
    expect(harness.settings).not.toHaveBeenCalled()
    expect(harness.key).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })
  test(`${capability.channel}: cross-capability and extra response fields never publish, retry recovers`, async () => {
    for (const other of cases.filter((item) => item !== capability)) {
      fetcher.mockResolvedValueOnce(completion(other.wire))
      expect(await invoke(capability.channel, capability.request)).toEqual({
        ok: false,
        code: 'invalid-response',
        message: capability.message,
      })
    }
    fetcher.mockResolvedValueOnce(
      completion({ ...capability.wire, injected: 'secret' }),
    )
    expect(await invoke(capability.channel, capability.request)).toEqual({
      ok: false,
      code: 'invalid-response',
      message: capability.message,
    })
    fetcher.mockResolvedValueOnce(completion(capability.wire))
    expect(await invoke(capability.channel, capability.request)).toMatchObject({
      ok: true,
    })
    expect(sender.listenerCount('destroyed')).toBe(1)
  })
  test(`${capability.channel}: provider failure preserves safe error and explicit retry`, async () => {
    fetcher.mockResolvedValueOnce(
      new Response('synthetic-sensitive-payload', { status: 401 }),
    )
    expect(await invoke(capability.channel, capability.request)).toEqual({
      ok: false,
      code: 'authentication',
      message: 'OpenRouter authentication failed. Check your API key.',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValueOnce(completion(capability.wire))
    expect(await invoke(capability.channel, capability.request)).toMatchObject({
      ok: true,
    })
  })
  test(`${capability.channel}: cancellation settles even when transport ignores abort, late result cannot replace retry`, async () => {
    let finish!: (response: Response) => void
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const old = invoke(capability.channel, capability.request)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(await invoke(capability.channel, capability.request)).toEqual({
      ok: false,
      code: 'validation',
      message: 'An AI request with this ID is already running.',
    })
    await invoke(IPC.AI_CANCEL, 'same')
    expect(await old).toEqual({
      ok: false,
      code: 'cancelled',
      message: 'Request cancelled.',
    })
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    fetcher.mockResolvedValueOnce(completion(capability.wire))
    const retry = invoke(capability.channel, capability.request)
    finish(completion({ unexpected: true }))
    expect(await retry).toMatchObject({ ok: true })
  })
}

test('nested budgets and strict capability request fields reject at IPC before any provider work', async () => {
  const invalid = [
    [
      IPC.AI_PROPOSE,
      {
        ...query,
        context: {
          ...query.context,
          relations: [
            {
              schema: 'public',
              name: 'orders',
              kind: 'table',
              columns: Array(AI_LIMITS.columnsPerRelation + 1).fill({
                name: 'id',
                dataType: 'text',
              }),
            },
          ],
        },
      },
    ],
    [
      IPC.AI_PROPOSE,
      {
        ...query,
        intent: 'repair',
        currentQuery: 'SELECT 1',
        error: 'error',
        prompt: undefined,
      },
    ],
    [
      IPC.AI_PROPOSE_BUILDER,
      { ...builder, state: { ...builder.state, sql: 'SELECT secret' } },
    ],
    [
      IPC.AI_ANALYZE_ANOMALIES,
      { ...anomaly, chart: { ...anomaly.chart, password: 'secret' } },
    ],
    [
      IPC.AI_ANALYZE_PLAN,
      {
        ...plan,
        plan: {
          ...plan.plan,
          nodes: Array(AI_LIMITS.planNodes + 1).fill(plan.plan.nodes[0]),
        },
      },
    ],
  ] as const
  for (const [channel, payload] of invalid)
    expect(await invoke(channel, payload)).toMatchObject({
      ok: false,
      code: 'validation',
    })
  expect(harness.settings).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})

test('ungrounded chart points, plan nodes and unknown Builder columns reject through provider and IPC', async () => {
  const invalid = [
    [
      IPC.AI_PROPOSE_BUILDER,
      builder,
      { ...cases[1].wire, patch: { xColumn: 'unknown' } },
    ],
    [
      IPC.AI_ANALYZE_ANOMALIES,
      anomaly,
      {
        ...cases[2].wire,
        anomalies: [
          {
            seriesIndex: 0,
            pointIndex: 3,
            title: 'spike',
            reason: 'reason',
            severity: 'high',
          },
        ],
      },
    ],
    [
      IPC.AI_ANALYZE_PLAN,
      plan,
      {
        ...cases[3].wire,
        hints: [
          {
            title: 'hint',
            action: null,
            detail: 'detail',
            severity: 'info',
            nodeIds: ['unknown'],
            evidence: 'evidence',
          },
        ],
      },
    ],
  ] as const
  for (const [channel, payload, wire] of invalid) {
    fetcher.mockResolvedValueOnce(completion(wire))
    expect(await invoke(channel, payload)).toMatchObject({
      ok: false,
      code: 'invalid-response',
    })
  }
})

test('repair sanitization and generation allowlists apply before transport serialization', async () => {
  fetcher.mockResolvedValue(completion(cases[0].wire))
  await invoke(IPC.AI_PROPOSE, {
    ...query,
    password: 'top-secret',
    context: { ...query.context, rows: [{ password: 'row-secret' }] },
  })
  await invoke(IPC.AI_PROPOSE, {
    requestId: 'repair',
    intent: 'repair',
    currentQuery: 'SELECT missing FROM orders',
    error:
      'SQLSTATE 42703 password=hunter2 token=secret-token /Users/example/private.db',
    context: query.context,
  })
  const bodies = fetcher.mock.calls.map((call) => String(call[1]?.body))
  expect(bodies[0]).not.toMatch(/top-secret|row-secret/)
  expect(bodies[1]).toContain('SQLSTATE 42703')
  expect(bodies[1]).not.toMatch(/hunter2|secret-token|\/Users\/example/)
})

test('destroyed sender cancels only its owner, identical IDs in another sender remain usable', async () => {
  fetcher.mockImplementation(() => new Promise(() => {}))
  const other = new Sender(10)
  const first = invoke(IPC.AI_PROPOSE, query)
  const second = invoke(IPC.AI_PROPOSE, query, other)
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  sender.emit('destroyed')
  expect(await first).toMatchObject({ ok: false, code: 'cancelled' })
  expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(false)
  await invoke(IPC.AI_CANCEL, 'same', other)
  expect(await second).toMatchObject({ ok: false, code: 'cancelled' })
  other.emit('destroyed')
})

test('structured content cap and malformed outer JSON reject before publication', async () => {
  fetcher.mockResolvedValueOnce(completion('x'.repeat(100001)))
  expect(await invoke(IPC.AI_PROPOSE, query)).toMatchObject({
    ok: false,
    code: 'invalid-response',
  })
  fetcher.mockResolvedValueOnce(new Response('{bad'))
  expect(await invoke(IPC.AI_PROPOSE, query)).toEqual({
    ok: false,
    code: 'invalid-response',
    message:
      'OpenRouter returned an invalid response. Try again or choose another model.',
  })
})

test('renderer-built incomplete temporal request reaches provider through main IPC, but malformed temporal context does not', async () => {
  const tab = createQuerySession(1, {
    id: 'builder-boundary',
    connectionProfileId: 'pg',
    queryMode: 'builder',
  })
  tab.builder.table = { schema: 'public', name: 'events' }
  tab.builderVisualization = {
    ...tab.builderVisualization,
    xColumn: null,
    valueColumn: null,
    aggregation: 'sum',
  }
  useStore.setState({
    tabs: [tab],
    activeTabId: tab.id,
    profiles: [
      {
        kind: 'postgres',
        version: 2,
        id: 'pg',
        name: 'Synthetic',
        host: '127.0.0.1',
        port: 1,
        database: 'synthetic',
        user: 'reader',
        password: '',
        readonly: true,
        tlsMode: 'disable',
      },
    ],
    metadataByProfileId: {
      pg: {
        status: 'loaded',
        isStale: false,
        error: null,
        schemas: [
          {
            name: 'public',
            isSystem: false,
            relations: [
              {
                schema: 'public',
                name: 'events',
                qualifiedName: 'public.events',
                kind: 'r',
                columnsStatus: 'loaded',
                columns: [
                  {
                    name: 'creation_datetime',
                    dataTypeName: 'timestamptz',
                    nullable: false,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  })
  const snapshot = captureAiBuilderSnapshot()!
  const prepared = prepareAiBuilderContext(snapshot, 'creation_datetime please')
  const input = {
    requestId: 'renderer-to-main',
    prompt: prepared.prompt,
    state: prepared.snapshot.state,
    columns: prepared.columns,
  }
  fetcher.mockResolvedValueOnce(
    completion({
      ...cases[1].wire,
      patch: { timeColumn: 'creation_datetime', aggregation: 'count' },
    }),
  )
  expect(await invoke(IPC.AI_PROPOSE_BUILDER, input)).toMatchObject({
    ok: true,
    value: {
      kind: 'proposal',
      proposal: {
        patch: { timeColumn: 'creation_datetime', aggregation: 'count' },
      },
    },
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
  const invalid = {
    ...input,
    requestId: 'invalid-time',
    state: { ...input.state, timeColumn: 'creation_datetime' },
    columns: [{ name: 'creation_datetime', dataType: 'text' }],
  }
  expect(await invoke(IPC.AI_PROPOSE_BUILDER, invalid)).toMatchObject({
    ok: false,
    code: 'validation',
    message: expect.stringContaining('column metadata'),
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
