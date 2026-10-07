export type BuilderTimeWindow = { id: string; from: string; to: string }

type BuilderTimeRangeBase =
  | { kind: 'all' }
  | { kind: 'rolling'; amount: 15 | 30; unit: 'minute' }
  | { kind: 'rolling'; amount: 1 | 3 | 6 | 12 | 24; unit: 'hour' }
  | { kind: 'rolling'; amount: 7 | 30; unit: 'day' }
  | { kind: 'rolling'; amount: 3 | 6 | 12; unit: 'month' }
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

export function validateBuilderTimeRange(
  range: BuilderTimeRange,
): string | null {
  const recurring = validateRecurringWindows(range.recurringWindows ?? [])
  if (recurring) return recurring
  if (range.kind !== 'custom') return null
  if (!range.startDate || !range.endDate)
    return 'Choose both a start and an end date.'
  if (!TIME_RE.test(range.startTime) || !TIME_RE.test(range.endTime))
    return 'Enter valid start and end times.'
  if (
    `${range.endDate}T${range.endTime}` <=
    `${range.startDate}T${range.startTime}`
  )
    return 'The end date and time must be later than the start date and time.'
  return null
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
