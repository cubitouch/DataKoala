import assert from 'node:assert/strict'
import test from 'node:test'
import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'
import { projectTraceServiceMap } from './traceServiceMapProjection.ts'

function node(index: number, rootTraceCount = 0): TraceCohortNode {
  return {
    id: `service-${index}`,
    label: `service-${index}`,
    traceCount: 10,
    traceRate: 1,
    rootTraceCount,
    spanCount: 10,
    errorTraceCount: 0,
    errorRate: 0,
    incidentImpact: 100 - index
  }
}

function edge(index: number, source: number, target: number): TraceCohortEdge {
  return {
    key: `edge-${index}`,
    source: `service-${source}`,
    target: `service-${target}`,
    sourceLabel: `service-${source}`,
    targetLabel: `service-${target}`,
    kind: 'sync',
    traceCount: 10,
    traceRate: 1,
    callCount: 10,
    callsPerAffectedTrace: 1,
    errorCount: 0,
    errorTraceCount: 0,
    errorRate: 0,
    p50Ms: 100,
    p95Ms: 200,
    baselineMedianMs: 90,
    slowMedianMs: 180,
    slowDeltaMs: 90,
    baselineObservedTraceCount: 5,
    slowObservedTraceCount: 2,
    latencyComparisonAvailable: true,
    baselinePresenceRate: 1,
    slowPresenceRate: 1,
    slowPresenceLift: 0,
    impact: 100 - index,
    rank: index + 1,
    traceIds: [],
    slowTraceIds: []
  }
}

test('service map projection bounds graph elements while retaining root context and top-ranked edges', () => {
  const nodes = Array.from({ length: 80 }, (_, index) => node(index, index === 0 ? 10 : 0))
  const edges = Array.from({ length: 79 }, (_, index) => edge(index, index, index + 1))
  const projected = projectTraceServiceMap(nodes, edges, 12, 8)

  assert.ok(projected.nodes.length <= 12)
  assert.ok(projected.edges.length <= 8)
  assert.ok(projected.nodes.some((value) => value.id === 'service-0'), 'root service should remain visible')
  assert.equal(projected.edges[0]?.key, 'edge-0', 'highest-ranked edge should remain visible')
  assert.ok(projected.omittedNodeCount > 0)
  assert.ok(projected.omittedEdgeCount > 0)
  const visible = new Set(projected.nodes.map((value) => value.id))
  assert.ok(projected.edges.every((value) => visible.has(value.source) && visible.has(value.target)))
})

test('service map projection leaves already-small graphs untouched', () => {
  const nodes = [node(0, 2), node(1)]
  const edges = [edge(0, 0, 1)]
  const projected = projectTraceServiceMap(nodes, edges, 60, 120)

  assert.equal(projected.nodes, nodes)
  assert.equal(projected.edges, edges)
  assert.equal(projected.omittedNodeCount, 0)
  assert.equal(projected.omittedEdgeCount, 0)
})
