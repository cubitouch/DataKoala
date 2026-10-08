import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_LIMITS } from './ai.ts'
import { sanitizeAiExecutionPlanContext } from './aiPlan.ts'

function node(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    nodeType: 'Seq Scan',
    parentId: id === '0' ? undefined : '0',
    ...patch,
  }
}

test('plan context reconstructs only allowlisted values and keeps bounded node text', () => {
  const result = sanitizeAiExecutionPlanContext(
    {
      truncated: false,
      planningTimeMs: 2,
      executionTimeMs: 12,
      rows: [{ password: 'row-secret' }],
      host: 'db.internal',
      connection: { user: 'alice' },
      profile: { database: 'private' },
      nodes: [
        node('0', {
          relation: 'orders',
          filter: 'x'.repeat(AI_LIMITS.planNodeText + 20),
          password: 'node-secret',
          rows: [{ customer: 'private' }],
          host: 'db.internal',
          connection: { user: 'alice' },
          profile: { database: 'private' },
        }),
      ],
    },
    'analyze',
  )
  const serialized = JSON.stringify(result)
  assert.equal(result.nodes[0]?.filter?.length, AI_LIMITS.planNodeText)
  for (const secret of [
    'row-secret',
    'node-secret',
    'db.internal',
    'alice',
    'private',
  ])
    assert.equal(serialized.includes(secret), false)
  assert.equal(result.nodes[0]?.relation, 'orders')
})

test('plan context retains the root and deterministically selects useful nodes within the count limit', () => {
  const nodes = [node('0', { nodeType: 'Limit' })]
  for (let index = 1; index <= AI_LIMITS.planNodes + 10; index += 1) {
    nodes.push(
      node(`0.${index}`, {
        nodeType: index === AI_LIMITS.planNodes + 10 ? 'Seq Scan' : 'Hash',
        totalCost: index === AI_LIMITS.planNodes + 10 ? 100_000 : index,
        actualTotalTimeMs: index === AI_LIMITS.planNodes + 10 ? 900 : index,
      }),
    )
  }
  const first = sanitizeAiExecutionPlanContext({ nodes }, 'analyze')
  const second = sanitizeAiExecutionPlanContext({ nodes }, 'analyze')
  assert.equal(first.truncated, true)
  assert.equal(first.nodes.length, AI_LIMITS.planNodes)
  assert.deepEqual(first, second)
  assert.equal(first.nodes[0]?.id, '0')
  assert.ok(
    first.nodes.some((item) => item.id === `0.${AI_LIMITS.planNodes + 10}`),
  )
  const ids = new Set(first.nodes.map((item) => item.id))
  for (const item of first.nodes)
    assert.ok(!item.parentId || ids.has(item.parentId))
})

test('plan context marks overall character trimming and rejects invalid roots and duplicate IDs', () => {
  const plan = sanitizeAiExecutionPlanContext(
    {
      nodes: [
        node('0'),
        ...Array.from({ length: AI_LIMITS.planNodes - 1 }, (_, index) =>
          node(`0.${index + 1}`, {
            filter: 'p'.repeat(AI_LIMITS.planNodeText),
          }),
        ),
      ],
    },
    'explain',
  )
  assert.equal(plan.truncated, true)
  assert.ok(JSON.stringify(plan).length <= AI_LIMITS.planCharacters)
  assert.throws(() =>
    sanitizeAiExecutionPlanContext({ nodes: [node('0.1')] }, 'explain'),
  )
  assert.throws(() =>
    sanitizeAiExecutionPlanContext(
      { nodes: [node('0'), node('0')] },
      'explain',
    ),
  )
})

test('plain EXPLAIN context never discloses runtime fields even if they are attached accidentally', () => {
  const plan = sanitizeAiExecutionPlanContext(
    {
      executionTimeMs: 19,
      planningTimeMs: 1,
      nodes: [
        node('0', {
          estimatedRows: 10,
          actualRows: 900,
          loops: 4,
          actualTotalTimeMs: 3,
          sharedReadBlocks: 12,
          rowsRemovedByFilter: 7,
          sortMethod: 'external merge',
          sortSpaceUsedKb: 900,
        }),
      ],
    },
    'explain',
  )
  assert.deepEqual(plan, {
    truncated: false,
    planningTimeMs: 1,
    nodes: [{ id: '0', nodeType: 'Seq Scan', estimatedRows: 10 }],
  })
})
