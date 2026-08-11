import type { TimeBucket } from '../store/useStore'
import { timeBucketRange } from './chartPointFilters.ts'

export interface ChartTimeSelectionRange {
  startInclusive: string
  endExclusive: string
}

function timestamp(value: unknown): number | null {
  const date = value instanceof Date ? value : new Date(String(value))
  const valueMs = date.getTime()
  return Number.isFinite(valueMs) ? valueMs : null
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
 * result filters. Category brush coordinates are normally indexes; timestamp
 * coordinates are accepted as a defensive fallback.
 */
export function chartTimeSelectionRange(
  coordRange: readonly unknown[],
  xValues: readonly unknown[],
  bucket?: TimeBucket
): ChartTimeSelectionRange | null {
  if (coordRange.length < 2 || !isTemporalChartValues(xValues)) return null
  const firstIndex = selectedIndex(coordRange[0], xValues)
  const lastIndex = selectedIndex(coordRange[1], xValues)
  if (firstIndex === null || lastIndex === null) return null

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
