export interface LokiTrendRange { startMs: number; endMs: number }

export function selectedLokiTrendRange(payload: unknown): LokiTrendRange | null {
  const event = payload as { batch?: { areas?: { coordRange?: unknown[] }[] }[]; areas?: { coordRange?: unknown[] }[] }
  const range = event.batch?.[0]?.areas?.[0]?.coordRange ?? event.areas?.[0]?.coordRange
  if (!Array.isArray(range) || range.length !== 2) return null
  const startMs = Number(range[0]), endMs = Number(range[1])
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? { startMs, endMs } : null
}
