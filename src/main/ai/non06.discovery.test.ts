import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_LIMITS } from '../../shared/ai.ts'
import { OpenRouterProvider } from './openrouter.ts'
import { proposalRequest, queryStep } from './validation.ts'

const contextRequest = {
  kind: 'context-request',
  query: '',
  explanation: '',
  assumptions: [],
  searchTerms: ['device'],
  reason: 'Need device metadata',
}
const request = (context: unknown) => ({
  requestId: 'non06',
  intent: 'generate',
  prompt: 'summarize devices',
  context,
})
const baseContext = {
  language: { kind: 'sql', dialect: 'postgres' },
  relations: [],
}
const expectInvalid = (value: unknown) =>
  assert.throws(
    () => queryStep(value),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'invalid-response',
  )

test('NON06 model discovery accepts bounded semantic terms and rejects malformed or command-bearing steps', () => {
  assert.deepEqual(queryStep(contextRequest), {
    kind: 'context-request',
    request: {
      searchTerms: ['device'],
      reason: 'Need device metadata',
    },
  })
  for (const change of [
    { searchTerms: [] },
    { searchTerms: Array(AI_LIMITS.contextRequestTerms + 1).fill('device') },
    { searchTerms: [123] },
    { searchTerms: ['device; DROP TABLE users'] },
    { searchTerms: ['SELECT secret'] },
    { searchTerms: ['password'] },
    { searchTerms: ['device'.repeat(30)] },
    { query: 'SELECT * FROM private' },
    { assumptions: ['execute a query'] },
    { reason: '' },
    { extra: 'executeSql' },
    { sizeLimit: -1 },
    { kind: 'unknown' },
  ]) {
    expectInvalid({ ...contextRequest, ...change })
  }
  expectInvalid(null)
  expectInvalid({ ...contextRequest, searchTerms: 'device' })
  assert.deepEqual(
    queryStep({ ...contextRequest, searchTerms: ['public.devices'] }),
    {
      kind: 'context-request',
      request: {
        searchTerms: ['public.devices'],
        reason: 'Need device metadata',
      },
    },
  )
})

test('NON06 characterization: duplicate semantic discovery terms are accepted, not canonicalized', () => {
  const result = queryStep({
    ...contextRequest,
    searchTerms: ['device', 'device'],
  })
  assert.deepEqual(result, {
    kind: 'context-request',
    request: {
      searchTerms: ['device', 'device'],
      reason: 'Need device metadata',
    },
  })
})

test('NON06 request validation enforces aggregate relation and column caps and strips untrusted fields', () => {
  const relations = Array.from({ length: AI_LIMITS.relations }, (_, i) => ({
    schema: 'public',
    name: `item_${i}`,
    kind: 'table',
    columns: Array.from(
      { length: AI_LIMITS.columns / AI_LIMITS.relations },
      (_, j) => ({
        name: `col_${j}`,
        dataType: 'text',
      }),
    ),
  }))
  const accepted = proposalRequest(request({ ...baseContext, relations }))
  assert.equal(accepted.context.relations.length, AI_LIMITS.relations)
  assert.equal(
    accepted.context.relations.reduce(
      (sum, relation) => sum + relation.columns.length,
      0,
    ),
    AI_LIMITS.columns,
  )
  assert.throws(
    () =>
      proposalRequest(
        request({
          ...baseContext,
          relations: [
            {
              ...relations[0],
              columns: [
                ...relations[0].columns,
                { name: 'extra', dataType: 'text' },
              ],
            },
            ...relations.slice(1),
          ],
        }),
      ),
    /AI schema context is too large/,
  )
  assert.throws(
    () =>
      proposalRequest(
        request({ ...baseContext, relations: [...relations, relations[0]] }),
      ),
    /Invalid SQL AI context/,
  )
  assert.throws(
    () =>
      proposalRequest(
        request({
          ...baseContext,
          relations: [
            {
              ...relations[0],
              columns: Array(AI_LIMITS.columnsPerRelation + 1).fill({
                name: 'x',
                dataType: 'text',
              }),
            },
          ],
        }),
      ),
    /Invalid AI relation context/,
  )
  const cleaned = proposalRequest({
    ...request({
      ...baseContext,
      relations: [
        {
          ...relations[0],
          columns: [{ name: 'id', dataType: 'text', values: ['secret'] }],
          token: 'secret',
        },
      ],
      unrelatedPrivateMetadata: 'secret',
    }),
    profileId: 'private-connection',
  })
  assert.doesNotMatch(
    JSON.stringify(cleaned),
    /secret|private-connection|token|values/,
  )
})

test('NON06 provider rejects malicious discovery before returning a step; no real provider involved', async () => {
  let calls = 0
  const provider = new OpenRouterProvider(
    'synthetic-key',
    'synthetic-model',
    async () => {
      calls++
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...contextRequest,
                searchTerms: ['device', 'SELECT password'],
              }),
            },
          },
        ],
      })
    },
  )
  await assert.rejects(
    provider.proposeQuery(
      proposalRequest(request(baseContext)),
      new AbortController().signal,
    ),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'invalid-response',
  )
  assert.equal(calls, 1)
})

test('NON06 characterization: syntactically valid SQL proposals are not SQL authorization checks', () => {
  const result = queryStep({
    kind: 'proposal',
    query: 'DELETE FROM public.orders',
    explanation: 'Synthetic boundary characterization',
    assumptions: [],
    searchTerms: [],
    reason: '',
  })
  assert.equal(result.kind, 'proposal')
  if (result.kind === 'proposal')
    assert.equal(result.proposal.query, 'DELETE FROM public.orders')
})
