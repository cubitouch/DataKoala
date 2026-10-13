import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AI_LIMITS } from '../../shared/ai.ts'
import type {
  AiBuilderProposalRequest,
  AiAnomalyAnalysisRequest,
  AiPlanAnalysisRequest,
} from '../../shared/ai.ts'
import {
  AiError,
  proposalRequest,
  queryStep,
  builderProposalRequest,
  builderStep,
  anomalyAnalysisRequest,
  anomalyAnalysis,
  planAnalysisRequest,
  planAnalysis,
  settingsInput,
} from './validation.ts'

const queryRequest = {
  requestId: 'query',
  intent: 'generate',
  prompt: 'count',
  context: { language: { kind: 'sql', dialect: 'postgres' }, relations: [] },
}
const queryResponse = {
  kind: 'proposal',
  query: 'SELECT 1',
  explanation: '',
  assumptions: [],
  searchTerms: [],
  reason: '',
}
const builderRequest: AiBuilderProposalRequest = {
  requestId: 'builder',
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
const builderResponse = {
  kind: 'proposal',
  patch: {},
  explanation: '',
  assumptions: [],
  reason: '',
}
const anomalyRequest: AiAnomalyAnalysisRequest = {
  requestId: 'anomaly',
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
const anomalyResponse = {
  summary: 'summary',
  anomalies: [],
  limitations: [],
  followUps: [],
}
const planRequest: AiPlanAnalysisRequest = {
  requestId: 'plan',
  sql: 'SELECT 1',
  mode: 'explain',
  plan: { truncated: false, nodes: [{ id: '0', nodeType: 'Result' }] },
}
const planResponse = { summary: 'summary', hints: [] }
const hint = {
  title: 'title',
  action: null,
  detail: 'detail',
  severity: 'info',
  nodeIds: ['0'],
  evidence: 'evidence',
}

const requests = [
  ['query', proposalRequest, queryRequest],
  ['builder', builderProposalRequest, builderRequest],
  ['anomaly', anomalyAnalysisRequest, anomalyRequest],
  ['plan', planAnalysisRequest, planRequest],
] as const
const responses = [
  ['query', queryStep, queryResponse],
  [
    'builder',
    (value: unknown) => builderStep(value, builderRequest),
    builderResponse,
  ],
  [
    'anomaly',
    (value: unknown) => anomalyAnalysis(value, anomalyRequest),
    anomalyResponse,
  ],
  ['plan', (value: unknown) => planAnalysis(value, planRequest), planResponse],
] as const

for (const [name, validate, valid] of requests) {
  test(`${name} request minimal contract and required field rejection`, () => {
    assert.deepEqual(validate(valid), valid)
    for (const key of Object.keys(valid)) {
      const input: Record<string, unknown> = { ...valid }
      delete input[key]
      assert.throws(() => validate(input), { code: 'validation' }, key)
    }
    for (const value of [null, [], 1, true, 'malformed JSON {'])
      assert.throws(() => validate(value), { code: 'validation' })
    assert.throws(() => validate({ ...valid, requestId: 3 }), {
      code: 'validation',
    })
    assert.throws(() => validate({ ...valid, requestId: 'x'.repeat(129) }), {
      code: 'validation',
    })
    for (const [other, , payload] of requests)
      if (other !== name)
        assert.throws(() => validate(payload), { code: 'validation' })
  })
}
for (const [name, validate, valid] of responses) {
  test(`${name} response primitive, unknown-field and cross-capability rejection`, () => {
    assert.ok(validate(valid))
    for (const key of Object.keys(valid)) {
      const input: Record<string, unknown> = { ...valid }
      delete input[key]
      assert.throws(() => validate(input), { code: 'invalid-response' }, key)
    }
    for (const value of [null, [], 1, true, 'malformed JSON {'])
      assert.throws(() => validate(value), { code: 'invalid-response' })
    assert.throws(() => validate({ ...valid, sql: 'DROP TABLE orders' }), {
      code: 'invalid-response',
    })
    for (const [other, , payload] of responses)
      if (other !== name)
        assert.throws(() => validate(payload), { code: 'invalid-response' })
  })
}

test('query and repair retain field filtering, length boundaries and discovery restrictions', () => {
  const maximal = {
    ...queryRequest,
    requestId: 'r'.repeat(128),
    prompt: 'p'.repeat(AI_LIMITS.prompt),
    currentQuery: 'q'.repeat(AI_LIMITS.query),
  }
  assert.deepEqual(proposalRequest(maximal), maximal)
  assert.deepEqual(
    proposalRequest({ ...queryRequest, credentials: 'excluded' }),
    queryRequest,
  )
  const repair = {
    requestId: 'repair',
    intent: 'repair',
    currentQuery: 'SELECT 1',
    error: 'syntax error',
    context: queryRequest.context,
  }
  assert.deepEqual(proposalRequest(repair), repair)
  assert.throws(() => proposalRequest({ ...repair, credentials: 'excluded' }), {
    code: 'validation',
  })
  for (const value of [1, '', 'x'.repeat(AI_LIMITS.prompt + 1)])
    assert.throws(() => proposalRequest({ ...queryRequest, prompt: value }), {
      code: 'validation',
    })
  assert.throws(
    () =>
      proposalRequest({
        ...maximal,
        currentQuery: 'x'.repeat(AI_LIMITS.query + 1),
      }),
    { code: 'validation' },
  )
  assert.throws(() => proposalRequest({ ...queryRequest, intent: 'execute' }), {
    code: 'validation',
  })
  const maximalResponse = {
    ...queryResponse,
    query: 'q'.repeat(AI_LIMITS.query),
    explanation: 'e'.repeat(8000),
    assumptions: Array(30).fill('a'.repeat(2000)),
  }
  assert.equal(queryStep(maximalResponse).kind, 'proposal')
  for (const patch of [
    { query: 1 },
    { query: 'x'.repeat(AI_LIMITS.query + 1) },
    { assumptions: Array(31).fill('a') },
    { explanation: 'x'.repeat(8001) },
    { kind: 'execute' },
  ])
    assert.throws(() => queryStep({ ...queryResponse, ...patch }), {
      code: 'invalid-response',
    })
  const discovery = {
    kind: 'context-request',
    query: '',
    explanation: '',
    assumptions: [],
    searchTerms: Array(AI_LIMITS.contextRequestTerms).fill('orders'),
    reason: 'r'.repeat(AI_LIMITS.contextRequestReason),
  }
  assert.equal(queryStep(discovery).kind, 'context-request')
  for (const searchTerms of [
    ['SELECT secret'],
    ['orders; DROP TABLE users'],
    ['credentials token'],
    ['x'.repeat(AI_LIMITS.contextRequestTermCharacters + 1)],
    Array(AI_LIMITS.contextRequestTerms + 1).fill('orders'),
  ])
    assert.throws(() => queryStep({ ...discovery, searchTerms }), {
      code: 'invalid-response',
    })
  const relation = {
    schema: 'public',
    name: 'orders',
    kind: 'table',
    columns: [{ name: 'x', dataType: 'text', nullable: 'yes' }],
  }
  assert.throws(
    () =>
      proposalRequest({
        ...queryRequest,
        context: { ...queryRequest.context, relations: [relation] },
      }),
    { code: 'validation' },
  )
})

test('Builder bounds and identifiers remain capability specific', () => {
  const maximal = {
    ...builderRequest,
    prompt: 'p'.repeat(AI_LIMITS.prompt),
    columns: Array.from({ length: AI_LIMITS.columnsPerRelation }, (_, i) => ({
      name: `c${i}`,
      dataType: 'text',
    })),
  }
  assert.deepEqual(builderProposalRequest(maximal), maximal)
  assert.throws(
    () =>
      builderProposalRequest({
        ...maximal,
        columns: [...maximal.columns, { name: 'extra', dataType: 'text' }],
      }),
    { code: 'validation' },
  )
  for (const patch of [
    { xColumn: 'unknown' },
    { valueColumn: 'country' },
    { timeColumn: 'country' },
    { aggregation: 'execute' },
    { timeBucket: 'second' },
    { timeRange: { kind: 'rolling', amount: -1, unit: 'day' } },
    { sql: 'SELECT 1' },
  ])
    assert.throws(
      () => builderStep({ ...builderResponse, patch }, builderRequest),
      { code: 'invalid-response' },
    )
  assert.throws(
    () =>
      builderProposalRequest({
        ...builderRequest,
        state: { ...builderRequest.state, xColumn: 'unknown' },
      }),
    { code: 'validation' },
  )
  assert.equal(
    builderStep(
      {
        ...builderResponse,
        explanation: 'e'.repeat(8000),
        assumptions: Array(30).fill('a'.repeat(2000)),
      },
      builderRequest,
    ).kind,
    'proposal',
  )
  assert.throws(
    () =>
      builderStep(
        { ...builderResponse, assumptions: Array(31).fill('a') },
        builderRequest,
      ),
    { code: 'invalid-response' },
  )
})

test('anomaly maximum sample, text and grounded-reference boundaries', () => {
  const series = {
    ...anomalyRequest.chart.series[0],
    originalPointCount: AI_LIMITS.anomalyPointsPerSeries,
    validPointCount: AI_LIMITS.anomalyPointsPerSeries,
    points: Array.from(
      { length: AI_LIMITS.anomalyPointsPerSeries },
      (_, x) => ({ x, y: x }),
    ),
  }
  const maximal: AiAnomalyAnalysisRequest = {
    ...anomalyRequest,
    chart: {
      ...anomalyRequest.chart,
      series: Array(AI_LIMITS.anomalySeries).fill(series),
    },
  }
  assert.deepEqual(anomalyAnalysisRequest(maximal), maximal)
  for (const chart of [
    { ...maximal.chart, series: [...maximal.chart.series, series] },
    { ...anomalyRequest.chart, chartType: 'bar' },
    {
      ...anomalyRequest.chart,
      series: [{ ...series, points: [...series.points, { x: 33, y: 33 }] }],
    },
    { ...anomalyRequest.chart, series: [{ ...series, sampleCoverage: NaN }] },
    {
      ...anomalyRequest.chart,
      series: [{ ...series, points: [{ x: {}, y: 1 }] }],
    },
  ])
    assert.throws(() => anomalyAnalysisRequest({ ...anomalyRequest, chart }), {
      code: 'validation',
    })
  const finding = {
    seriesIndex: 0,
    pointIndex: 0,
    title: 't'.repeat(AI_LIMITS.anomalyTitle),
    reason: 'r'.repeat(AI_LIMITS.anomalyReason),
    severity: 'high',
  }
  const response = {
    summary: 's'.repeat(AI_LIMITS.anomalySummary),
    anomalies: Array.from(
      { length: AI_LIMITS.anomalyCount },
      (_, pointIndex) => ({ ...finding, pointIndex }),
    ),
    limitations: Array(8).fill('l'.repeat(AI_LIMITS.anomalyText)),
    followUps: Array(8).fill('f'.repeat(AI_LIMITS.anomalyText)),
  }
  assert.deepEqual(anomalyAnalysis(response, maximal), response)
  for (const patch of [
    { severity: 'critical' },
    { seriesIndex: 8 },
    { pointIndex: 32 },
    { pointIndex: 0.5 },
    { title: 't'.repeat(AI_LIMITS.anomalyTitle + 1) },
    { reason: 3 },
    { sql: 'SELECT 1' },
  ])
    assert.throws(
      () =>
        anomalyAnalysis(
          { ...anomalyResponse, anomalies: [{ ...finding, ...patch }] },
          maximal,
        ),
      { code: 'invalid-response' },
    )
  for (const patch of [
    { anomalies: [finding, finding] },
    { anomalies: Array(13).fill(finding) },
    { limitations: Array(9).fill('a') },
    { summary: 'x'.repeat(AI_LIMITS.anomalySummary + 1) },
  ])
    assert.throws(
      () => anomalyAnalysis({ ...anomalyResponse, ...patch }, maximal),
      { code: 'invalid-response' },
    )
})

test('plan maxima, enums, nested allowlists and node grounding', () => {
  const maximal: AiPlanAnalysisRequest = {
    ...planRequest,
    sql: 's'.repeat(AI_LIMITS.query),
    plan: {
      truncated: false,
      nodes: Array.from({ length: AI_LIMITS.planNodes }, (_, i) => ({
        id: `${i}`,
        ...(i === 0 ? {} : { parentId: '0' }),
        nodeType: 'Result',
      })),
    },
  }
  assert.deepEqual(planAnalysisRequest(maximal), maximal)
  const response = {
    summary: 's'.repeat(AI_LIMITS.planSummary),
    hints: Array.from({ length: AI_LIMITS.planHintCount }, () => ({
      ...hint,
      title: 't'.repeat(AI_LIMITS.planHintTitle),
      action: 'a'.repeat(AI_LIMITS.planHintAction),
      detail: 'd'.repeat(AI_LIMITS.planHintDetail),
      evidence: 'e'.repeat(AI_LIMITS.planHintEvidence),
      nodeIds: Array.from(
        { length: AI_LIMITS.planHintNodes },
        (_, i) => `${i}`,
      ),
    })),
  }
  assert.deepEqual(planAnalysis(response, maximal), response)
  assert.throws(
    () => planAnalysisRequest({ ...planRequest, mode: 'execute' }),
    { code: 'validation' },
  )
  for (const patch of [
    { nodeIds: ['unknown'] },
    { nodeIds: ['0', '0'] },
    { nodeIds: [] },
    { nodeIds: [1] },
    { severity: 'high' },
    { action: 1 },
    { sql: 'SELECT 1' },
    { detail: 'd'.repeat(AI_LIMITS.planHintDetail + 1) },
  ])
    assert.throws(
      () =>
        planAnalysis(
          { ...planResponse, hints: [{ ...hint, ...patch }] },
          maximal,
        ),
      { code: 'invalid-response' },
    )
  assert.throws(
    () =>
      planAnalysis({ ...response, hints: [...response.hints, hint] }, maximal),
    { code: 'invalid-response' },
  )
  assert.throws(
    () =>
      planAnalysis(
        { ...planResponse, summary: 's'.repeat(AI_LIMITS.planSummary + 1) },
        maximal,
      ),
    { code: 'invalid-response' },
  )
})

test('settings filtering and shared AiError identity are preserved', () => {
  assert.deepEqual(
    settingsInput({
      model: 'm'.repeat(256),
      apiKey: 'k'.repeat(1024),
      query: 'excluded',
    }),
    { model: 'm'.repeat(256), apiKey: 'k'.repeat(1024) },
  )
  for (const value of [
    { model: 'x'.repeat(257) },
    { model: 'm', apiKey: 'x'.repeat(1025) },
  ])
    assert.throws(() => settingsInput(value), AiError)
})
