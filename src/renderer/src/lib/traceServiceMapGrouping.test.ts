import assert from 'node:assert/strict'
import test from 'node:test'
import { groupTraceServiceMap } from './traceServiceMapGrouping.ts'
import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'

function node(id: string, namespace: string): TraceCohortNode {
  return {
    id,
    label: id.split('/').at(-1) ?? id,
    namespace,
    traceCount: 10,
    traceRate: 1,
    rootTraceCount: id.endsWith('/root') ? 10 : 0,
    spanCount: 10,
    errorTraceCount: 0,
    errorRate: 0,
    incidentImpact: 1
  }
}

function edge(source: string, target: string, rank: number): TraceCohortEdge {
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
    impact: 10 - rank,
    rank,
    traceIds: ['trace-1'],
    slowTraceIds: []
  }
}

const nodes = [node('system-a/root', 'system-a'), node('system-a/worker', 'system-a'), node('system-b/api', 'system-b')]
const edges = [edge('system-a/root', 'system-a/worker', 1), edge('system-a/worker', 'system-b/api', 2)]

test('collapses namespaces and hides internal edges', () => {
  const graph = groupTraceServiceMap(nodes, edges, 'namespace', new Set(), 10)
  assert.deepEqual(graph.nodes.map((item) => item.id).sort(), ['group:system-a', 'group:system-b'])
  assert.equal(graph.edges.length, 1)
  assert.equal(graph.edges[0].source, 'group:system-a')
  assert.equal(graph.edges[0].target, 'group:system-b')
  assert.deepEqual(graph.edges[0].memberEdgeKeys, ['system-a/worker->system-b/api'])
})

test('expands one namespace without changing the other namespace', () => {
  const graph = groupTraceServiceMap(nodes, edges, 'namespace', new Set(['system-a']), 10)
  assert.deepEqual(graph.nodes.map((item) => item.id).sort(), ['group:system-b', 'system-a/root', 'system-a/worker'])
  assert.equal(graph.edges.some((item) => item.source === 'system-a/root' && item.target === 'system-a/worker'), true)
  assert.equal(graph.edges.some((item) => item.source === 'system-a/worker' && item.target === 'group:system-b'), true)
})

test('preserves services and edge identity when grouping is disabled', () => {
  const graph = groupTraceServiceMap(nodes, edges, 'none', new Set(), 10)
  assert.equal(graph.nodes.every((item) => item.viewKind === 'service'), true)
  assert.deepEqual(graph.edges.map((item) => item.key), edges.map((item) => item.key))
  assert.equal(graph.edges.every((item) => item.memberEdgeKeys.length === 1), true)
})
