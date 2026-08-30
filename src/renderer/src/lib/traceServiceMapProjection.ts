import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'

export interface TraceServiceMapProjection {
  nodes: TraceCohortNode[]
  edges: TraceCohortEdge[]
  omittedNodeCount: number
  omittedEdgeCount: number
}

export const DEFAULT_SERVICE_MAP_NODE_LIMIT = 60
export const DEFAULT_SERVICE_MAP_EDGE_LIMIT = 120

export function projectTraceServiceMap(
  nodes: TraceCohortNode[],
  edges: TraceCohortEdge[],
  nodeLimit = DEFAULT_SERVICE_MAP_NODE_LIMIT,
  edgeLimit = DEFAULT_SERVICE_MAP_EDGE_LIMIT
): TraceServiceMapProjection {
  const maximumNodes = Math.max(1, Math.floor(nodeLimit))
  const maximumEdges = Math.max(0, Math.floor(edgeLimit))
  if (nodes.length <= maximumNodes && edges.length <= maximumEdges) {
    return { nodes, edges, omittedNodeCount: 0, omittedEdgeCount: 0 }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const selectedNodeIds = new Set<string>()
  const projectedEdges: TraceCohortEdge[] = []

  const root = [...nodes].sort((left, right) =>
    right.rootTraceCount - left.rootTraceCount ||
    right.traceCount - left.traceCount ||
    right.incidentImpact - left.incidentImpact ||
    left.id.localeCompare(right.id)
  )[0]
  if (root) selectedNodeIds.add(root.id)

  for (const edge of edges) {
    if (projectedEdges.length >= maximumEdges) break
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue
    const additions = [edge.source, edge.target].filter((id) => !selectedNodeIds.has(id))
    if (selectedNodeIds.size + additions.length > maximumNodes) continue
    additions.forEach((id) => selectedNodeIds.add(id))
    projectedEdges.push(edge)
  }

  if (selectedNodeIds.size < maximumNodes) {
    for (const node of nodes) {
      selectedNodeIds.add(node.id)
      if (selectedNodeIds.size >= maximumNodes) break
    }
  }

  const projectedNodes = nodes.filter((node) => selectedNodeIds.has(node.id))
  return {
    nodes: projectedNodes,
    edges: projectedEdges,
    omittedNodeCount: Math.max(0, nodes.length - projectedNodes.length),
    omittedEdgeCount: Math.max(0, edges.length - projectedEdges.length)
  }
}
