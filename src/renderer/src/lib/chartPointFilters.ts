import type { TimeBucket } from '@store/useStore'
import {
  createResultFilter,
  createResultRangeFilter,
  type ResultFilter,
} from './resultFilters.ts'

export interface ChartSeriesFilterValue {
  column: string
  value: unknown
}

export interface ChartPointContext {
  xColumn: string
  xValue: unknown
  seriesColumn: string | null
  seriesValue: unknown
  /** Real source values represented by the chart series. */
  seriesFilters?: ChartSeriesFilterValue[]
  timeBucket?: TimeBucket
}

/**
 * Include actions become one independent filter per source Series column so
 * each filter can be promoted or removed independently. Excluding a composite
 * tuple must remain a single tuple filter: `A != x AND B != y` is not the same
 * as excluding only `(A=x, B=y)`.
 */
export function chartSeriesResultFilters(
  context: ChartPointContext,
  include: boolean,
): ResultFilter[] {
  const sources = context.seriesFilters?.length
    ? context.seriesFilters
    : context.seriesColumn
      ? [{ column: context.seriesColumn, value: context.seriesValue }]
      : []
  if (!sources.length) return []
  if (!include && sources.length > 1 && context.seriesColumn) {
    return [
      createResultFilter(
        context.seriesColumn,
        'notEquals',
        context.seriesValue,
      ),
    ]
  }
  return sources.map(({ column, value }) =>
    value == null
      ? createResultFilter(column, include ? 'isNull' : 'isNotNull')
      : createResultFilter(column, include ? 'equals' : 'notEquals', value),
  )
}

export interface TimeBucketRange {
  startInclusive: string
  endExclusive: string
}

/** Builds UTC half-open ranges matching PostgreSQL date_trunc bucket boundaries. */
export function timeBucketRange(
  value: unknown,
  bucket: TimeBucket,
): TimeBucketRange | null {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(String(value))
  if (!Number.isFinite(date.getTime())) return null
  let start: Date
  if (bucket === 'minute')
    start = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
      ),
    )
  else if (bucket === 'hour')
    start = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
      ),
    )
  else if (bucket === 'day')
    start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
  else if (bucket === 'week') {
    start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
    const mondayOffset = (start.getUTCDay() + 6) % 7
    start.setUTCDate(start.getUTCDate() - mondayOffset)
  } else if (bucket === 'month')
    start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  else if (bucket === 'quarter')
    start = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        Math.floor(date.getUTCMonth() / 3) * 3,
        1,
      ),
    )
  else start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))

  const end = new Date(start.getTime())
  if (bucket === 'minute') end.setUTCMinutes(end.getUTCMinutes() + 1)
  else if (bucket === 'hour') end.setUTCHours(end.getUTCHours() + 1)
  else if (bucket === 'day') end.setUTCDate(end.getUTCDate() + 1)
  else if (bucket === 'week') end.setUTCDate(end.getUTCDate() + 7)
  else if (bucket === 'month') end.setUTCMonth(end.getUTCMonth() + 1)
  else if (bucket === 'quarter') end.setUTCMonth(end.getUTCMonth() + 3)
  else end.setUTCFullYear(end.getUTCFullYear() + 1)
  return {
    startInclusive: start.toISOString(),
    endExclusive: end.toISOString(),
  }
}

export type ChartFilterAction =
  | 'includeSeries'
  | 'excludeSeries'
  | 'includeX'
  | 'excludeX'
  | 'includeSeriesAndX'

/** Preserve action order and composite-series exclusion semantics. */
export function chartPointActionFilters(
  context: ChartPointContext,
  action: ChartFilterAction,
): ResultFilter[] {
  const filters: ResultFilter[] = []
  if (
    action === 'includeSeries' ||
    action === 'excludeSeries' ||
    action === 'includeSeriesAndX'
  ) {
    const include = action !== 'excludeSeries'
    for (const filter of chartSeriesResultFilters(context, include))
      filters.push(filter)
  }
  if (
    action === 'includeX' ||
    action === 'excludeX' ||
    action === 'includeSeriesAndX'
  ) {
    const exclude = action === 'excludeX'
    if (context.timeBucket) {
      const range = timeBucketRange(context.xValue, context.timeBucket)
      if (range)
        filters.push(
          createResultRangeFilter(
            context.xColumn,
            range.startInclusive,
            range.endExclusive,
            exclude,
          ),
        )
    } else {
      const operator: 'equals' | 'notEquals' | 'isNull' | 'isNotNull' =
        context.xValue == null
          ? exclude
            ? 'isNotNull'
            : 'isNull'
          : exclude
            ? 'notEquals'
            : 'equals'
      filters.push(
        createResultFilter(context.xColumn, operator, context.xValue),
      )
    }
  }
  return filters
}
