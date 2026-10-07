import type { ExplainNode } from '@shared/types'

export type ExplainNodeCategory =
  | 'scan'
  | 'join'
  | 'aggregate'
  | 'sort'
  | 'limit'
  | 'hash'
  | 'materialize'
  | 'subquery'
  | 'other'

export const EXPLAIN_NODE_CATEGORY_LABELS: Record<ExplainNodeCategory, string> =
  {
    scan: 'Scan',
    join: 'Join',
    aggregate: 'Aggregate',
    sort: 'Sort',
    limit: 'Limit',
    hash: 'Hash',
    materialize: 'Materialize',
    subquery: 'CTE / subquery',
    other: 'Other',
  }

export function explainNodeCategory(nodeType: string): ExplainNodeCategory {
  const type = nodeType.trim().toLowerCase()

  if (
    type.includes('cte') ||
    type.includes('subquery') ||
    type.includes('worktable') ||
    type === 'recursive union'
  )
    return 'subquery'
  if (type.includes('join') || type === 'nested loop') return 'join'
  if (type.includes('aggregate')) return 'aggregate'
  if (type.includes('sort')) return 'sort'
  if (type === 'limit') return 'limit'
  if (type === 'hash') return 'hash'
  if (type === 'materialize' || type === 'memoize') return 'materialize'
  if (type.endsWith('scan')) return 'scan'
  return 'other'
}

export interface CardinalityComparison {
  relation: 'close' | 'underestimate' | 'overestimate'
  ratio?: number
  label: string
}

function formatRatio(ratio: number): string {
  if (ratio === 0) return '0× estimate'
  if (ratio < 0.01) return '<0.01× estimate'
  const digits = ratio >= 100 ? 0 : ratio >= 10 ? 1 : 2
  const value = ratio
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1')
  return `${value}× estimate`
}

export function compareCardinality(
  node: Pick<ExplainNode, 'planRows' | 'actualRows'>,
): CardinalityComparison | null {
  const { planRows, actualRows } = node
  if (planRows === undefined || actualRows === undefined) return null

  if (planRows === 0) {
    if (actualRows === 0)
      return { relation: 'close', ratio: 1, label: '1× estimate' }
    return {
      relation: 'underestimate',
      label: 'estimate 0 · actual > 0',
    }
  }

  const ratio = actualRows / planRows
  return {
    relation:
      ratio >= 2 ? 'underestimate' : ratio <= 0.5 ? 'overestimate' : 'close',
    ratio,
    label: formatRatio(ratio),
  }
}

export interface ExplainNodeTiming {
  perLoopMs: number
  loops: number
  approxTotalMs: number
}

export function explainNodeTiming(
  node: Pick<ExplainNode, 'actualTotalTime' | 'loops'>,
): ExplainNodeTiming | null {
  if (node.actualTotalTime === undefined) return null
  const loops = Math.max(0, node.loops ?? 1)
  return {
    perLoopMs: node.actualTotalTime,
    loops,
    approxTotalMs: node.actualTotalTime * loops,
  }
}

export function explainNodeWorkValue(
  node: ExplainNode,
  analyze: boolean,
): number | undefined {
  if (!analyze) return node.totalCost
  return explainNodeTiming(node)?.approxTotalMs
}
