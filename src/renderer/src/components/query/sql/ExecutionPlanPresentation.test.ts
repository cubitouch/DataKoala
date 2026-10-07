import { describe, expect, it } from 'vitest'
import type { ExplainNode } from '@shared/types'
import {
  compareCardinality,
  explainNodeCategory,
  explainNodeTiming,
  explainNodeWorkValue,
} from './ExecutionPlanPresentation'

function node(patch: Partial<ExplainNode> = {}): ExplainNode {
  return {
    id: '0',
    plan: patch.nodeType ?? 'Seq Scan',
    nodeType: 'Seq Scan',
    ...patch,
  }
}

describe('execution-plan presentation metrics', () => {
  it('compares estimated and actual cardinality without multiplying by loops', () => {
    const singleLoop = compareCardinality(
      node({ planRows: 100, actualRows: 10_000, loops: 1 }),
    )
    expect(singleLoop).toMatchObject({
      relation: 'underestimate',
      ratio: 100,
      label: '100× estimate',
    })

    const multiLoop = compareCardinality(
      node({ planRows: 100, actualRows: 1_000, loops: 10 }),
    )
    expect(multiLoop).toMatchObject({
      relation: 'underestimate',
      ratio: 10,
      label: '10× estimate',
    })
  })

  it('handles zero estimates without infinite ratios', () => {
    expect(compareCardinality(node({ planRows: 0, actualRows: 12 }))).toEqual({
      relation: 'underestimate',
      label: 'estimate 0 · actual > 0',
    })
    expect(compareCardinality(node({ planRows: 0, actualRows: 0 }))).toEqual({
      relation: 'match',
      ratio: 1,
      label: '1× estimate',
    })
  })

  it('retains per-loop timing and derives approximate total measured time', () => {
    expect(
      explainNodeTiming(node({ actualTotalTime: 2.5, loops: 10 })),
    ).toEqual({
      perLoopMs: 2.5,
      loops: 10,
      approxTotalMs: 25,
    })
  })

  it.each([
    ['Seq Scan', 'scan'],
    ['Index Only Scan', 'scan'],
    ['Bitmap Heap Scan', 'scan'],
    ['Nested Loop', 'join'],
    ['Hash Join', 'join'],
    ['Aggregate', 'aggregate'],
    ['HashAggregate', 'aggregate'],
    ['Incremental Sort', 'sort'],
    ['Limit', 'limit'],
    ['Hash', 'hash'],
    ['Materialize', 'materialize'],
    ['CTE Scan', 'subquery'],
    ['Subquery Scan', 'subquery'],
    ['Custom Future Node', 'other'],
  ] as const)('classifies %s as %s', (nodeType, category) => {
    expect(explainNodeCategory(nodeType)).toBe(category)
  })

  it('uses planner cost for EXPLAIN and measured time for ANALYZE', () => {
    const sample = node({
      totalCost: 912.4,
      actualTotalTime: 2.5,
      loops: 10,
    })
    expect(explainNodeWorkValue(sample, false)).toBe(912.4)
    expect(explainNodeWorkValue(sample, true)).toBe(25)
  })
})
