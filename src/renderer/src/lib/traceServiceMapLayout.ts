import type { TraceCohortEdge, TraceCohortNode } from './traceCohort.ts'

export interface TraceServiceMapPosition {
  x: number
  y: number
  layer: number
  order: number
}

const MIN_HORIZONTAL_SPACING = 320
const VERTICAL_SPACING = 150
const TARGET_LAYOUT_ASPECT_RATIO = 1.45
const ORDERING_PASSES = 4

function nodePriority(left: TraceCohortNode, right: TraceCohortNode): number {
  return right.rootTraceCount - left.rootTraceCount ||
    right.traceCount - left.traceCount ||
    right.incidentImpact - left.incidentImpact ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
}

function edgeWeight(edge: TraceCohortEdge): number {
  return 1 + Math.min(4, Math.max(0, edge.traceRate) * 4) + (edge.rank <= 3 ? 1 : 0)
}

function weightedBarycenter(
  edges: TraceCohortEdge[],
  neighbour: (edge: TraceCohortEdge) => string,
  order: Map<string, number>,
  groupSize: Map<number, number>,
  layer: Map<string, number>
): number | null {
  let weighted = 0
  let totalWeight = 0
  for (const edge of edges) {
    const id = neighbour(edge)
    const neighbourOrder = order.get(id)
    const neighbourLayer = layer.get(id)
    if (neighbourOrder === undefined || neighbourLayer === undefined) continue
    const size = Math.max(1, groupSize.get(neighbourLayer) ?? 1)
    const normalized = size === 1 ? 0.5 : neighbourOrder / (size - 1)
    const weight = edgeWeight(edge)
    weighted += normalized * weight
    totalWeight += weight
  }
  return totalWeight ? weighted / totalWeight : null
}

function centeredY(index: number, count: number): number {
  return (index - (count - 1) / 2) * VERTICAL_SPACING
}

function packAroundDesired(desired: number[]): number[] {
  if (!desired.length) return []
  const values: number[] = []
  for (let index = 0; index < desired.length; index += 1) {
    values[index] = index === 0 ? desired[index] : Math.max(desired[index], values[index - 1] + VERTICAL_SPACING)
  }
  for (let index = values.length - 2; index >= 0; index -= 1) {
    values[index] = Math.min(values[index], values[index + 1] - VERTICAL_SPACING)
  }
  const desiredMean = desired.reduce((sum, value) => sum + value, 0) / desired.length
  const actualMean = values.reduce((sum, value) => sum + value, 0) / values.length
  const shift = desiredMean - actualMean
  return values.map((value) => value + shift)
}

function horizontalSpacing(groups: Map<number, TraceCohortNode[]>, layers: number[]): number {
  if (layers.length <= 1) return MIN_HORIZONTAL_SPACING
  const densestLayer = Math.max(1, ...layers.map((value) => groups.get(value)?.length ?? 0))
  const verticalExtent = Math.max(VERTICAL_SPACING, (densestLayer - 1) * VERTICAL_SPACING)
  const horizontalIntervals = Math.max(1, layers.length - 1)
  return Math.max(MIN_HORIZONTAL_SPACING, (verticalExtent * TARGET_LAYOUT_ASPECT_RATIO) / horizontalIntervals)
}

export function layoutTraceServiceMap(nodes: TraceCohortNode[], edges: TraceCohortEdge[]): Map<string, TraceServiceMapPosition> {
  const positions = new Map<string, TraceServiceMapPosition>()
  if (!nodes.length) return positions

  const nodeIds = new Set(nodes.map((node) => node.id))
  const outgoing = new Map<string, TraceCohortEdge[]>()
  const incoming = new Map<string, TraceCohortEdge[]>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge])
  }

  const sortedNodes = [...nodes].sort(nodePriority)
  const layer = new Map<string, number>()
  const queue: string[] = []
  const seed = (id: string, value = 0) => {
    if (layer.has(id)) return
    layer.set(id, value)
    queue.push(id)
  }

  const primaryRoot = sortedNodes[0]
  seed(primaryRoot.id)
  while (queue.length) {
    const current = queue.shift()!
    const nextLayer = (layer.get(current) ?? 0) + 1
    for (const edge of outgoing.get(current) ?? []) {
      if (!layer.has(edge.target)) seed(edge.target, nextLayer)
    }
  }

  // Keep disconnected components root-like rather than pushing them into an artificial final column.
  for (const node of sortedNodes) {
    if (layer.has(node.id)) continue
    seed(node.id, 0)
    while (queue.length) {
      const current = queue.shift()!
      const nextLayer = (layer.get(current) ?? 0) + 1
      for (const edge of outgoing.get(current) ?? []) {
        if (!layer.has(edge.target)) seed(edge.target, nextLayer)
      }
    }
  }

  const groups = new Map<number, TraceCohortNode[]>()
  for (const node of nodes) {
    const value = layer.get(node.id) ?? 0
    groups.set(value, [...(groups.get(value) ?? []), node])
  }
  for (const [value, group] of groups) groups.set(value, [...group].sort(nodePriority))

  const layers = [...groups.keys()].sort((left, right) => left - right)
  const layerSpacing = horizontalSpacing(groups, layers)
  const refreshOrder = () => {
    const order = new Map<string, number>()
    const sizes = new Map<number, number>()
    for (const value of layers) {
      const group = groups.get(value) ?? []
      sizes.set(value, group.length)
      group.forEach((node, index) => order.set(node.id, index))
    }
    return { order, sizes }
  }

  for (let pass = 0; pass < ORDERING_PASSES; pass += 1) {
    let { order, sizes } = refreshOrder()
    for (const value of layers.slice(1)) {
      const group = groups.get(value) ?? []
      groups.set(value, [...group].sort((left, right) => {
        const leftScore = weightedBarycenter((incoming.get(left.id) ?? []).filter((edge) => (layer.get(edge.source) ?? value) < value), (edge) => edge.source, order, sizes, layer)
        const rightScore = weightedBarycenter((incoming.get(right.id) ?? []).filter((edge) => (layer.get(edge.source) ?? value) < value), (edge) => edge.source, order, sizes, layer)
        if (leftScore !== null || rightScore !== null) {
          if (leftScore === null) return 1
          if (rightScore === null) return -1
          if (leftScore !== rightScore) return leftScore - rightScore
        }
        return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
      }))
      ;({ order, sizes } = refreshOrder())
    }

    ;({ order, sizes } = refreshOrder())
    for (const value of [...layers].reverse().slice(1)) {
      const group = groups.get(value) ?? []
      groups.set(value, [...group].sort((left, right) => {
        const leftScore = weightedBarycenter((outgoing.get(left.id) ?? []).filter((edge) => (layer.get(edge.target) ?? value) > value), (edge) => edge.target, order, sizes, layer)
        const rightScore = weightedBarycenter((outgoing.get(right.id) ?? []).filter((edge) => (layer.get(edge.target) ?? value) > value), (edge) => edge.target, order, sizes, layer)
        if (leftScore !== null || rightScore !== null) {
          if (leftScore === null) return 1
          if (rightScore === null) return -1
          if (leftScore !== rightScore) return leftScore - rightScore
        }
        return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
      }))
      ;({ order, sizes } = refreshOrder())
    }
  }

  // Establish a stable initial vertical lane for every layer. Dense maps widen their
  // layer spacing so ECharts fits a landscape-shaped coordinate system into the
  // landscape graph pane instead of shrinking a tall, skinny graph into its centre.
  for (const value of layers) {
    const group = groups.get(value) ?? []
    group.forEach((node, index) => positions.set(node.id, {
      x: value * layerSpacing,
      y: centeredY(index, group.length),
      layer: value,
      order: index
    }))
  }

  // Align descendants with the weighted centre of their upstream neighbours while preserving separation.
  for (const value of layers.slice(1)) {
    const group = groups.get(value) ?? []
    const desired = group.map((node, index) => {
      const parentEdges = (incoming.get(node.id) ?? []).filter((edge) => (layer.get(edge.source) ?? value) < value)
      let weighted = 0
      let totalWeight = 0
      for (const edge of parentEdges) {
        const parent = positions.get(edge.source)
        if (!parent) continue
        const weight = edgeWeight(edge)
        weighted += parent.y * weight
        totalWeight += weight
      }
      return totalWeight ? weighted / totalWeight : centeredY(index, group.length)
    })
    const packed = packAroundDesired(desired)
    group.forEach((node, index) => {
      const current = positions.get(node.id)!
      positions.set(node.id, { ...current, y: packed[index], order: index })
    })
  }

  return positions
}
