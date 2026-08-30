import type { TraceCohortEdge, TraceCohortEdgeKind, TraceCohortNode } from './traceCohort.ts'

export type TraceServiceMapGrouping = 'none' | 'namespace'

export interface TraceServiceMapViewNode extends TraceCohortNode {
  viewKind: 'service' | 'group'
  memberIds: string[]
  groupKey?: string
}

export interface TraceServiceMapViewEdge extends TraceCohortEdge {
  memberEdgeKeys: string[]
}

export interface TraceServiceMapGroupedView {
  nodes: TraceServiceMapViewNode[]
  edges: TraceServiceMapViewEdge[]
  nodeById: Map<string, TraceServiceMapViewNode>
  edgeById: Map<string, TraceServiceMapViewEdge>
}

const UNGROUPED_NAMESPACE = 'Ungrouped'

function namespaceFor(node: TraceCohortNode): string {
  return node.namespace?.trim() || UNGROUPED_NAMESPACE
}

function namespaceKey(namespace: string): string {
  return `group:${namespace}`
}

function mergeKind(left: TraceCohortEdgeKind, right: TraceCohortEdgeKind): TraceCohortEdgeKind {
  return left === right ? left : 'mixed'
}

function groupNode(namespace: string, members: TraceCohortNode[]): TraceServiceMapViewNode {
  const traceCount = Math.max(0, ...members.map((node) => node.traceCount))
  const errorTraceCount = Math.max(0, ...members.map((node) => node.errorTraceCount))
  return {
    id: namespaceKey(namespace),
    label: `${namespace}\n${members.length} service${members.length === 1 ? '' : 's'}`,
    ...(namespace !== UNGROUPED_NAMESPACE ? { namespace } : {}),
    traceCount,
    traceRate: Math.max(0, ...members.map((node) => node.traceRate)),
    rootTraceCount: members.reduce((total, node) => total + node.rootTraceCount, 0),
    spanCount: members.reduce((total, node) => total + node.spanCount, 0),
    errorTraceCount,
    errorRate: Math.max(0, ...members.map((node) => node.errorRate)),
    incidentImpact: Math.max(0, ...members.map((node) => node.incidentImpact)),
    viewKind: 'group',
    memberIds: members.map((node) => node.id),
    groupKey: namespace
  }
}

function serviceNode(node: TraceCohortNode): TraceServiceMapViewNode {
  return { ...node, viewKind: 'service', memberIds: [node.id], groupKey: namespaceFor(node) }
}

function aggregateEdge(
  current: TraceServiceMapViewEdge | undefined,
  edge: TraceCohortEdge,
  source: TraceServiceMapViewNode,
  target: TraceServiceMapViewNode,
  cohortTraceCount: number
): TraceServiceMapViewEdge {
  if (!current) {
    return {
      ...edge,
      key: `view:${source.id}->${target.id}`,
      source: source.id,
      target: target.id,
      sourceLabel: source.label.replaceAll('\n', ' · '),
      targetLabel: target.label.replaceAll('\n', ' · '),
      memberEdgeKeys: [edge.key]
    }
  }

  const traceIds = [...new Set([...current.traceIds, ...edge.traceIds])]
  const slowTraceIds = [...new Set([...current.slowTraceIds, ...edge.slowTraceIds])]
  const traceCount = traceIds.length || Math.max(current.traceCount, edge.traceCount)
  const callCount = current.callCount + edge.callCount
  const errorTraceCount = Math.min(traceCount, current.errorTraceCount + edge.errorTraceCount)
  const baselineObservedTraceCount = Math.max(current.baselineObservedTraceCount, edge.baselineObservedTraceCount)
  const slowObservedTraceCount = Math.max(current.slowObservedTraceCount, edge.slowObservedTraceCount)

  return {
    ...current,
    kind: mergeKind(current.kind, edge.kind),
    traceCount,
    traceRate: cohortTraceCount ? traceCount / cohortTraceCount : Math.max(current.traceRate, edge.traceRate),
    callCount,
    callsPerAffectedTrace: traceCount ? callCount / traceCount : 0,
    errorCount: current.errorCount + edge.errorCount,
    errorTraceCount,
    errorRate: traceCount ? errorTraceCount / traceCount : Math.max(current.errorRate, edge.errorRate),
    p50Ms: Math.max(current.p50Ms, edge.p50Ms),
    p95Ms: Math.max(current.p95Ms, edge.p95Ms),
    baselineMedianMs: Math.max(current.baselineMedianMs, edge.baselineMedianMs),
    slowMedianMs: Math.max(current.slowMedianMs, edge.slowMedianMs),
    slowDeltaMs: Math.max(current.slowDeltaMs, edge.slowDeltaMs),
    baselineObservedTraceCount,
    slowObservedTraceCount,
    latencyComparisonAvailable: current.latencyComparisonAvailable || edge.latencyComparisonAvailable,
    baselinePresenceRate: Math.max(current.baselinePresenceRate, edge.baselinePresenceRate),
    slowPresenceRate: Math.max(current.slowPresenceRate, edge.slowPresenceRate),
    slowPresenceLift: Math.max(current.slowPresenceLift, edge.slowPresenceLift),
    impact: current.impact + edge.impact,
    rank: Math.min(current.rank, edge.rank),
    traceIds,
    slowTraceIds,
    memberEdgeKeys: [...current.memberEdgeKeys, edge.key]
  }
}

export function groupTraceServiceMap(
  nodes: TraceCohortNode[],
  edges: TraceCohortEdge[],
  grouping: TraceServiceMapGrouping,
  expandedGroups: ReadonlySet<string>,
  cohortTraceCount: number
): TraceServiceMapGroupedView {
  if (grouping === 'none') {
    const viewNodes = nodes.map(serviceNode)
    const viewEdges = edges.map((edge) => ({ ...edge, memberEdgeKeys: [edge.key] }))
    return {
      nodes: viewNodes,
      edges: viewEdges,
      nodeById: new Map(viewNodes.map((node) => [node.id, node])),
      edgeById: new Map(viewEdges.map((edge) => [edge.key, edge]))
    }
  }

  const nodesByNamespace = new Map<string, TraceCohortNode[]>()
  for (const node of nodes) {
    const namespace = namespaceFor(node)
    const members = nodesByNamespace.get(namespace) ?? []
    members.push(node)
    nodesByNamespace.set(namespace, members)
  }

  const viewNodes: TraceServiceMapViewNode[] = []
  const endpointByService = new Map<string, string>()
  for (const [namespace, members] of [...nodesByNamespace.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (expandedGroups.has(namespace)) {
      for (const member of members) {
        const viewNode = serviceNode(member)
        viewNodes.push(viewNode)
        endpointByService.set(member.id, member.id)
      }
    } else {
      const viewNode = groupNode(namespace, members)
      viewNodes.push(viewNode)
      for (const member of members) endpointByService.set(member.id, viewNode.id)
    }
  }

  const nodeById = new Map(viewNodes.map((node) => [node.id, node]))
  const groupedEdges = new Map<string, TraceServiceMapViewEdge>()
  for (const edge of edges) {
    const sourceId = endpointByService.get(edge.source)
    const targetId = endpointByService.get(edge.target)
    if (!sourceId || !targetId || sourceId === targetId) continue
    const source = nodeById.get(sourceId)
    const target = nodeById.get(targetId)
    if (!source || !target) continue
    const key = `view:${sourceId}->${targetId}`
    groupedEdges.set(key, aggregateEdge(groupedEdges.get(key), edge, source, target, cohortTraceCount))
  }

  const viewEdges = [...groupedEdges.values()]
    .sort((left, right) => right.impact - left.impact || left.rank - right.rank || left.key.localeCompare(right.key))
    .map((edge, index) => ({ ...edge, rank: index + 1 }))

  return {
    nodes: viewNodes,
    edges: viewEdges,
    nodeById,
    edgeById: new Map(viewEdges.map((edge) => [edge.key, edge]))
  }
}
