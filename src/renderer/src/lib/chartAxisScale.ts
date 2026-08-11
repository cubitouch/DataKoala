import type { ChartSeries } from './resultVisualization.ts'

export type ValueAxisScale = 'linear' | 'log'
export interface LogScaleValidity { valid: boolean; reason?: string }
export interface LogScalePresentation {
  series: ChartSeries[]
  omittedCount: number
  positiveCount: number
}

/**
 * Kept for callers that only need to know whether any positive value can be
 * plotted. Non-positive values no longer make Log unavailable.
 */
export function validateLogScale(series: readonly ChartSeries[], visibility: Readonly<Record<string, boolean>> = {}): LogScaleValidity {
  const visible = series.filter((item) => visibility[item.name] !== false)
  const positive = visible.some((item) => item.data.some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0))
  return positive ? { valid: true } : { valid: true, reason: 'No strictly positive visible values are available to plot.' }
}

/**
 * Produces presentation-only Log data. Source/result values are never mutated.
 * Genuine finite zero/negative values are counted; synthetic zeroes created for
 * missing series/bucket combinations are omitted without inflating the count.
 */
export function prepareLogScaleSeries(
  series: readonly ChartSeries[],
  visibility: Readonly<Record<string, boolean>> = {}
): LogScalePresentation {
  let omittedCount = 0
  let positiveCount = 0
  const prepared = series.map((item) => ({
    ...item,
    data: item.data.map((value, index) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      if (value > 0) {
        if (visibility[item.name] !== false) positiveCount++
        return value
      }
      if (visibility[item.name] !== false && !item.missing?.[index]) omittedCount++
      return null
    })
  }))
  return { series: prepared, omittedCount, positiveCount }
}
