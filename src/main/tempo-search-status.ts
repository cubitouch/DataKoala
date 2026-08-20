import type { QueryResult } from '../shared/types.ts'

type SearchStatus = 'error' | 'ok' | 'unknown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function decodeValue(value: unknown): unknown {
  if (!isRecord(value)) return value
  for (const key of ['stringValue', 'boolValue', 'intValue', 'doubleValue']) {
    if (key in value) return value[key]
  }
  if ('value' in value) return decodeValue(value.value)
  return value
}

function attributes(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (!Array.isArray(value)) return {}
  const result: Record<string, unknown> = {}
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') continue
    result[item.key] = decodeValue(item.value)
  }
  return result
}

function statusValue(value: unknown): SearchStatus {
  if (isRecord(value) && 'code' in value) return statusValue(value.code)
  if (typeof value === 'number') {
    if (value === 2) return 'error'
    if (value === 1) return 'ok'
    return 'unknown'
  }
  const normalized = text(value).trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (normalized === '2' || normalized.includes('error') || normalized === 'failed' || normalized === 'failure') return 'error'
  if (normalized === '1' || normalized.includes('status_code_ok') || normalized === 'ok' || normalized === 'success') return 'ok'
  return 'unknown'
}

function traceRows(raw: unknown): Record<string, unknown>[] {
  const payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  const traces = isRecord(payload) && Array.isArray(payload.traces)
    ? payload.traces
    : Array.isArray(payload) ? payload : []
  return traces.filter(isRecord)
}

function matchingSpans(trace: Record<string, unknown>): Record<string, unknown>[] {
  const spanSets = trace.spanSets ?? trace.spanSet
  const sets = Array.isArray(spanSets) ? spanSets : spanSets ? [spanSets] : []
  const spans: Record<string, unknown>[] = []
  for (const set of sets) {
    if (!isRecord(set) || !Array.isArray(set.spans)) continue
    spans.push(...set.spans.filter(isRecord))
  }
  return spans
}

function spanStatus(span: Record<string, unknown>): SearchStatus {
  const direct = statusValue(span.status ?? span.statusCode ?? span.status_code)
  if (direct !== 'unknown') return direct

  const values = attributes(span.attributes ?? span.tags)
  for (const key of ['status', 'span:status', 'span.status']) {
    const status = statusValue(values[key])
    if (status !== 'unknown') return status
  }
  if (values.error === true || text(values.error).toLowerCase() === 'true') return 'error'
  return 'unknown'
}

function summaryStatus(trace: Record<string, unknown>): SearchStatus {
  const direct = statusValue(trace.status ?? trace.rootStatus ?? trace.traceStatus)
  if (direct !== 'unknown') return direct

  // Search span sets are only the spans selected by TraceQL, not the complete trace.
  // An ERROR among those spans proves the trace contains an error. An OK span does not
  // prove the entire trace is successful, so keep that case unknown until a full trace
  // is opened or the provider supplies a trace/root-level status.
  for (const span of matchingSpans(trace)) {
    if (spanStatus(span) === 'error') return 'error'
  }
  return 'unknown'
}

export function ensureTempoSearchStatusSelection(expression: string): string {
  const query = expression.trim()
  if (!query) return query
  if (/select\s*\([^)]*(?:span:status|\bstatus\b)/i.test(query)) return query
  // TraceQL metrics expressions return time series rather than trace summaries; the
  // trace explorer cannot annotate those with span selection fields.
  if (/\|\s*(?:rate|count_over_time|quantile_over_time|histogram_over_time|compare)\s*\(/i.test(query)) return query
  return `${query} | select(span:status)`
}

export function applyTempoSearchStatuses(result: QueryResult, raw: unknown): QueryResult {
  const statuses = new Map<string, SearchStatus>()
  for (const trace of traceRows(raw)) {
    const traceId = text(trace.traceID ?? trace.traceId ?? trace.trace_id)
    if (!traceId) continue
    statuses.set(traceId, summaryStatus(trace))
  }

  return {
    ...result,
    rows: result.rows.map((row) => {
      const status = statuses.get(text(row.traceId)) ?? 'unknown'
      return status === 'unknown' ? row : { ...row, status }
    })
  }
}
