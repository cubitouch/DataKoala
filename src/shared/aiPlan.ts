import {
  AI_LIMITS,
  type AiExecutionPlanContext,
  type AiExecutionPlanNode,
} from './ai.ts'
import type { ExplainNode } from './types.ts'

type PlanMode = 'explain' | 'analyze'

const textFields = [
  'nodeType',
  'schema',
  'relation',
  'alias',
  'index',
  'joinType',
  'strategy',
  'filter',
  'indexCondition',
  'hashCondition',
  'mergeCondition',
  'joinFilter',
  'sortMethod',
  'sortSpaceType',
] as const
const numberFields = [
  'startupCost',
  'totalCost',
  'estimatedRows',
  'actualRows',
  'loops',
  'actualTotalTimeMs',
  'rowsRemovedByFilter',
  'sharedHitBlocks',
  'sharedReadBlocks',
  'tempReadBlocks',
  'tempWrittenBlocks',
  'sortSpaceUsedKb',
  'hashBatches',
  'peakMemoryUsageKb',
] as const

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function cleanText(
  value: unknown,
  max: number = AI_LIMITS.planNodeText,
): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.slice(0, max)
}

function cleanKeyList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.slice(0, AI_LIMITS.planKeysPerNode).flatMap((item) => {
    const text = cleanText(item, AI_LIMITS.planKeyCharacters)
    return text ? [text] : []
  })
  return result.length ? result : undefined
}

function sanitizeNode(
  value: unknown,
  mode: PlanMode,
): AiExecutionPlanNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const id = cleanText(input.id, 128)
  const nodeType = cleanText(input.nodeType, 128)
  if (!id || !/^\d+(?:\.\d+)*$/.test(id) || !nodeType) return null
  const parentId = cleanText(input.parentId, 128)
  const node: AiExecutionPlanNode = {
    id,
    nodeType,
    ...(parentId && /^\d+(?:\.\d+)*$/.test(parentId) ? { parentId } : {}),
  }
  for (const field of textFields) {
    if (field === 'nodeType') continue
    const text = cleanText(input[field])
    if (text) Object.assign(node, { [field]: text })
  }
  for (const field of numberFields) {
    if (
      mode === 'explain' &&
      [
        'actualRows',
        'loops',
        'actualTotalTimeMs',
        'rowsRemovedByFilter',
        'sharedHitBlocks',
        'sharedReadBlocks',
        'tempReadBlocks',
        'tempWrittenBlocks',
        'sortSpaceUsedKb',
        'hashBatches',
        'peakMemoryUsageKb',
      ].includes(field)
    )
      continue
    if (finiteNonNegative(input[field]))
      Object.assign(node, { [field]: input[field] })
  }
  const groupKey = cleanKeyList(input.groupKey)
  const sortKey = cleanKeyList(input.sortKey)
  if (groupKey) node.groupKey = groupKey
  if (sortKey) node.sortKey = sortKey
  if (mode === 'explain') {
    delete node.sortMethod
    delete node.sortSpaceType
  }
  return node
}

function nodeSignal(node: AiExecutionPlanNode, mode: PlanMode): number {
  let signal = 0
  if (mode === 'analyze') {
    const measuredTime = (node.actualTotalTimeMs ?? 0) * (node.loops ?? 1)
    signal += measuredTime * 100
  }
  signal += (node.totalCost ?? 0) * 0.001
  if (
    mode === 'analyze' &&
    node.actualRows !== undefined &&
    node.estimatedRows !== undefined
  ) {
    const high = Math.max(node.actualRows, node.estimatedRows)
    const low = Math.min(node.actualRows, node.estimatedRows)
    if (high > 0 && low === 0) signal += 1_000_000
    else if (low > 0) signal += Math.min(1_000_000, high / low)
  }
  if (mode === 'analyze') {
    signal += (node.rowsRemovedByFilter ?? 0) * 0.01
    signal += (node.sharedReadBlocks ?? 0) * 0.001
    signal += (node.tempReadBlocks ?? 0) * 0.01
    signal += (node.tempWrittenBlocks ?? 0) * 0.01
  }
  return signal
}

function boundedMetrics(raw: Record<string, unknown>, mode: PlanMode) {
  return {
    ...(finiteNonNegative(raw.planningTimeMs)
      ? { planningTimeMs: raw.planningTimeMs }
      : {}),
    ...(mode === 'analyze' && finiteNonNegative(raw.executionTimeMs)
      ? { executionTimeMs: raw.executionTimeMs }
      : {}),
  }
}

/** Rebuilds an explicit plan allowlist and trims it deterministically for AI disclosure. */
export function sanitizeAiExecutionPlanContext(
  value: unknown,
  mode: PlanMode,
): AiExecutionPlanContext {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid execution plan context.')
  const input = value as Record<string, unknown>
  if (!Array.isArray(input.nodes) || input.nodes.length === 0)
    throw new Error('Execution plan has no nodes.')
  if (input.nodes.length > 10_000)
    throw new Error('Execution plan input is too large.')
  const sanitized = input.nodes.map((node) => sanitizeNode(node, mode))
  if (sanitized.some((node) => !node))
    throw new Error('Execution plan contains an invalid node.')
  const nodes = sanitized as AiExecutionPlanNode[]
  const ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(node.id))
      throw new Error('Execution plan node IDs must be unique.')
    ids.add(node.id)
  }
  if (!ids.has('0')) throw new Error('Execution plan root is missing.')
  if (nodes.some((node) => node.id === '0' && node.parentId))
    throw new Error('Execution plan root cannot have a parent.')
  if (nodes.some((node) => node.id !== '0' && !node.parentId))
    throw new Error('Execution plan node is missing its parent.')
  if (nodes.some((node) => node.parentId && !ids.has(node.parentId)))
    throw new Error('Execution plan contains an unknown parent node.')
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const reachesRoot = new Set(['0'])
  for (const node of nodes) {
    if (reachesRoot.has(node.id)) continue
    const path: string[] = []
    const pathIds = new Set<string>()
    let ancestor: AiExecutionPlanNode | undefined = node
    while (ancestor && !reachesRoot.has(ancestor.id)) {
      if (pathIds.has(ancestor.id))
        throw new Error('Execution plan contains a parent cycle.')
      path.push(ancestor.id)
      pathIds.add(ancestor.id)
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined
    }
    if (!ancestor)
      throw new Error('Execution plan node does not lead to the root.')
    for (const id of path) reachesRoot.add(id)
  }
  const metrics = boundedMetrics(input, mode)
  let truncated = input.truncated === true
  const bySignal = [...nodes]
    .filter((node) => node.id !== '0')
    .sort(
      (a, b) =>
        nodeSignal(b, mode) - nodeSignal(a, mode) || a.id.localeCompare(b.id),
    )
  const positions = new Map(nodes.map((node, index) => [node.id, index]))
  let retained = new Set(['0'])
  const selectedNodes = (ids: ReadonlySet<string>) =>
    [...ids]
      .map((id) => byId.get(id)!)
      .sort((a, b) => positions.get(a.id)! - positions.get(b.id)!)
  const fits = (ids: ReadonlySet<string>) => {
    if (ids.size > AI_LIMITS.planNodes) return false
    return (
      JSON.stringify({
        truncated: true,
        ...metrics,
        nodes: selectedNodes(ids),
      }).length <= AI_LIMITS.planCharacters
    )
  }

  // Add each highest-signal node together with its complete ancestor chain.
  // Ancestors consume node and character budget like any other submitted node.
  for (const node of bySignal) {
    if (retained.has(node.id)) continue
    const chain: AiExecutionPlanNode[] = []
    let ancestor: AiExecutionPlanNode | undefined = node
    while (ancestor && !retained.has(ancestor.id)) {
      chain.push(ancestor)
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined
    }
    const next = new Set(retained)
    for (const item of chain) next.add(item.id)
    if (fits(next)) retained = next
  }

  const boundedNodes = selectedNodes(retained)
  truncated = truncated || boundedNodes.length !== nodes.length
  const result = { truncated, ...metrics, nodes: boundedNodes }
  if (JSON.stringify(result).length > AI_LIMITS.planCharacters)
    throw new Error('Execution plan context exceeds the AI limit.')
  return result
}

export function explainTreeToAiExecutionPlan(
  tree: ExplainNode,
  metrics: { planningTimeMs?: number; executionTimeMs?: number },
  mode: PlanMode,
): AiExecutionPlanContext {
  const nodes: Array<Record<string, unknown>> = []
  const visit = (node: ExplainNode, parentId?: string) => {
    nodes.push({
      id: node.id,
      ...(parentId ? { parentId } : {}),
      nodeType: node.nodeType,
      schema: node.schema,
      relation: node.relation,
      alias: node.alias,
      index: node.index,
      joinType: node.joinType,
      strategy: node.strategy,
      startupCost: node.startupCost,
      totalCost: node.totalCost,
      estimatedRows: node.planRows,
      actualRows: node.actualRows,
      loops: node.loops,
      actualTotalTimeMs: node.actualTotalTime,
      filter: node.filter,
      indexCondition: node.indexCond,
      hashCondition: node.hashCond,
      mergeCondition: node.mergeCond,
      joinFilter: node.joinFilter,
      groupKey: node.groupKey,
      sortKey: node.sortKey,
      rowsRemovedByFilter: node.rowsRemovedByFilter,
      sharedHitBlocks: node.sharedHitBlocks,
      sharedReadBlocks: node.sharedReadBlocks,
      tempReadBlocks: node.tempReadBlocks,
      tempWrittenBlocks: node.tempWrittenBlocks,
      sortMethod: node.sortMethod,
      sortSpaceUsedKb: node.sortSpaceUsed,
      sortSpaceType: node.sortSpaceType,
      hashBatches: node.hashBatches,
      peakMemoryUsageKb: node.peakMemoryUsage,
    })
    for (const child of node.children ?? []) visit(child, node.id)
  }
  visit(tree)
  return sanitizeAiExecutionPlanContext({ ...metrics, nodes }, mode)
}
