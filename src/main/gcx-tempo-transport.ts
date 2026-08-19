import type { ColumnMeta, QueryResult } from '../shared/types.ts'
import { runGcxCommand, type GcxCommandRunner } from './gcx-prometheus-transport.ts'

export interface TempoTransport {
  query(value: string): Promise<QueryResult>
}

const TRACE_ID = /^[0-9a-f]{32}$/i
const SEARCH_LIMIT = 20
const SEARCH_SINCE = '1h'

const column = (name: string, dataTypeName: string, logicalType: ColumnMeta['logicalType']): ColumnMeta => ({
  name,
  logicalType,
  nativeType: dataTypeName,
  dataTypeID: 0,
  dataTypeName
})

const searchColumns: ColumnMeta[] = [
  column('traceId', 'text', 'string'),
  column('rootService', 'text', 'string'),
  column('rootOperation', 'text', 'string'),
  column('startTimeMs', 'float8', 'number'),
  column('durationMs', 'float8', 'number'),
  column('matchedSpans', 'int4', 'number')
]

const spanColumns: ColumnMeta[] = [
  column('traceId', 'text', 'string'),
  column('spanId', 'text', 'string'),
  column('parentSpanId', 'text', 'string'),
  column('service', 'text', 'string'),
  column('name', 'text', 'string'),
  column('startTimeMs', 'float8', 'number'),
  column('durationMs', 'float8', 'number'),
  column('status', 'text', 'string'),
  column('kind', 'text', 'string'),
  column('attributes', 'json', 'json')
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(value: string, command: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error(`gcx returned malformed JSON for ${command}. Update gcx and try again.`) }
}

function tempoError(error: unknown): Error {
  const value = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
  if (value?.code === 'ENOENT') return new Error('gcx is not installed. Install gcx, then try again.')
  const detail = `${value?.stderr ?? ''} ${value?.stdout ?? ''} ${value?.message ?? ''}`.toLowerCase()
  if (/expired|token.*expir|session.*expir/.test(detail)) return new Error('gcx authentication has expired. Run gcx login, then try again.')
  if (/not authenticated|not logged|no.*context|login required|unauthenticated/.test(detail)) return new Error('gcx is installed but no authenticated context is available. Run gcx login, then try again.')
  if (/forbidden|permission|not permitted|access denied|status.?403/.test(detail)) return new Error('Trace access is not permitted for this account.')
  const raw = `${value?.stderr ?? ''} ${value?.stdout ?? ''}`.trim()
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1[redacted]')
    .replace(/(token|password|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
  return new Error(raw || 'gcx could not complete the Tempo operation. Check the selected context and run gcx login if needed.')
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
  }
  return 0
}

function nanosToMs(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return 0
  try { return Number(BigInt(value) / 1_000_000n) }
  catch { return asNumber(value) / 1_000_000 }
}

function microsToMs(value: unknown): number {
  return asNumber(value) / 1_000
}

function decodeOtelValue(value: unknown): unknown {
  if (!isRecord(value)) return value
  for (const key of ['stringValue', 'boolValue', 'intValue', 'doubleValue']) {
    if (key in value) return value[key]
  }
  if (isRecord(value.arrayValue) && Array.isArray(value.arrayValue.values)) return value.arrayValue.values.map(decodeOtelValue)
  if (isRecord(value.kvlistValue) && Array.isArray(value.kvlistValue.values)) return attributesToRecord(value.kvlistValue.values)
  if ('value' in value) return decodeOtelValue(value.value)
  return value
}

function attributesToRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (!Array.isArray(value)) return {}
  const result: Record<string, unknown> = {}
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') continue
    result[item.key] = decodeOtelValue(item.value)
  }
  return result
}

function otelKind(value: unknown): string {
  if (typeof value === 'string') return value.replace(/^SPAN_KIND_/, '')
  return ['UNSPECIFIED', 'INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'][asNumber(value)] ?? asString(value)
}

function otelStatus(value: unknown): string {
  if (!isRecord(value)) return asString(value)
  const code = value.code
  if (typeof code === 'string') return code.replace(/^STATUS_CODE_/, '')
  return ['UNSET', 'OK', 'ERROR'][asNumber(code)] ?? asString(code)
}

function matchedSpanCount(trace: Record<string, unknown>): number {
  const spanSets = trace.spanSets ?? trace.spanSet
  const sets = Array.isArray(spanSets) ? spanSets : spanSets ? [spanSets] : []
  return sets.reduce((count, set) => {
    if (!isRecord(set)) return count
    if (Array.isArray(set.spans)) return count + set.spans.length
    return count + asNumber(set.matched)
  }, 0)
}

export function normalizeTempoSearch(raw: unknown, durationMs = 0): QueryResult {
  const payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  const traces = isRecord(payload) && Array.isArray(payload.traces)
    ? payload.traces
    : Array.isArray(payload) ? payload : []
  const rows = traces.filter(isRecord).map((trace) => ({
    traceId: asString(trace.traceID ?? trace.traceId ?? trace.trace_id),
    rootService: asString(trace.rootServiceName ?? trace.rootService ?? trace.serviceName),
    rootOperation: asString(trace.rootTraceName ?? trace.rootOperation ?? trace.name),
    startTimeMs: trace.startTimeUnixNano !== undefined ? nanosToMs(trace.startTimeUnixNano) : asNumber(trace.startTimeMs),
    durationMs: trace.durationNanos !== undefined ? nanosToMs(trace.durationNanos) : asNumber(trace.durationMs ?? trace.duration),
    matchedSpans: matchedSpanCount(trace)
  })).filter((row) => row.traceId)
  return { columns: searchColumns, rows, rowCount: rows.length, durationMs, notice: `Tempo search · last ${SEARCH_SINCE} · max ${SEARCH_LIMIT} traces` }
}

function normalizeOtelSpans(payload: Record<string, unknown>): Record<string, unknown>[] {
  const batches = Array.isArray(payload.batches)
    ? payload.batches
    : Array.isArray(payload.resourceSpans) ? payload.resourceSpans : []
  const rows: Record<string, unknown>[] = []
  for (const batch of batches) {
    if (!isRecord(batch)) continue
    const resource = isRecord(batch.resource) ? attributesToRecord(batch.resource.attributes) : {}
    const service = asString(resource['service.name'])
    const scopes = Array.isArray(batch.scopeSpans)
      ? batch.scopeSpans
      : Array.isArray(batch.instrumentationLibrarySpans) ? batch.instrumentationLibrarySpans : []
    for (const scope of scopes) {
      if (!isRecord(scope) || !Array.isArray(scope.spans)) continue
      for (const span of scope.spans) {
        if (!isRecord(span)) continue
        const attributes = attributesToRecord(span.attributes)
        const startTimeMs = nanosToMs(span.startTimeUnixNano ?? span.startTimeUnixNanos)
        const endTimeMs = nanosToMs(span.endTimeUnixNano ?? span.endTimeUnixNanos)
        rows.push({
          traceId: asString(span.traceId ?? span.traceID),
          spanId: asString(span.spanId ?? span.spanID),
          parentSpanId: asString(span.parentSpanId ?? span.parentSpanID),
          service: service || asString(attributes['service.name']),
          name: asString(span.name),
          startTimeMs,
          durationMs: endTimeMs >= startTimeMs ? endTimeMs - startTimeMs : 0,
          status: otelStatus(span.status),
          kind: otelKind(span.kind),
          attributes: JSON.stringify(attributes)
        })
      }
    }
  }
  return rows
}

function normalizeJaegerSpans(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(payload.data)) return []
  const rows: Record<string, unknown>[] = []
  for (const trace of payload.data) {
    if (!isRecord(trace) || !Array.isArray(trace.spans)) continue
    const processes = isRecord(trace.processes) ? trace.processes : {}
    for (const span of trace.spans) {
      if (!isRecord(span)) continue
      const process = isRecord(processes[asString(span.processID)]) ? processes[asString(span.processID)] as Record<string, unknown> : {}
      const tags = attributesToRecord(span.tags)
      const refs = Array.isArray(span.references) ? span.references.filter(isRecord) : []
      const parent = refs.find((ref) => asString(ref.refType).toUpperCase().includes('CHILD')) ?? refs[0]
      rows.push({
        traceId: asString(span.traceID ?? trace.traceID),
        spanId: asString(span.spanID),
        parentSpanId: parent ? asString(parent.spanID) : '',
        service: asString(process.serviceName),
        name: asString(span.operationName ?? span.name),
        startTimeMs: microsToMs(span.startTime),
        durationMs: microsToMs(span.duration),
        status: tags.error === true || tags.error === 'true' ? 'ERROR' : '',
        kind: asString(tags['span.kind']).toUpperCase(),
        attributes: JSON.stringify(tags)
      })
    }
  }
  return rows
}

function normalizeDirectSpans(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(payload.spans)) return []
  return payload.spans.filter(isRecord).map((span) => {
    const attributes = attributesToRecord(span.attributes ?? span.tags)
    const startTimeMs = span.startTimeUnixNano !== undefined ? nanosToMs(span.startTimeUnixNano) : asNumber(span.startTimeMs)
    const durationMs = span.durationNanos !== undefined ? nanosToMs(span.durationNanos) : asNumber(span.durationMs)
    return {
      traceId: asString(span.traceId ?? span.traceID),
      spanId: asString(span.spanId ?? span.spanID),
      parentSpanId: asString(span.parentSpanId ?? span.parentSpanID),
      service: asString(span.serviceName ?? attributes['service.name']),
      name: asString(span.name ?? span.operationName),
      startTimeMs,
      durationMs,
      status: otelStatus(span.status),
      kind: otelKind(span.kind),
      attributes: JSON.stringify(attributes)
    }
  })
}

export function normalizeTempoTrace(raw: unknown, durationMs = 0): QueryResult {
  let payload = raw
  if (isRecord(payload) && isRecord(payload.trace)) payload = payload.trace
  if (isRecord(payload) && isRecord(payload.data) && !Array.isArray(payload.data)) payload = payload.data
  if (!isRecord(payload)) throw new Error('gcx returned valid JSON, but the Tempo trace response is not an object.')
  const rows = normalizeOtelSpans(payload).length > 0
    ? normalizeOtelSpans(payload)
    : normalizeJaegerSpans(payload).length > 0
      ? normalizeJaegerSpans(payload)
      : normalizeDirectSpans(payload)
  if (rows.length === 0) throw new Error('gcx returned a Tempo trace, but DataKoala could not find any spans in the response.')
  rows.sort((left, right) => asNumber(left.startTimeMs) - asNumber(right.startTimeMs))
  return { columns: spanColumns, rows, rowCount: rows.length, durationMs }
}

export class GcxTempoTransport implements TempoTransport {
  constructor(private readonly context?: string, private readonly run: GcxCommandRunner = runGcxCommand) {}

  async query(value: string): Promise<QueryResult> {
    const query = value.trim()
    if (!query) throw new Error('Enter a TraceQL query or trace ID.')
    return TRACE_ID.test(query) ? this.get(query) : this.search(query)
  }

  async search(expression: string): Promise<QueryResult> {
    const started = Date.now()
    try {
      const contextArgs = this.context ? ['--context', this.context] : []
      const args = ['traces', 'query', expression, ...contextArgs, '--since', SEARCH_SINCE, '--limit', String(SEARCH_LIMIT), '-o', 'json']
      return normalizeTempoSearch(parseJson((await this.run(args)).stdout, 'traces query'), Date.now() - started)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
      throw tempoError(error)
    }
  }

  async get(traceId: string): Promise<QueryResult> {
    const started = Date.now()
    try {
      const contextArgs = this.context ? ['--context', this.context] : []
      const args = ['traces', 'get', traceId, ...contextArgs, '-o', 'json']
      return normalizeTempoTrace(parseJson((await this.run(args)).stdout, 'traces get'), Date.now() - started)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
      throw tempoError(error)
    }
  }
}
