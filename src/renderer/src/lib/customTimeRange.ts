export type TimeWindow = { id: string; from: string; to: string }
export type CustomDateTimeRange = { startDate: string | null; startTime: string; endDate: string | null; endTime: string; recurringWindows: TimeWindow[] }
export type CustomTimeRangeValue = CustomDateTimeRange

export const EMPTY_CUSTOM_RANGE: CustomDateTimeRange = { startDate: null, startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
export const pad2 = (n: number) => String(n).padStart(2, '0')
export function parseDateOnly(value: string): { year: number; month: number; day: number } { const match = DATE_RE.exec(value); if (!match) throw new Error(`Invalid date: ${value}`); return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } }
export function dateOnlyToUtcDate(value: string): Date { const p = parseDateOnly(value); return new Date(Date.UTC(p.year, p.month - 1, p.day)) }
export function formatDateOnly(date: Date): string { return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` }
export function addDays(value: string, days: number): string { const d = dateOnlyToUtcDate(value); d.setUTCDate(d.getUTCDate() + days); return formatDateOnly(d) }
export function startOfMonth(value: string): string { const p = parseDateOnly(value); return `${p.year}-${pad2(p.month)}-01` }
export function endOfMonth(value: string): string { const p = parseDateOnly(value); return formatDateOnly(new Date(Date.UTC(p.year, p.month, 0))) }
export function startOfYear(value: string): string { return `${parseDateOnly(value).year}-01-01` }
export function endOfYear(value: string): string { return `${parseDateOnly(value).year}-12-31` }
export function startOfMondayWeek(value: string): string { const d = dateOnlyToUtcDate(value); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); return formatDateOnly(d) }
export function compareDateOnly(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
export function todayDateOnly(date = new Date()): string { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` }
export function isValidTime(value: string): boolean { return TIME_RE.test(value) }
export function timeToMinutes(value: string): number | null { const m = TIME_RE.exec(value); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
export function cloneCustomRange(value: CustomDateTimeRange): CustomDateTimeRange { return { startDate: value.startDate, startTime: value.startTime || '00:00', endDate: value.endDate, endTime: value.endTime || '00:00', recurringWindows: (value.recurringWindows ?? []).map((w) => ({ ...w })) } }
export function emptyCustomRange(): CustomDateTimeRange { return cloneCustomRange(EMPTY_CUSTOM_RANGE) }
export function migrateLegacyCustomRange(value: { startInclusive?: string | null; endExclusive?: string | null; timeWindows?: TimeWindow[] }): CustomDateTimeRange { return { startDate: value.startInclusive ? value.startInclusive.slice(0, 10) : null, startTime: '00:00', endDate: value.endExclusive ? addDays(value.endExclusive.slice(0, 10), 1) : null, endTime: '00:00', recurringWindows: (value.timeWindows ?? []).map((w) => ({ ...w })) } }
export function normalizeSelectedDates(value: CustomDateTimeRange): CustomDateTimeRange { if (value.startDate && value.endDate && compareDateOnly(value.endDate, value.startDate) < 0) return { ...value, startDate: value.endDate, endDate: value.startDate }; return value }
export function normalizeCustomRange(value: CustomDateTimeRange): CustomDateTimeRange { const normalized = normalizeSelectedDates(value); return { ...normalized, startTime: normalized.startTime || '00:00', endTime: normalized.endTime || '00:00', recurringWindows: normalized.recurringWindows.filter((w) => w.from || w.to).map((w) => ({ ...w })).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)) } }
export function customRangeToComparableValues(value: CustomDateTimeRange): { start: string | null; end: string | null } { return { start: value.startDate && value.startTime ? `${value.startDate}T${value.startTime}` : null, end: value.endDate && value.endTime ? `${value.endDate}T${value.endTime}` : null } }
export function customRangeToQueryBounds(value: CustomDateTimeRange): { startInclusive: string | null; endExclusive: string | null } { const normalized = normalizeSelectedDates(value); const c = customRangeToComparableValues(normalized); return { startInclusive: c.start, endExclusive: c.end } }
type MinuteInterval = { start: number; end: number }
export function recurringWindowIntervals(window: TimeWindow): MinuteInterval[] { const start = timeToMinutes(window.from), end = timeToMinutes(window.to); if (start === null || end === null || start === end) return []; return end > start ? [{ start, end }] : [{ start, end: 1440 }, { start: 0, end }] }
export function validateCustomRange(value: CustomDateTimeRange): string | null { const normalized = normalizeSelectedDates(value); if (!normalized.startDate || !normalized.endDate) return 'Choose both a start and an end date.'; if (!isValidTime(normalized.startTime) || !isValidTime(normalized.endTime)) return 'Enter valid start and end times.'; const comparable = customRangeToComparableValues(normalized); if (comparable.start && comparable.end && comparable.end <= comparable.start) return 'The end date and time must be later than the start date and time.'; const intervals: MinuteInterval[] = []; for (const w of normalized.recurringWindows.filter((x) => x.from || x.to)) { const from = timeToMinutes(w.from), to = timeToMinutes(w.to); if (from === null || to === null || from === to) return 'The recurring window end time must differ from the start time.'; intervals.push(...recurringWindowIntervals(w)) } const sorted = intervals.sort((a, b) => a.start - b.start || a.end - b.end); for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return 'This recurring window overlaps another window.'; return null }
export function quickRanges(today = todayDateOnly()) { const yesterday = addDays(today, -1); const weekStart = startOfMondayWeek(today); const lastWeekStart = addDays(weekStart, -7); return [
  { id: 'today', label: 'Today', startDate: today, endDate: addDays(today, 1) },
  { id: 'yesterday', label: 'Yesterday', startDate: yesterday, endDate: today },
  { id: 'this-week', label: 'This week', startDate: weekStart, endDate: addDays(weekStart, 7) },
  { id: 'last-week', label: 'Last week', startDate: lastWeekStart, endDate: weekStart },
  { id: 'this-month', label: 'This month', startDate: startOfMonth(today), endDate: addDays(endOfMonth(today), 1) },
  { id: 'last-month', label: 'Last month', startDate: startOfMonth(addDays(startOfMonth(today), -1)), endDate: startOfMonth(today) },
  { id: 'this-year', label: 'This year', startDate: startOfYear(today), endDate: addDays(endOfYear(today), 1) }
] }
