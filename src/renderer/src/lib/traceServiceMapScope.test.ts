import assert from 'node:assert/strict'
import test from 'node:test'
import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'
import { scopeTraceServiceMap } from './traceServiceMapScope.ts'

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

function edge(source: string, target: string, kind: TraceCohortEdge['kind']): TraceCohortEdge {
  return {
    key: `${source}->${target}`,
    source,
    target,
    sourceLabel: source,
    targetLabel: target,
    kind,
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
    rank: 1,
    traceIds: [],
    slowTraceIds: []
  }
}

const nodes = [node('root', 10), node('inventory'), node('kafka'), node('worker'), node('warehouse')]
const edges = [
  edge('root', 'inventory', 'sync'),
  edge('root', 'kafka', 'async'),
  edge('kafka', 'worker', 'async'),
  edge('worker', 'warehouse', 'sync')
]

test('main scope excludes the async boundary and everything downstream of it', () => {
  const scoped = scopeTraceServiceMap(nodes, edges, 'main')
  assert.deepEqual(scoped.nodes.map((item) => item.id), ['root', 'inventory'])
  assert.deepEqual(scoped.edges.map((item) => item.key), ['root->inventory'])
})

test('async scope includes async boundaries and synchronous work downstream of them', () => {
  const scoped = scopeTraceServiceMap(nodes, edges, 'async')
  assert.deepEqual(scoped.nodes.map((item) => item.id), ['root', 'kafka', 'worker', 'warehouse'])
  assert.deepEqual(scoped.edges.map((item) => item.key), ['root->kafka', 'kafka->worker', 'worker->warehouse'])
})

test('mixed edges are treated as async boundaries', () => {
  const mixedEdges = [edge('root', 'kafka', 'mixed'), edge('kafka', 'worker', 'sync')]
  assert.equal(scopeTraceServiceMap(nodes, mixedEdges, 'main').edges.length, 0)
  assert.deepEqual(scopeTraceServiceMap(nodes, mixedEdges, 'async').edges.map((item) => item.key), ['root->kafka', 'kafka->worker'])
})
