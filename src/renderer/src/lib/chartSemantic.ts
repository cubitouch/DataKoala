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
