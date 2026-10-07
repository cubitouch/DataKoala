export type BuilderTimeWindow = { id: string; from: string; to: string }

export type BuilderRollingTimeUnit = 'minute' | 'hour' | 'day' | 'month'

type BuilderTimeRangeBase =
  | { kind: 'all' }
  | { kind: 'rolling'; amount: number; unit: BuilderRollingTimeUnit }
  | {
      kind: 'custom'
      startDate: string | null
      startTime: string
      endDate: string | null
      endTime: string
    }

export type BuilderTimeRange = BuilderTimeRangeBase & {
  recurringWindows?: BuilderTimeWindow[]
}

export const SEVEN_DAYS: BuilderTimeRange = {
  kind: 'rolling',
  amount: 7,
  unit: 'day',
}

export const BUILDER_ROLLING_TIME_RANGE_MAX: Record<
  BuilderRollingTimeUnit,
  number
> = {
  minute: 1440,
  hour: 744,
  day: 366,
  month: 120,
}

export function parseBuilderRollingTimeRange(
  amount: unknown,
  unit: unknown,
): Extract<BuilderTimeRange, { kind: 'rolling' }> | null {
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    (unit !== 'minute' &&
      unit !== 'hour' &&
      unit !== 'day' &&
      unit !== 'month') ||
    amount > BUILDER_ROLLING_TIME_RANGE_MAX[unit]
  )
    return null
  return { kind: 'rolling', amount, unit }
}

export function isBuilderRollingTimeRange(
  amount: unknown,
  unit: unknown,
): boolean {
  return Boolean(parseBuilderRollingTimeRange(amount, unit))
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const minuteValue = (value: string): number | null => {
  const match = TIME_RE.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const recurringIntervals = (
  window: BuilderTimeWindow,
): Array<{ start: number; end: number }> => {
  const start = minuteValue(window.from)
  const end = minuteValue(window.to)
  if (start === null || end === null || start === end) return []
  return end > start
    ? [{ start, end }]
    : [
        { start, end: 1440 },
        { start: 0, end },
      ]
}

function validateRecurringWindows(
  windows: readonly BuilderTimeWindow[],
): string | null {
  const intervals: Array<{ start: number; end: number }> = []
  for (const window of windows.filter(
    (candidate) => candidate.from || candidate.to,
  )) {
    const from = minuteValue(window.from)
    const to = minuteValue(window.to)
    if (from === null || to === null || from === to)
      return 'The recurring window end time must differ from the start time.'
    intervals.push(...recurringIntervals(window))
  }
  const sorted = intervals.sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 1; index < sorted.length; index++)
    if (sorted[index].start < sorted[index - 1].end)
      return 'This recurring window overlaps another window.'
  return null
}

function normalizedCustomRange(
  range: Extract<BuilderTimeRange, { kind: 'custom' }>,
): Extract<BuilderTimeRange, { kind: 'custom' }> {
  if (range.startDate && range.endDate && range.endDate < range.startDate)
    return {
      ...range,
      startDate: range.endDate,
      endDate: range.startDate,
    }
  return range
}

export function validateBuilderTimeRange(
  range: BuilderTimeRange,
): string | null {
  if (
    range.kind === 'rolling' &&
    !isBuilderRollingTimeRange(range.amount, range.unit)
  )
    return 'Choose a valid rolling time range.'
  if (range.kind !== 'custom')
    return validateRecurringWindows(range.recurringWindows ?? [])

  const normalized = normalizedCustomRange(range)
  if (!normalized.startDate || !normalized.endDate)
    return 'Choose both a start and an end date.'
  if (!TIME_RE.test(normalized.startTime) || !TIME_RE.test(normalized.endTime))
    return 'Enter valid start and end times.'
  if (
    `${normalized.endDate}T${normalized.endTime}` <=
    `${normalized.startDate}T${normalized.startTime}`
  )
    return 'The end date and time must be later than the start date and time.'
  return validateRecurringWindows(normalized.recurringWindows ?? [])
}

function customRangeDurationMilliseconds(
  range: Extract<BuilderTimeRange, { kind: 'custom' }>,
): number | null {
  if (validateBuilderTimeRange(range) || !range.startDate || !range.endDate)
    return null
  const start = Date.parse(`${range.startDate}T${range.startTime}:00Z`)
  const end = Date.parse(`${range.endDate}T${range.endTime}:00Z`)
  return Number.isFinite(start) && Number.isFinite(end) ? end - start : null
}

export function isMinuteBucketAvailable(range: BuilderTimeRange): boolean {
  if (range.kind === 'rolling')
    return (
      range.unit === 'minute' || (range.unit === 'hour' && range.amount <= 24)
    )
  if (range.kind !== 'custom') return false
  const duration = customRangeDurationMilliseconds(range)
  return duration !== null && duration > 0 && duration <= 24 * 60 * 60 * 1000
}
