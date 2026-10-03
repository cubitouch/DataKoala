import type { PivotedResult, VisualizationConfiguration } from './resultVisualization.ts'
import type { SeriesVisibility } from './chartVisibility.ts'

// FNV-1a keeps the React dependency compact without retaining/stringifying raw query results.
function hash(parts: readonly string[]): string {
  let value = 0x811c9dc5
  for (const part of parts) for (let index = 0; index < part.length; index++) {
    value ^= part.charCodeAt(index)
    value = Math.imul(value, 0x01000193)
  }
  return (value >>> 0).toString(36)
}

export function createChartFingerprint(chart: PivotedResult | null, configuration: VisualizationConfiguration, visibility: SeriesVisibility): string {
  const parts = [configuration.view, configuration.xColumn ?? '', configuration.valueColumn ?? '', configuration.seriesColumn ?? '', configuration.aggregation, configuration.valueAxisScale ?? 'linear']
  if (chart) {
    parts.push(...chart.labels)
    for (const series of chart.series) {
      parts.push(series.name, visibility[series.name] === false ? 'hidden' : 'visible')
      for (const point of series.data) parts.push(point === null ? 'null' : String(point))
    }
  }
  return hash(parts)
}

interface SemanticChartCounts {
  series: number
  items: number
}

/** Counts data ECharts can actually plot inside the final option's x-axis domain. */
export function semanticChartCounts(option: Record<string, unknown> | null): SemanticChartCounts {
  if (!option) return { series: 0, items: 0 }
  const series = (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []) as Array<Record<string, unknown>>
  const axisValue = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  const axis = axisValue && typeof axisValue === 'object' ? axisValue as Record<string, unknown> : {}
  const timeAxis = axis.type === 'time'
  const min = typeof axis.min === 'number' ? axis.min : typeof axis.min === 'string' ? Date.parse(axis.min) : -Infinity
  const max = typeof axis.max === 'number' ? axis.max : typeof axis.max === 'string' ? Date.parse(axis.max) : Infinity
  const selected = option.legend && typeof option.legend === 'object' && !Array.isArray(option.legend)
    ? ((option.legend as { selected?: Record<string, boolean> }).selected ?? {}) : {}
  const visibleSeries = series.filter((item) => selected[String(item.name ?? '')] !== false)
  const finiteValue = (value: unknown) => typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
  const visible = (datum: unknown) => {
    const value = datum && typeof datum === 'object' && !Array.isArray(datum) ? (datum as { value?: unknown }).value : datum
    const tuple = Array.isArray(value) ? value : null
    const y = tuple ? tuple[tuple.length - 1] : value
    if (!finiteValue(y)) return false
    if (!timeAxis) return true
    if (!tuple || tuple.length < 2) return false
    const rawX = tuple[0]
    const x = typeof rawX === 'number' ? rawX : Date.parse(String(rawX))
    return Number.isFinite(x) && x >= min && x <= max
  }
  return {
    series: visibleSeries.length,
    items: visibleSeries.reduce((count, item) => count + (Array.isArray(item.data) ? item.data.filter(visible).length : 0), 0)
  }
}

/** Render-time checks are pure; only a committed chart lifecycle may advance this policy. */
export class ChartAnimationPolicy {
  private committed: string | null = null
  shouldAnimate(fingerprint: string): boolean {
    return fingerprint !== this.committed
  }
  commit(fingerprint: string): void {
    this.committed = fingerprint
  }
}
