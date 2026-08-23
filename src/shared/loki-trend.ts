import { isValidLokiLabelName } from './loki-builder.ts'

export interface LokiTrendExpressions { trend: string; cardinalityProbe?: string }
export function buildLokiTrendExpressions(expression: string, window: string, breakdown: string | null, resultKind: 'logs' | 'metrics'): LokiTrendExpressions | null {
  if (resultKind === 'metrics') return null
  if (!breakdown) return { trend: `sum (count_over_time((${expression})[${window}]))` }
  if (!isValidLokiLabelName(breakdown)) throw new Error('Invalid Loki breakdown label.')
  return {
    trend: `sum by (${breakdown}) (count_over_time((${expression})[${window}]))`,
    cardinalityProbe: `count(sum by (${breakdown}) (count_over_time((${expression})[${window}])))`
  }
}
