export type TraceSearchRow = Record<string, unknown>

export const TRACE_SEARCH_PAGE_SIZE = 20

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function statusResolved(row: TraceSearchRow): boolean {
  const status = text(row.status).toLowerCase()
  return status !== '' && status !== 'unknown'
}

export function nextTraceSearchLimit(currentLimit: number): number {
  const safeCurrent = Number.isFinite(currentLimit) && currentLimit > 0
    ? Math.floor(currentLimit)
    : TRACE_SEARCH_PAGE_SIZE
  return safeCurrent + TRACE_SEARCH_PAGE_SIZE
}

/**
 * Tempo/gcx currently expose a growing result limit rather than a cursor. Merge the
 * refreshed window by trace ID, preserving statuses already resolved by DataKoala and
 * retaining older rows if a live trace entering the window displaced them.
 */
export function mergeTraceSearchRows(existing: TraceSearchRow[], incoming: TraceSearchRow[]): TraceSearchRow[] {
  const existingById = new Map(existing.map((row) => [text(row.traceId), row]))
  const seen = new Set<string>()
  const merged: TraceSearchRow[] = []

  for (const row of incoming) {
    const traceId = text(row.traceId)
    if (!traceId || seen.has(traceId)) continue
    seen.add(traceId)
    const previous = existingById.get(traceId)
    merged.push(previous && statusResolved(previous) && !statusResolved(row)
      ? { ...row, status: previous.status }
      : row)
  }

  for (const row of existing) {
    const traceId = text(row.traceId)
    if (!traceId || seen.has(traceId)) continue
    seen.add(traceId)
    merged.push(row)
  }

  return merged
}

export function traceSearchHasMore(returnedCount: number, requestedLimit: number): boolean {
  return returnedCount >= requestedLimit
}
