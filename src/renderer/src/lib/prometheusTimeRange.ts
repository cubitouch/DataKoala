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
