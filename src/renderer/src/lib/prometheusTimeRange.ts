import type { BuilderTimeRange } from './builderTimeRange'

const UNIT_MS = { hour: 60 * 60_000, day: 24 * 60 * 60_000, month: 30 * 24 * 60 * 60_000 } as const

/** Resolve the shared picker value at execution time. Custom picker values are UTC. */
export function prometheusRangeBounds(range: BuilderTimeRange, now = new Date()): { start: string; end: string } {
  const end = now.toISOString()
  if (range.kind === 'all') return { start: new Date(0).toISOString(), end }
  if (range.kind === 'rolling') return { start: new Date(now.getTime() - range.amount * UNIT_MS[range.unit]).toISOString(), end }
  if (!range.startDate || !range.endDate) throw new Error('Choose a complete date range before running the query.')
  return {
    start: new Date(`${range.startDate}T${range.startTime}:00Z`).toISOString(),
    end: new Date(`${range.endDate}T${range.endTime}:00Z`).toISOString()
  }
}

/** Resolve an explicit chart domain for bounded time ranges; all-time and incomplete ranges fall back to data-derived bounds. */
export function timeRangeChartDomain(range: BuilderTimeRange, now = new Date()): { min: number; max: number } | null {
  if (range.kind === 'all') return null
  try {
    const bounds = prometheusRangeBounds(range, now)
    const min = Date.parse(bounds.start)
    const max = Date.parse(bounds.end)
    return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null
  } catch {
    return null
  }
}
