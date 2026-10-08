import { describe, expect, it } from 'vitest'
import type { ExplainNode } from '@shared/types'
import {
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

  it('lays out the same plan deterministically and preserves sibling order', () => {
    const first = layoutExecutionPlan(tree, 200, 100, 60, 40)
    const second = layoutExecutionPlan(tree, 200, 100, 60, 40)
    expect(second).toEqual(first)
    expect(first.get('0.0')!.y).toBeLessThan(first.get('0.1')!.y)
    expect(first.get('0.1')!.x).toBeLessThan(first.get('0.1.0')!.x)
  })
})
