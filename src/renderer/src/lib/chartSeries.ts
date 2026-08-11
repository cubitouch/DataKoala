import type { ChartSeries } from './resultVisualization.ts'

export interface SeriesMetrics {
  series: ChartSeries
  identity: string
  normalizedName: string
  finiteSum: number
  finiteAbsoluteSum: number
  nonNullPoints: number
  originalIndex: number
}

export function normalizeSeriesName(name: string): string { return name.normalize('NFKC').trim().toLocaleLowerCase('en-US') }

/** Negative totals sort after larger (including positive) totals; absolute sum is diagnostic only. */
export function measureChartSeries(series: readonly ChartSeries[]): SeriesMetrics[] {
  return series.map((item, originalIndex) => {
    let finiteSum = 0; let finiteAbsoluteSum = 0; let nonNullPoints = 0
    for (const value of item.data) if (typeof value === 'number' && Number.isFinite(value)) {
      finiteSum += value; finiteAbsoluteSum += Math.abs(value); nonNullPoints++
    }
    return { series: item, identity: item.name, normalizedName: normalizeSeriesName(item.name), finiteSum, finiteAbsoluteSum, nonNullPoints, originalIndex }
  })
}

export function orderChartSeries(series: readonly ChartSeries[]): ChartSeries[] {
  return measureChartSeries(series).sort((a, b) => b.finiteSum - a.finiteSum || a.normalizedName.localeCompare(b.normalizedName, 'en-US') || a.originalIndex - b.originalIndex).map(({ series }) => series)
}
