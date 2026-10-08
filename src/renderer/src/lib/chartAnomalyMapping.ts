import type { AiAnomalyAnalysis, AiDetectedAnomaly } from '@shared/ai'
import type { SampledChartSeries } from './chartAnomalySampling.ts'

export interface SubmittedAnomalySeries {
  chartSeriesIndex: number
  sample: SampledChartSeries
}

export interface ChartAnomalyAnnotation extends AiDetectedAnomaly {
  chartSeriesIndex: number
  seriesName: string
  originalIndex: number
  x: unknown
  y: number
}

export function resolveAiAnomalies(
  analysis: AiAnomalyAnalysis,
  submitted: readonly SubmittedAnomalySeries[],
  chartSeries: readonly {
    name: string
    data: readonly (number | null)[]
    missing?: readonly boolean[]
  }[],
  xValues: readonly unknown[],
  visibility: Readonly<Record<string, boolean>>,
  valueAxisScale: 'linear' | 'log' = 'linear',
): ChartAnomalyAnnotation[] {
  const resolved: ChartAnomalyAnnotation[] = []
  const used = new Set<string>()
  for (const anomaly of analysis.anomalies) {
    const submittedSeries = submitted[anomaly.seriesIndex]
    if (!submittedSeries) continue
    const samplePoint = submittedSeries.sample.points[anomaly.pointIndex]
    if (!samplePoint) continue
    const series = chartSeries[submittedSeries.chartSeriesIndex]
    if (!series || series.name !== submittedSeries.sample.name) continue
    if (visibility[series.name] === false) continue
    const originalIndex = samplePoint.originalIndex
    const y = series.data[originalIndex]
    if (
      !Number.isInteger(originalIndex) ||
      originalIndex < 0 ||
      originalIndex >= series.data.length ||
      series.missing?.[originalIndex] ||
      typeof y !== 'number' ||
      !Number.isFinite(y) ||
      y !== samplePoint.y ||
      (valueAxisScale === 'log' && y <= 0)
    )
      continue
    const key = `${submittedSeries.chartSeriesIndex}:${originalIndex}`
    if (used.has(key)) continue
    used.add(key)
    resolved.push({
      ...anomaly,
      chartSeriesIndex: submittedSeries.chartSeriesIndex,
      seriesName: series.name,
      originalIndex,
      x: xValues[originalIndex],
      y,
    })
  }
  return resolved
}
