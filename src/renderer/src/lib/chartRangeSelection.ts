import type { TimeBucket } from '../store/useStore'
import { timeBucketRange } from './chartPointFilters.ts'
import type { ResultFilter } from './resultFilters.ts'

export interface ChartTimeDomain {
  min: number
  max: number
}

export interface ChartTimeSelectionRange {
  startInclusive: string
  endExclusive: string
}

function timestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const date = value instanceof Date ? value : new Date(String(value))
  const valueMs = date.getTime()
  return Number.isFinite(valueMs) ? valueMs : null
}

/**
 * Narrows the chart viewport to client-side range filters on its current X
 * axis. Query filters are already represented by the picker/query domain and
 * must not independently alter the viewport here.
 */
export function effectiveChartTimeDomain(
  chartTimeDomain: ChartTimeDomain | null | undefined,
  filters: readonly ResultFilter[],
  xColumn: string | null | undefined
): ChartTimeDomain | null | undefined {
  if (!xColumn) return chartTimeDomain

  const ranges = filters.flatMap((filter) => {
    if (filter.column !== xColumn || filter.operator !== 'range' || filter.execution === 'query') return []
    const min = timestamp(filter.startInclusive)
    const max = timestamp(filter.endExclusive)
    return min !== null && max !== null && min < max ? [{ min, max }] : []
  })
  if (!ranges.length) return chartTimeDomain

  const intersection = ranges.reduce<ChartTimeDomain>((domain, range) => ({
    min: Math.max(domain.min, range.min),
    max: Math.min(domain.max, range.max)
  }), chartTimeDomain ?? ranges[0])

  return intersection.min < intersection.max ? intersection : chartTimeDomain
}

export function isTemporalChartValues(values: readonly unknown[]): boolean {
  return values.length > 0 && values.every((value) => timestamp(value) !== null)
}

function selectedIndex(value: unknown, values: readonly unknown[]): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < values.length) return value
  const target = timestamp(value)
  if (target === null) return null
  const index = values.findIndex((candidate) => timestamp(candidate) === target)
  return index >= 0 ? index : null
}

/**
 * Converts an ECharts lineX brush range into the half-open time range used by
 * result filters. Category brush coordinates are normally indexes; a real time
 * axis returns millisecond timestamps and may start/end between actual points.
 */
export function chartTimeSelectionRange(
  coordRange: readonly unknown[],
  xValues: readonly unknown[],
  bucket?: TimeBucket
): ChartTimeSelectionRange | null {
  if (coordRange.length < 2 || !isTemporalChartValues(xValues)) return null

  const firstIndex = selectedIndex(coordRange[0], xValues)
  const lastIndex = selectedIndex(coordRange[1], xValues)
  const categoryCoordinates = firstIndex !== null && lastIndex !== null
  if (!categoryCoordinates) {
    const firstMs = timestamp(coordRange[0])
    const lastMs = timestamp(coordRange[1])
    if (firstMs === null || lastMs === null || firstMs === lastMs) return null
    const startMs = Math.min(firstMs, lastMs)
    const endMs = Math.max(firstMs, lastMs)
    return { startInclusive: new Date(startMs).toISOString(), endExclusive: new Date(endMs).toISOString() }
  }

  const startIndex = Math.min(firstIndex, lastIndex)
  const endIndex = Math.max(firstIndex, lastIndex)
  const startMs = timestamp(xValues[startIndex])
  const selectedEndMs = timestamp(xValues[endIndex])
  if (startMs === null || selectedEndMs === null) return null

  if (bucket) {
    const endBucket = timeBucketRange(xValues[endIndex], bucket)
    if (!endBucket) return null
    return { startInclusive: new Date(startMs).toISOString(), endExclusive: endBucket.endExclusive }
  }

  const nextMs = endIndex + 1 < xValues.length ? timestamp(xValues[endIndex + 1]) : null
  const endExclusiveMs = nextMs !== null && nextMs > selectedEndMs ? nextMs : selectedEndMs + 1
  return { startInclusive: new Date(startMs).toISOString(), endExclusive: new Date(endExclusiveMs).toISOString() }
}
