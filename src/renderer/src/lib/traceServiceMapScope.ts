import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'

export type TraceServiceMapScope = 'all' | 'main' | 'async'

interface ScopedTraceServiceMap {
  nodes: TraceCohortNode[]
  edges: TraceCohortEdge[]
}

function rootNodeIds(nodes: TraceCohortNode[], edges: TraceCohortEdge[]): string[] {
  const explicit = nodes.filter((node) => node.rootTraceCount > 0).map((node) => node.id)
  const incoming = new Set(edges.map((edge) => edge.target))
  const inferred = nodes.filter((node) => !incoming.has(node.id)).map((node) => node.id)
  const roots = [...new Set([...explicit, ...inferred])]
  return roots.length ? roots : nodes.slice(0, 1).map((node) => node.id)
}

export function scopeTraceServiceMap(
  nodes: TraceCohortNode[],
  edges: TraceCohortEdge[],
  scope: TraceServiceMapScope
): ScopedTraceServiceMap {
  if (scope === 'all' || !nodes.length) return { nodes, edges }

  const nodeIds = new Set(nodes.map((node) => node.id))
  const outgoing = new Map<string, TraceCohortEdge[]>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  }

  const roots = rootNodeIds(nodes, edges)
  const selectedEdges = new Set<string>()
  const selectedNodes = new Set<string>(scope === 'main' ? roots : [])
  const queue = roots.map((id) => ({ id, crossedAsync: false }))
  const visited = new Set<string>()

  while (queue.length) {
    const state = queue.shift()!
    const visitKey = `${state.id}:${state.crossedAsync ? 'async' : 'main'}`
    if (visited.has(visitKey)) continue
    visited.add(visitKey)

    for (const edge of outgoing.get(state.id) ?? []) {
      const crossesAsync = edge.kind !== 'sync'
      const nextCrossedAsync = state.crossedAsync || crossesAsync

      if (scope === 'main') {
        if (nextCrossedAsync) continue
        selectedEdges.add(edge.key)
        selectedNodes.add(edge.source)
        selectedNodes.add(edge.target)
      } else if (nextCrossedAsync) {
        selectedEdges.add(edge.key)
        selectedNodes.add(edge.source)
        selectedNodes.add(edge.target)
      }

      queue.push({ id: edge.target, crossedAsync: nextCrossedAsync })
    }
  }

  return {
    nodes: nodes.filter((node) => selectedNodes.has(node.id)),
    edges: edges.filter((edge) => selectedEdges.has(edge.key))
  }
}
