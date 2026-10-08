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
  if (mode === 'analyze') signal += (node.actualTotalTimeMs ?? 0) * 100
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
  if (nodes.some((node) => node.parentId && !ids.has(node.parentId)))
    throw new Error('Execution plan contains an unknown parent node.')
  const metrics = boundedMetrics(input, mode)
  let truncated = input.truncated === true || nodes.length > AI_LIMITS.planNodes
  const bySignal = [...nodes]
    .filter((node) => node.id !== '0')
    .sort(
      (a, b) =>
        nodeSignal(b, mode) - nodeSignal(a, mode) || a.id.localeCompare(b.id),
    )
  const retained = new Set([
    '0',
    ...bySignal
      .slice(0, Math.max(0, AI_LIMITS.planNodes - 1))
      .map((node) => node.id),
  ])
  let boundedNodes = nodes.filter((node) => retained.has(node.id))
  if (boundedNodes.length !== nodes.length) truncated = true
  const normalizeParents = () => {
    boundedNodes = boundedNodes.map((node) =>
      node.parentId && !retained.has(node.parentId)
        ? (Object.fromEntries(
            Object.entries(node).filter(([key]) => key !== 'parentId'),
          ) as AiExecutionPlanNode)
        : node,
    )
  }
  normalizeParents()
  const serialize = () =>
    JSON.stringify({ truncated, ...metrics, nodes: boundedNodes })
  while (
    serialize().length > AI_LIMITS.planCharacters &&
    boundedNodes.length > 1
  ) {
    const remove = [...boundedNodes]
      .filter((node) => node.id !== '0')
      .sort(
        (a, b) =>
          nodeSignal(a, mode) - nodeSignal(b, mode) || b.id.localeCompare(a.id),
      )[0]
    if (!remove) break
    retained.delete(remove.id)
    boundedNodes = boundedNodes.filter((node) => node.id !== remove.id)
    normalizeParents()
    truncated = true
  }
  if (serialize().length > AI_LIMITS.planCharacters)
    throw new Error('Execution plan context exceeds the AI limit.')
  return { truncated, ...metrics, nodes: boundedNodes }
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
