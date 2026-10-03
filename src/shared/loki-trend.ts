import { isValidLokiLabelName } from './loki-builder.ts'

export interface LokiTrendExpressions { trend: string; cardinalityProbe?: string }

export const LOKI_TREND_TARGET_POINTS = 1_200
const LOKI_TREND_FRIENDLY_STEPS = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600, 7_200, 21_600, 43_200, 86_400] as const

export function lokiTrendStep(start: string, end: string, targetPoints = LOKI_TREND_TARGET_POINTS): string {
  const rangeSeconds = Math.max(0, (Date.parse(end) - Date.parse(start)) / 1_000)
  const minimum = Math.max(1, Math.ceil(rangeSeconds / targetPoints))
  const friendly = LOKI_TREND_FRIENDLY_STEPS.find((seconds) => seconds >= minimum)
  return friendly ? `${friendly}s` : `${Math.ceil(minimum / 86_400)}d`
}
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
