import { test } from 'node:test'
import assert from 'node:assert/strict'
import { explanationRequest, queryExplanation } from './explanation.ts'
import { OpenRouterProvider } from './openrouter.ts'
import { AI_LIMITS } from '../../shared/ai.ts'

const context = {
  language: { kind: 'sql', dialect: 'postgres' },
  relations: [],
}
const query =
  'SELECT country, sum(revenue) FROM orders GROUP BY country ORDER BY sum(revenue) DESC LIMIT 10'
const diagram = {
  summary: 'Revenue by country.',
  assumptions: [],
  nodes: [
    {
      id: 'source',
      kind: 'source',
      label: 'Orders',
      sqlFragment: 'FROM orders',
    },
    {
      id: 'group',
      kind: 'group',
      label: 'Revenue by country',
      sqlFragment: 'GROUP BY country',
    },
    {
      id: 'sort',
      kind: 'sort',
      label: 'Highest revenue first',
      sqlFragment: 'ORDER BY sum(revenue) DESC',
    },
    { id: 'limit', kind: 'limit', label: 'Top ten', sqlFragment: 'LIMIT 10' },
  ],
  edges: [
    { from: 'source', to: 'group' },
    { from: 'group', to: 'sort' },
    { from: 'sort', to: 'limit' },
  ],
  highlights: [
    {
      title: 'Top countries',
      detail: 'Groups revenue by country before sorting and limiting.',
      nodeIds: ['group', 'sort', 'limit'],
    },
  ],
}
test('explanation requests reconstruct the privacy allowlist and enforce context budgets', () => {
  const request = explanationRequest({
    requestId: 'test',
    currentQuery: query,
    context,
    rows: ['secret'],
    password: 'secret',
    plan: 'secret',
  })
  assert.deepEqual(request, { requestId: 'test', currentQuery: query, context })
  assert.throws(() => explanationRequest({ ...request, currentQuery: '' }))
  assert.throws(() =>
    explanationRequest({
      ...request,
      currentQuery: 'x'.repeat(AI_LIMITS.query + 1),
    }),
  )
  assert.throws(() =>
    explanationRequest({
      ...request,
      context: { ...context, language: { kind: 'sql', dialect: 'bigquery' } },
    }),
  )
  assert.throws(() =>
    explanationRequest({
      ...request,
      context: {
        ...context,
        relations: Array(9).fill({
          schema: 'public',
          name: 'orders',
          kind: 'table',
          columns: [],
        }),
      },
    }),
  )
})
test('structured explanation validates grounding, references, graph integrity and size', () => {
  assert.deepEqual(queryExplanation(diagram, query), diagram)
  const bad = [
    { ...diagram, tool: 'execute' },
    { ...diagram, nodes: [] },
    { ...diagram, nodes: [...diagram.nodes, diagram.nodes[0]] },
    {
      ...diagram,
      nodes: [{ ...diagram.nodes[0], sqlFragment: 'FROM secrets' }],
    },
    { ...diagram, nodes: [{ ...diagram.nodes[0], kind: 'execute' }] },
    { ...diagram, nodes: Array(25).fill(diagram.nodes[0]) },
    { ...diagram, edges: [{ from: 'source', to: 'missing' }] },
    { ...diagram, edges: [...diagram.edges, { from: 'limit', to: 'source' }] },
    { ...diagram, edges: [...diagram.edges, diagram.edges[0]] },
    {
      ...diagram,
      highlights: [{ ...diagram.highlights[0], nodeIds: ['unknown'] }],
    },
    { ...diagram, highlights: [] },
  ]
  for (const value of bad)
    assert.throws(() => queryExplanation(value, query), {
      code: 'invalid-response',
    })
})
// These are representative rendering/contract fixtures, not claims about live-model accuracy.
const fixtures = [
  ['filter', 'SELECT * FROM orders WHERE revenue > 0', 'WHERE revenue > 0'],
  [
    'join',
    'SELECT * FROM orders o JOIN users u ON u.id = o.user_id JOIN countries c ON c.id = u.country_id',
    'JOIN users u ON u.id = o.user_id',
  ],
  [
    'join',
    'SELECT * FROM users u LEFT JOIN orders o ON o.user_id = u.id',
    'LEFT JOIN orders o ON o.user_id = u.id',
  ],
  [
    'cte',
    'WITH recent AS (SELECT * FROM orders) SELECT * FROM recent',
    'WITH recent AS (SELECT * FROM orders)',
  ],
  [
    'window',
    'SELECT avg(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) FROM orders',
    'avg(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)',
  ],
  [
    'subquery',
    'SELECT * FROM (SELECT * FROM orders) o',
    '(SELECT * FROM orders)',
  ],
  ['select', 'SELECT value FROM ambiguous', 'SELECT value'],
]
for (const [kind, sql, fragment] of fixtures)
  test(`accepts grounded ${kind} fixture: ${sql}`, () => {
    const value = {
      summary: 'Query structure',
      assumptions: ['Only the supplied SQL is known.'],
      nodes: [{ id: 'a', label: kind, kind, sqlFragment: fragment }],
      edges: [],
      highlights: [{ title: kind, detail: fragment, nodeIds: ['a'] }],
    }
    assert.deepEqual(queryExplanation(value, sql), value)
  })
test('OpenRouter uses explanation schema, bounded input and validates returned SQL references', async () => {
  let sent = ''
  const provider = new OpenRouterProvider(
    'test-key',
    'test-model',
    async (_url, init) => {
      sent = String(init?.body)
      return Response.json({
        choices: [{ message: { content: JSON.stringify(diagram) } }],
      })
    },
  )
  assert.deepEqual(
    await provider.explainQuery(
      {
        requestId: 'private-id',
        currentQuery: query,
        context: {
          language: { kind: 'sql', dialect: 'postgres' },
          relations: [],
        },
      },
      new AbortController().signal,
    ),
    diagram,
  )
  const payload = JSON.parse(sent)
  assert.equal(payload.response_format.json_schema.strict, true)
  assert.equal(
    payload.response_format.json_schema.schema.additionalProperties,
    false,
  )
  assert.deepEqual(JSON.parse(payload.messages[1].content), {
    currentQuery: query,
    context,
  })
  assert.equal(sent.includes('test-key'), false)
  assert.equal(sent.includes('private-id'), false)
})
