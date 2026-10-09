import { describe, expect, it } from 'vitest'
import type { ExplainNode } from '@shared/types'
import {
  executionPlanNodeContent,
  layoutExecutionPlan,
  mapExecutionPlan,
} from './ExecutionPlanGraphModel'

const tree: ExplainNode = {
  id: '0',
  plan: 'Hash Join',
  nodeType: 'Hash Join',
  children: [
    {
      id: '0.0',
      plan: 'Seq Scan on orders',
      nodeType: 'Seq Scan',
      children: [],
    },
    {
      id: '0.1',
      plan: 'Hash',
      nodeType: 'Hash',
      children: [
        {
          id: '0.1.0',
          plan: 'Index Scan on customers',
          nodeType: 'Index Scan',
          children: [],
        },
      ],
    },
  ],
}

describe('mapExecutionPlan', () => {
  it('preserves node IDs, PostgreSQL child order, and only real parent-child edges', () => {
    const { nodes, edges } = mapExecutionPlan(tree)
    expect(nodes.map((node) => node.id)).toEqual(['0', '0.0', '0.1', '0.1.0'])
    expect(edges).toEqual([
      { id: '0->0.0', source: '0', target: '0.0', order: 0 },
      { id: '0->0.1', source: '0', target: '0.1', order: 1 },
      { id: '0.1->0.1.0', source: '0.1', target: '0.1.0', order: 0 },
    ])
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length)
  })

  it('lays out a branching plan top-down, centers parents, and is deterministic', () => {
    const first = layoutExecutionPlan(tree, 200, 100, 60, 40)
    const second = layoutExecutionPlan(tree, 200, 100, 60, 40)
    expect(second).toEqual(first)
    const root = first.get('0')!
    const firstChild = first.get('0.0')!
    const secondChild = first.get('0.1')!
    const grandchild = first.get('0.1.0')!

    expect(root.y).toBeLessThan(firstChild.y)
    expect(root.y).toBeLessThan(secondChild.y)
    expect(firstChild.x).toBeLessThan(secondChild.x)
    expect(secondChild.y).toBeLessThan(grandchild.y)
    expect(root.x + 100).toBeCloseTo(
      (firstChild.x + 100 + secondChild.x + 100) / 2,
    )
    expect(root.x).toBeGreaterThan(firstChild.x)
    expect(root.x).toBeLessThan(secondChild.x)
  })
})

describe('executionPlanNodeContent', () => {
  it('keeps graph metrics separate and truncates long targets', () => {
    const content = executionPlanNodeContent(
      {
        id: '0',
        plan: 'Seq Scan',
        nodeType: 'Seq Scan',
        schema: 'analytics',
        relation: 'customers_with_a_long_relation_name_for_graph_layout',
        planRows: 120,
        actualRows: 84_000,
        actualTotalTime: 12.3,
        loops: 3,
      },
      true,
    )
    expect(content).toMatchObject({
      category: 'Scan',
      nodeType: 'Seq Scan',
      estimatedRows: 'Estimated 120',
      actualRows: 'Actual 84,000 / loop',
      ratio: '700× estimate',
      work: '≈36.9 ms total measured work',
    })
    expect(content.target).toMatch(/…$/)
    expect(content.target!.length).toBeLessThanOrEqual(32)
  })
})
