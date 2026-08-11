import { isNumericType, isTimeType, type ColumnMeta } from '../../../shared/types.ts'
import type { ChartSeries, PivotedResult, ResultView } from './resultVisualization.ts'

export interface AnomalyDetectionOptions { windowSize: number; minimumBaselineSize: number; threshold: number }
export interface ChartAnomaly {
  seriesName: string
  dataIndex: number
  value: number
  median: number
  mad: number
  direction: 'above' | 'below'
}
export type AnomalyEligibility = { available: true } | { available: false; reason: string }

export const DEFAULT_ANOMALY_OPTIONS: AnomalyDetectionOptions = { windowSize: 12, minimumBaselineSize: 6, threshold: 3.5 }

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Detects deviations without mutating the chart or including synthetic missing values. */
export function detectChartAnomalies(series: readonly ChartSeries[], options: AnomalyDetectionOptions = DEFAULT_ANOMALY_OPTIONS): ChartAnomaly[] {
  const anomalies: ChartAnomaly[] = []
  for (const item of series) {
    const history: number[] = []
    let previousAnomaly: number | undefined
    item.data.forEach((raw, dataIndex) => {
      if (item.missing?.[dataIndex] || typeof raw !== 'number' || !Number.isFinite(raw)) return
      const baseline = history.slice(-options.windowSize)
      if (baseline.length >= options.minimumBaselineSize) {
        const center = median(baseline)
        const absoluteDeviations = baseline.map((value) => Math.abs(value - center))
        const mad = median(absoluteDeviations)
        const deviation = Math.abs(raw - center)
        const tolerance = Number.EPSILON * Math.max(1, Math.abs(center), Math.abs(raw)) * 16
        const baselineTolerance = Number.EPSILON * Math.max(1, ...baseline.map(Math.abs)) * 16
        const nonZeroDeviations = absoluteDeviations.filter((value) => value > baselineTolerance)
        const fallbackMad = nonZeroDeviations.length > 0 ? median(nonZeroDeviations) : 0
        const scale = mad || fallbackMad
        const isAnomaly = (scale === 0 && deviation > tolerance) || (scale > 0 && deviation > options.threshold * 1.4826 * scale)
        const repeatsPreviousAnomaly = previousAnomaly !== undefined && Math.abs(raw - previousAnomaly) <= tolerance
        if (isAnomaly && !repeatsPreviousAnomaly) {
          anomalies.push({ seriesName: item.name, dataIndex, value: raw, median: center, mad, direction: raw > center ? 'above' : 'below' })
          // Keep an extreme point out of the baseline unless the next value confirms a stable new level.
          previousAnomaly = raw
          return
        }
      }
      history.push(raw)
      previousAnomaly = undefined
    })
  }
  return anomalies
}

export function chartAnomalyEligibility(chart: PivotedResult | null, view: ResultView, xColumn: ColumnMeta | undefined, minimumBaselineSize = DEFAULT_ANOMALY_OPTIONS.minimumBaselineSize): AnomalyEligibility {
  if (!chart?.renderable) return { available: false, reason: 'Anomaly detection requires a renderable chart.' }
  if (view !== 'line') return { available: false, reason: 'Anomaly detection is available for Line charts.' }
  if (!xColumn || (!isTimeType(xColumn.dataTypeName) && !isNumericType(xColumn.dataTypeName))) return { available: false, reason: 'Anomaly detection requires an ordered time or numeric X axis.' }
  const enough = chart.series.some((series) => series.data.filter((value, index) => !series.missing?.[index] && typeof value === 'number' && Number.isFinite(value)).length > minimumBaselineSize)
  return enough ? { available: true } : { available: false, reason: `Anomaly detection requires at least ${minimumBaselineSize} earlier valid observations.` }
}
