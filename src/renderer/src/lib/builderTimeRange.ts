import type { CardinalityProbePredicate } from '../../../shared/chartLimits.ts'
import type { TimeBucket } from '../store/useStore'
import { addDays, customRangeToQueryBounds, validateCustomRange, type TimeWindow } from './customTimeRange.ts'

export type BuilderTimeRange =
  | { kind: 'all' }
  | { kind: 'rolling'; amount: 1 | 6 | 12 | 24; unit: 'hour' }
  | { kind: 'rolling'; amount: 7 | 30; unit: 'day' }
  | { kind: 'rolling'; amount: 3 | 6 | 12; unit: 'month' }
  | { kind: 'custom'; startDate: string | null; startTime: string; endDate: string | null; endTime: string; recurringWindows?: TimeWindow[] }

export const SEVEN_DAYS: BuilderTimeRange = { kind: 'rolling', amount: 7, unit: 'day' }
export const EMPTY_BUILDER_CUSTOM_RANGE: BuilderTimeRange = { kind: 'custom', startDate: null, startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }
export const MINUTE_BUCKET_UNAVAILABLE_REASON = 'Minute is available only for time ranges of 24 hours or less.'

export function normalizeBuilderTimeRange(range: BuilderTimeRange | (Record<string, unknown> & { kind?: unknown })): BuilderTimeRange {
  if (range.kind !== 'custom') return range as BuilderTimeRange
  const value = range as Record<string, unknown>
  if ('startDate' in value || 'endDate' in value || 'recurringWindows' in value) {
    return {
      kind: 'custom',
      startDate: typeof value.startDate === 'string' ? value.startDate : null,
      startTime: typeof value.startTime === 'string' ? value.startTime : '00:00',
      endDate: typeof value.endDate === 'string' ? value.endDate : null,
      endTime: typeof value.endTime === 'string' ? value.endTime : '00:00',
      recurringWindows: Array.isArray(value.recurringWindows) ? value.recurringWindows as TimeWindow[] : []
    }
  }
  const startInclusive = typeof value.startInclusive === 'string' ? value.startInclusive : null
  const endInclusive = typeof value.endExclusive === 'string' ? value.endExclusive : null
  return {
    kind: 'custom', startDate: startInclusive ? startInclusive.slice(0, 10) : null, startTime: '00:00',
    endDate: endInclusive ? addDays(endInclusive.slice(0, 10), 1) : null, endTime: '00:00',
    recurringWindows: Array.isArray(value.timeWindows) ? value.timeWindows as TimeWindow[] : []
  }
}

export function validateBuilderTimeRange(range: BuilderTimeRange): string | null {
  if (range.kind !== 'custom') return null
  return validateCustomRange({ startDate: range.startDate, startTime: range.startTime, endDate: range.endDate, endTime: range.endTime, recurringWindows: range.recurringWindows ?? [] })
}

function customRangeDurationMilliseconds(range: Extract<BuilderTimeRange, { kind: 'custom' }>): number | null {
  if (validateBuilderTimeRange(range) || !range.startDate || !range.endDate) return null
  const start = Date.parse(`${range.startDate}T${range.startTime}:00Z`)
  const end = Date.parse(`${range.endDate}T${range.endTime}:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return end - start
}

export function isMinuteBucketAvailable(range: BuilderTimeRange): boolean {
  if (range.kind === 'rolling') return range.unit === 'hour' && range.amount <= 24
  if (range.kind !== 'custom') return false
  const duration = customRangeDurationMilliseconds(range)
  return duration !== null && duration > 0 && duration <= 24 * 60 * 60 * 1000
}

export function compatibleTimeBucket(bucket: TimeBucket, range: BuilderTimeRange): TimeBucket {
  return bucket === 'minute' && !isMinuteBucketAvailable(range) ? 'hour' : bucket
}

function formatDateTime(date: string, time: string): string {
  const formatted = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  return `${formatted} ${time}`
}

export function builderTimeRangeSummary(range: BuilderTimeRange): string {
  if (range.kind === 'all') return 'All time'
  if (range.kind === 'rolling') {
    if (range.unit === 'hour' && range.amount === 1) return 'Last hour'
    if (range.unit === 'hour' && range.amount === 24) return 'Last day'
    return `Last ${range.amount} ${range.unit}${range.amount === 1 ? '' : 's'}`
  }
  if (!range.startDate || !range.endDate) return 'Choose a custom range'
  const windows = range.recurringWindows?.length ?? 0
  return `${formatDateTime(range.startDate, range.startTime)} – ${formatDateTime(range.endDate, range.endTime)}${windows ? ` · ${windows} daily window${windows === 1 ? '' : 's'}` : ''}`
}

export function timeRangeProbePredicates(range: BuilderTimeRange, timeColumn: string, dataType?: string): CardinalityProbePredicate[] {
  const normalized = dataType?.toLowerCase()
  const temporalType = normalized === 'date' ? 'date' as const : normalized === 'datetime' ? 'datetime' as const : 'timestamp' as const
  if (range.kind === 'all') return []
  if (range.kind === 'rolling') return [{ column: timeColumn, operator: 'rolling', amount: range.amount, unit: range.unit, temporalType }]
  const predicates: CardinalityProbePredicate[] = []
  const bounds = customRangeToQueryBounds({ startDate: range.startDate, startTime: range.startTime, endDate: range.endDate, endTime: range.endTime, recurringWindows: range.recurringWindows ?? [] })
  if (bounds.startInclusive) predicates.push({ column: timeColumn, operator: 'gte', value: bounds.startInclusive, temporalType })
  if (bounds.endExclusive) predicates.push({ column: timeColumn, operator: 'lt', value: bounds.endExclusive, temporalType })
  return predicates
}
