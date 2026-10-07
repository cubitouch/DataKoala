import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_LIMITS, type AiBuilderProposalRequest } from '../../shared/ai.ts'
import { builderProposalRequest, builderStep } from './validation.ts'

const columns = [
  { name: 'created_at', dataType: 'timestamptz' },
  { name: 'country', dataType: 'text' },
  { name: 'revenue', dataType: 'numeric' },
  { name: 'status', dataType: 'text' },
]
const request: AiBuilderProposalRequest = {
  requestId: 'builder-test',
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
  columns,
}
const proposal = (patch: Record<string, unknown>) => ({
  kind: 'proposal',
  patch,
  explanation: 'Updates the Builder controls.',
  assumptions: [],
  reason: '',
})

test('Builder request is reconstructed from the allowlisted contract', () => {
  assert.deepEqual(builderProposalRequest(request), request)
})

test('Builder proposal applies the same safe axis defaults as manual controls', () => {
  assert.deepEqual(builderStep(proposal({ valueColumn: 'revenue' }), request), {
    kind: 'proposal',
    proposal: {
      patch: { valueColumn: 'revenue', aggregation: 'sum' },
      explanation: 'Updates the Builder controls.',
      assumptions: [],
    },
  })

  assert.deepEqual(
    builderStep(proposal({ xColumn: 'country' }), {
      ...request,
      state: { ...request.state, timeBucket: 'week' },
    }),
    {
      kind: 'proposal',
      proposal: {
        patch: { xColumn: 'country', timeBucket: 'day' },
        explanation: 'Updates the Builder controls.',
        assumptions: [],
      },
    },
  )

  assert.deepEqual(
    builderStep(proposal({ xColumn: 'created_at' }), {
      ...request,
      state: {
        ...request.state,
        xColumn: 'country',
        timeColumn: null,
        timeRange: undefined,
      },
    }),
    {
      kind: 'proposal',
      proposal: {
        patch: {
          xColumn: 'created_at',
          timeColumn: 'created_at',
          timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
        },
        explanation: 'Updates the Builder controls.',
        assumptions: [],
      },
    },
  )
})

test('Builder proposal validates and normalizes the complete target', () => {
  assert.deepEqual(
    builderStep(
      proposal({
        xColumn: 'country',
        valueColumn: 'revenue',
        aggregation: 'sum',
      }),
      request,
    ),
    {
      kind: 'proposal',
      proposal: {
        patch: {
          xColumn: 'country',
          valueColumn: 'revenue',
          aggregation: 'sum',
        },
        explanation: 'Updates the Builder controls.',
        assumptions: [],
      },
    },
  )
  assert.deepEqual(
    builderStep(proposal({ aggregation: 'count' }), {
      ...request,
      state: {
        ...request.state,
        valueColumn: 'revenue',
        aggregation: 'sum',
      },
    }),
    {
      kind: 'proposal',
      proposal: {
        patch: { valueColumn: null, aggregation: 'count' },
        explanation: 'Updates the Builder controls.',
        assumptions: [],
      },
    },
  )
})

test('Builder proposal accepts supported rolling ranges with flat schema extras', () => {
  assert.deepEqual(
    builderStep(
      proposal({
        timeBucket: 'hour',
        timeRange: {
          kind: 'rolling',
          amount: 7,
          unit: 'day',
          startDate: null,
          startTime: '',
          endDate: null,
          endTime: '',
          recurringWindows: [],
        },
      }),
      request,
    ),
    {
      kind: 'proposal',
      proposal: {
        patch: { timeBucket: 'hour' },
        explanation: 'Updates the Builder controls.',
        assumptions: [],
      },
    },
  )
})

test('Builder proposal accepts an exact ten-day rolling range', () => {
  const result = builderStep(
    proposal({
      timeBucket: 'hour',
      timeRange: { kind: 'rolling', amount: 10, unit: 'day' },
    }),
    request,
  )
  assert.equal(result.kind, 'proposal')
  if (result.kind !== 'proposal') return
  assert.deepEqual(result.proposal.patch, {
    timeBucket: 'hour',
    timeRange: { kind: 'rolling', amount: 10, unit: 'day' },
  })
})

for (const [name, patch] of [
  ['unknown key', { xColumn: 'country', extra: true }],
  ['unknown column', { xColumn: 'missing' }],
  ['non-numeric Y', { valueColumn: 'country', aggregation: 'sum' }],
  ['invalid aggregation', { aggregation: 'median' }],
  ['invalid time column', { timeColumn: 'country' }],
  ['invalid bucket', { timeBucket: 'fortnight' }],
  [
    'invalid time range',
    { timeRange: { kind: 'rolling', amount: 0, unit: 'day' } },
  ],
  [
    'minute bucket outside its supported range',
    {
      timeBucket: 'minute',
      timeRange: { kind: 'rolling', amount: 30, unit: 'day' },
    },
  ],
  ['relation change', { relation: { schema: 'public', name: 'customers' } }],
] as const) {
  test(`Builder proposal rejects ${name}`, () => {
    assert.throws(() => builderStep(proposal(patch), request), {
      code: 'invalid-response',
    })
  })
}

test('Builder proposal requires a numeric Y for non-count aggregations', () => {
  assert.throws(() => builderStep(proposal({ aggregation: 'sum' }), request), {
    code: 'invalid-response',
  })
})

test('Builder unsupported is a safe non-mutating response', () => {
  assert.deepEqual(
    builderStep(
      {
        kind: 'unsupported',
        patch: {},
        explanation: '',
        assumptions: [],
        reason: 'Joins are not available in this Builder slice.',
      },
      request,
    ),
    {
      kind: 'unsupported',
      reason: 'Joins are not available in this Builder slice.',
    },
  )
})

test('Builder request rejects oversized prompts and contexts', () => {
  assert.throws(
    () =>
      builderProposalRequest({
        ...request,
        prompt: 'x'.repeat(AI_LIMITS.prompt + 1),
      }),
    { code: 'validation' },
  )
  assert.throws(
    () =>
      builderProposalRequest({
        ...request,
        prompt: 'x'.repeat(AI_LIMITS.prompt),
        columns: Array.from(
          { length: AI_LIMITS.columnsPerRelation },
          (_, i) => ({
            name: `column_${i}_${'n'.repeat(220)}`,
            dataType: `type_${'t'.repeat(220)}`,
          }),
        ),
      }),
    { code: 'validation' },
  )
})

test('Builder request rejects attempts to add unrelated request state', () => {
  assert.throws(
    () =>
      builderProposalRequest({
        ...request,
        credentials: 'never',
      }),
    { code: 'validation' },
  )
})
