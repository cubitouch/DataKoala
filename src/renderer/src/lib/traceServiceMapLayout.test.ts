import assert from 'node:assert/strict'
import test from 'node:test'
import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'
import { layoutTraceServiceMap } from './traceServiceMapLayout.ts'

function node(id: string, rootTraceCount = 0): TraceCohortNode {
  return {
    id,
    label: id,
    traceCount: 10,
    traceRate: 1,
    rootTraceCount,
    spanCount: 10,
    errorTraceCount: 0,
    errorRate: 0,
    incidentImpact: 1
  }
}

function edge(source: string, target: string, rank = 10): TraceCohortEdge {
  return {
    key: `${source}->${target}`,
    source,
    target,
    sourceLabel: source,
    targetLabel: target,
    kind: 'sync',
    traceCount: 10,
    traceRate: 1,
    callCount: 10,
    callsPerAffectedTrace: 1,
    errorCount: 0,
    errorTraceCount: 0,
    errorRate: 0,
    p50Ms: 10,
    p95Ms: 20,
    baselineMedianMs: 10,
    slowMedianMs: 10,
    slowDeltaMs: 0,
    baselineObservedTraceCount: 5,
    slowObservedTraceCount: 2,
    latencyComparisonAvailable: true,
    baselinePresenceRate: 1,
    slowPresenceRate: 1,
    slowPresenceLift: 0,
    impact: 1,
    rank,
    traceIds: [],
    slowTraceIds: []
  }
}

test('service map layout keeps downstream nodes aligned with their parents', () => {
  const nodes = [node('root', 10), node('inventory'), node('payment'), node('postgres'), node('gateway')]
  const edges = [
    edge('root', 'inventory'), edge('root', 'payment'),
    edge('inventory', 'postgres'), edge('payment', 'gateway')
  ]

  const positions = layoutTraceServiceMap(nodes, edges)
  assert.equal(positions.get('root')?.layer, 0)
  assert.equal(positions.get('inventory')?.layer, 1)
  assert.equal(positions.get('postgres')?.layer, 2)
  assert.equal(positions.get('gateway')?.layer, 2)
  assert.equal(positions.get('postgres')?.y, positions.get('inventory')?.y)
  assert.equal(positions.get('gateway')?.y, positions.get('payment')?.y)
})

test('service map layout reorders a downstream layer to avoid an obvious crossing', () => {
  const nodes = [node('root', 10), node('a'), node('b'), node('x'), node('y')]
  const edges = [
    edge('root', 'a'), edge('root', 'b'),
    edge('a', 'y'), edge('b', 'x')
  ]

  const positions = layoutTraceServiceMap(nodes, edges)
  const a = positions.get('a')!
  const b = positions.get('b')!
  const x = positions.get('x')!
  const y = positions.get('y')!

  assert.ok(a.y < b.y, 'first-layer order should stay deterministic')
  assert.ok(y.y < x.y, 'second layer should follow its connected parent rather than alphabetical order')
})

test('service map layout is deterministic and keeps disconnected roots in the first layer', () => {
  const nodes = [node('root', 10), node('child'), node('other-root', 1), node('other-child')]
  const edges = [edge('root', 'child'), edge('other-root', 'other-child')]

  const first = layoutTraceServiceMap(nodes, edges)
  const second = layoutTraceServiceMap(nodes, edges)

  assert.deepEqual([...first.entries()], [...second.entries()])
  assert.equal(first.get('root')?.layer, 0)
  assert.equal(first.get('other-root')?.layer, 0)
  assert.equal(first.get('child')?.layer, 1)
  assert.equal(first.get('other-child')?.layer, 1)
})

test('dense service maps widen their coordinate system instead of collapsing into a tall central strip', () => {
  const children = Array.from({ length: 30 }, (_, index) => node(`child-${index}`))
  const nodes = [node('root', 10), ...children]
  const edges = children.map((child, index) => edge('root', child.id, index + 1))
  const positions = layoutTraceServiceMap(nodes, edges)
  const values = [...positions.values()]
  const width = Math.max(...values.map((position) => position.x)) - Math.min(...values.map((position) => position.x))
  const height = Math.max(...values.map((position) => position.y)) - Math.min(...values.map((position) => position.y))

  assert.ok(width > height * 1.3, `expected a landscape layout for a dense layer, got ${width}×${height}`)
})
