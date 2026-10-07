import type { CardinalityProbePredicate } from '@shared/chartLimits.ts'
import type { TimeBucket } from '@store/useStore'
import {
  SEVEN_DAYS,
  isMinuteBucketAvailable,
  validateBuilderTimeRange,
  type BuilderTimeRange,
} from '@shared/builderTimeRange.ts'
import {
  addDays,
  customRangeToQueryBounds,
  type TimeWindow,
} from './customTimeRange.ts'

export { SEVEN_DAYS, isMinuteBucketAvailable, validateBuilderTimeRange }
export type { BuilderTimeRange }

export const EMPTY_BUILDER_CUSTOM_RANGE: BuilderTimeRange = {
  kind: 'custom',
  startDate: null,
  startTime: '00:00',
  endDate: null,
  endTime: '00:00',
  recurringWindows: [],
}
export const MINUTE_BUCKET_UNAVAILABLE_REASON =
  'Minute is available only for time ranges of 24 hours or less.'

function normalizeRecurringWindows(value: unknown): TimeWindow[] {
  return Array.isArray(value)
    ? (value as TimeWindow[])
        .filter((window) => window.from || window.to)
        .map((window) => ({ ...window }))
        .sort(
          (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
        )
    : []
}

export function normalizeBuilderTimeRange(
  range: BuilderTimeRange | (Record<string, unknown> & { kind?: unknown }),
): BuilderTimeRange {
  const value = range as Record<string, unknown>
  if (range.kind !== 'custom') {
    const recurringWindows = normalizeRecurringWindows(value.recurringWindows)
    const { recurringWindows: _recurringWindows, ...base } =
      range as BuilderTimeRange & { recurringWindows?: TimeWindow[] }
    return recurringWindows.length
      ? ({ ...base, recurringWindows } as BuilderTimeRange)
      : (base as BuilderTimeRange)
  }
  if (
    'startDate' in value ||
    'endDate' in value ||
    'recurringWindows' in value
  ) {
    return {
      kind: 'custom',
      startDate: typeof value.startDate === 'string' ? value.startDate : null,
      startTime:
        typeof value.startTime === 'string' ? value.startTime : '00:00',
      endDate: typeof value.endDate === 'string' ? value.endDate : null,
      endTime: typeof value.endTime === 'string' ? value.endTime : '00:00',
      recurringWindows: normalizeRecurringWindows(value.recurringWindows),
    }
  }
  const startInclusive =
    typeof value.startInclusive === 'string' ? value.startInclusive : null
  const endInclusive =
    typeof value.endExclusive === 'string' ? value.endExclusive : null
  return {
    kind: 'custom',
    startDate: startInclusive ? startInclusive.slice(0, 10) : null,
    startTime: '00:00',
    endDate: endInclusive ? addDays(endInclusive.slice(0, 10), 1) : null,
    endTime: '00:00',
    recurringWindows: normalizeRecurringWindows(value.timeWindows),
  }
}

export function compatibleTimeBucket(
  bucket: TimeBucket,
  range: BuilderTimeRange,
): TimeBucket {
  return bucket === 'minute' && !isMinuteBucketAvailable(range)
    ? 'hour'
    : bucket
}

function formatDateTime(date: string, time: string): string {
  const formatted = new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  return `${formatted} ${time}`
}

function recurringWindowSuffix(range: BuilderTimeRange): string {
  const windows =
    range.recurringWindows?.filter((window) => window.from || window.to)
      .length ?? 0
  return windows ? ` · ${windows} daily window${windows === 1 ? '' : 's'}` : ''
}

export function builderTimeRangeSummary(range: BuilderTimeRange): string {
  const suffix = recurringWindowSuffix(range)
  if (range.kind === 'all') return `All time${suffix}`
  if (range.kind === 'rolling') {
    if (range.unit === 'minute') return `Last ${range.amount} minutes${suffix}`
    if (range.unit === 'hour' && range.amount === 1) return `Last hour${suffix}`
    if (range.unit === 'hour' && range.amount === 24) return `Last day${suffix}`
    return `Last ${range.amount} ${range.unit}${range.amount === 1 ? '' : 's'}${suffix}`
  }
  if (!range.startDate || !range.endDate)
    return `Choose a custom range${suffix}`
  return `${formatDateTime(range.startDate, range.startTime)} – ${formatDateTime(range.endDate, range.endTime)}${suffix}`
}

export function timeRangeProbePredicates(
  range: BuilderTimeRange,
  timeColumn: string,
  dataType?: string,
): CardinalityProbePredicate[] {
  const normalized = dataType?.toLowerCase()
  const temporalType =
    normalized === 'date'
      ? ('date' as const)
      : normalized === 'datetime'
        ? ('datetime' as const)
        : ('timestamp' as const)
  if (range.kind === 'all') return []
  if (range.kind === 'rolling')
    return [
      {
        column: timeColumn,
        operator: 'rolling',
        amount: range.amount,
        unit: range.unit,
        temporalType,
      },
    ]
  const predicates: CardinalityProbePredicate[] = []
  const bounds = customRangeToQueryBounds({
    startDate: range.startDate,
    startTime: range.startTime,
    endDate: range.endDate,
    endTime: range.endTime,
    recurringWindows: range.recurringWindows ?? [],
  })
  if (bounds.startInclusive)
    predicates.push({
      column: timeColumn,
      operator: 'gte',
      value: bounds.startInclusive,
      temporalType,
    })
  if (bounds.endExclusive)
    predicates.push({
      column: timeColumn,
      operator: 'lt',
      value: bounds.endExclusive,
      temporalType,
    })
  return predicates
}
