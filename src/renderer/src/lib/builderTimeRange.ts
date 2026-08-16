import type { CardinalityProbePredicate } from '../../../shared/chartLimits.ts'
import type { TimeBucket } from '../store/useStore'
import { addDays, customRangeToQueryBounds, recurringWindowIntervals, timeToMinutes, validateCustomRange, type TimeWindow } from './customTimeRange.ts'

type BuilderTimeRangeBase =
  | { kind: 'all' }
  | { kind: 'rolling'; amount: 1 | 6 | 12 | 24; unit: 'hour' }
  | { kind: 'rolling'; amount: 7 | 30; unit: 'day' }
  | { kind: 'rolling'; amount: 3 | 6 | 12; unit: 'month' }
  | { kind: 'custom'; startDate: string | null; startTime: string; endDate: string | null; endTime: string }

export type BuilderTimeRange = BuilderTimeRangeBase & { recurringWindows?: TimeWindow[] }

export const SEVEN_DAYS: BuilderTimeRange = { kind: 'rolling', amount: 7, unit: 'day' }
export const EMPTY_BUILDER_CUSTOM_RANGE: BuilderTimeRange = { kind: 'custom', startDate: null, startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }
export const MINUTE_BUCKET_UNAVAILABLE_REASON = 'Minute is available only for time ranges of 24 hours or less.'

function normalizeRecurringWindows(value: unknown): TimeWindow[] {
  return Array.isArray(value)
    ? (value as TimeWindow[]).filter((window) => window.from || window.to).map((window) => ({ ...window })).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    : []
}

export function normalizeBuilderTimeRange(range: BuilderTimeRange | (Record<string, unknown> & { kind?: unknown })): BuilderTimeRange {
  const value = range as Record<string, unknown>
  if (range.kind !== 'custom') return { ...(range as BuilderTimeRange), recurringWindows: normalizeRecurringWindows(value.recurringWindows) }
  if ('startDate' in value || 'endDate' in value || 'recurringWindows' in value) {
    return {
      kind: 'custom',
      startDate: typeof value.startDate === 'string' ? value.startDate : null,
      startTime: typeof value.startTime === 'string' ? value.startTime : '00:00',
      endDate: typeof value.endDate === 'string' ? value.endDate : null,
      endTime: typeof value.endTime === 'string' ? value.endTime : '00:00',
      recurringWindows: normalizeRecurringWindows(value.recurringWindows)
    }
  }
  const startInclusive = typeof value.startInclusive === 'string' ? value.startInclusive : null
  const endInclusive = typeof value.endExclusive === 'string' ? value.endExclusive : null
  return {
    kind: 'custom', startDate: startInclusive ? startInclusive.slice(0, 10) : null, startTime: '00:00',
    endDate: endInclusive ? addDays(endInclusive.slice(0, 10), 1) : null, endTime: '00:00',
    recurringWindows: normalizeRecurringWindows(value.timeWindows)
  }
}

function validateRecurringWindows(windows: TimeWindow[]): string | null {
  const intervals: { start: number; end: number }[] = []
  for (const window of windows.filter((candidate) => candidate.from || candidate.to)) {
    const from = timeToMinutes(window.from), to = timeToMinutes(window.to)
    if (from === null || to === null || from === to) return 'The recurring window end time must differ from the start time.'
    intervals.push(...recurringWindowIntervals(window))
  }
  const sorted = intervals.sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 1; index < sorted.length; index++) if (sorted[index].start < sorted[index - 1].end) return 'This recurring window overlaps another window.'
  return null
}

export function validateBuilderTimeRange(range: BuilderTimeRange): string | null {
  if (range.kind === 'custom') {
    return validateCustomRange({ startDate: range.startDate, startTime: range.startTime, endDate: range.endDate, endTime: range.endTime, recurringWindows: range.recurringWindows ?? [] })
  }
  return validateRecurringWindows(range.recurringWindows ?? [])
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

function recurringWindowSuffix(range: BuilderTimeRange): string {
  const windows = range.recurringWindows?.filter((window) => window.from || window.to).length ?? 0
  return windows ? ` · ${windows} daily window${windows === 1 ? '' : 's'}` : ''
}

export function builderTimeRangeSummary(range: BuilderTimeRange): string {
  const suffix = recurringWindowSuffix(range)
  if (range.kind === 'all') return `All time${suffix}`
  if (range.kind === 'rolling') {
    if (range.unit === 'hour' && range.amount === 1) return `Last hour${suffix}`
    if (range.unit === 'hour' && range.amount === 24) return `Last day${suffix}`
    return `Last ${range.amount} ${range.unit}${range.amount === 1 ? '' : 's'}${suffix}`
  }
  if (!range.startDate || !range.endDate) return `Choose a custom range${suffix}`
  return `${formatDateTime(range.startDate, range.startTime)} – ${formatDateTime(range.endDate, range.endTime)}${suffix}`
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
