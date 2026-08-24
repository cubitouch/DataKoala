import { isValidLokiLabelName } from './loki-builder.ts'

export interface LokiTrendExpressions { trend: string; cardinalityProbe?: string }
export function buildLokiTrendExpressions(expression: string, window: string, groupBy: readonly string[], resultKind: 'logs' | 'metrics'): LokiTrendExpressions | null {
  if (resultKind === 'metrics') return null
  const labels = [...new Set(groupBy)]
  if (!labels.length) return { trend: `sum (count_over_time((${expression})[${window}]))` }
  if (labels.some((label) => !isValidLokiLabelName(label))) throw new Error('Invalid Loki grouping label.')
  const grouping = labels.join(', ')
  return {
    trend: `sum by (${grouping}) (count_over_time((${expression})[${window}]))`,
    cardinalityProbe: `count(sum by (${grouping}) (count_over_time((${expression})[${window}])))`
  }
}
