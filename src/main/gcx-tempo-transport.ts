import type { ColumnMeta, QueryResult } from '../shared/types.ts'
import type { TempoQueryContext, TempoQueryRequest } from '../shared/tempo.ts'
import { runGcxCommand, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { createTempoPerformance } from './tempo-performance.ts'

export interface TempoService { name: string; namespace?: string }
export interface TempoTransport {
  query(value: string, request?: TempoQueryRequest): Promise<QueryResult>
  search(expression: string, request?: TempoQueryRequest): Promise<QueryResult>
  get(traceId: string, request?: TempoQueryRequest): Promise<QueryResult>
  probe(): Promise<void>
  services(): Promise<TempoService[]>
  attributeValues(attribute: string, query?: string): Promise<string[]>
}

const TRACE_ID = /^[0-9a-f]{32}$/i
const SEARCH_LIMIT = 20
const DEFAULT_SEARCH_SINCE = '1h'
const STATUS_CONCURRENCY = 4
const SERVICE_DISCOVERY_CONCURRENCY = 4

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
  column('matchedSpans', 'int4', 'number'),
  column('status', 'text', 'string')
]

const spanColumns: ColumnMeta[] = [
  column('traceId', 'text', 'string'),
  column('spanId', 'text', 'string'),
  column('parentSpanId', 'text', 'string'),
  column('service', 'text', 'string'),
  column('serviceNamespace', 'text', 'string'),
  column('name', 'text', 'string'),
  column('startTimeMs', 'float8', 'number'),
  column('durationMs', 'float8', 'number'),
  column('status', 'text', 'string'),
  column('statusMessage', 'text', 'string'),
  column('kind', 'text', 'string'),
  column('scopeName', 'text', 'string'),
  column('resourceAttributes', 'json', 'json'),
  column('attributes', 'json', 'json'),
  column('events', 'json', 'json'),
  column('links', 'json', 'json')
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
  return value === undefined || value === null ? '' : String(value)
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

function statusMessage(value: unknown): string {
  return isRecord(value) ? asString(value.message) : ''
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

function tempoSearchTraces(raw: unknown): Record<string, unknown>[] {
  const payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  const traces = isRecord(payload) && Array.isArray(payload.traces)
    ? payload.traces
    : Array.isArray(payload) ? payload : []
  return traces.filter(isRecord)
}

function normalizedSearchStatus(trace: Record<string, unknown>): string {
  const direct = asString(trace.status ?? trace.rootStatus ?? trace.traceStatus).toLowerCase()
  if (direct.includes('error')) return 'error'
  if (direct.includes('ok') || direct.includes('success')) return 'ok'
  return 'unknown'
}

export function normalizeTempoSearch(raw: unknown, durationMs = 0, rangeLabel = `last ${DEFAULT_SEARCH_SINCE}`): QueryResult {
  const rows = tempoSearchTraces(raw).map((trace) => ({
    traceId: asString(trace.traceID ?? trace.traceId ?? trace.trace_id),
    rootService: asString(trace.rootServiceName ?? trace.rootService ?? trace.serviceName),
    rootOperation: asString(trace.rootTraceName ?? trace.rootOperation ?? trace.name),
    startTimeMs: trace.startTimeUnixNano !== undefined ? nanosToMs(trace.startTimeUnixNano) : asNumber(trace.startTimeMs),
    durationMs: trace.durationNanos !== undefined ? nanosToMs(trace.durationNanos) : asNumber(trace.durationMs ?? trace.duration),
    matchedSpans: matchedSpanCount(trace),
    status: normalizedSearchStatus(trace)
  })).filter((row) => row.traceId)
  return {
    columns: searchColumns,
    rows,
    rowCount: rows.length,
    durationMs,
    notice: `Tempo search · ${rangeLabel} · max ${SEARCH_LIMIT} traces`,
    execution: { provider: 'tempo', durationMs, rowCount: rows.length }
  }
}

function normalizeEvents(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((event) => ({
    name: asString(event.name),
    timeUnixNano: asString(event.timeUnixNano ?? event.timeUnixNanos),
    attributes: attributesToRecord(event.attributes)
  }))
}

function normalizeLinks(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((link) => ({
    traceId: asString(link.traceId ?? link.traceID),
    spanId: asString(link.spanId ?? link.spanID),
    traceState: asString(link.traceState),
    attributes: attributesToRecord(link.attributes)
  }))
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
    const serviceNamespace = asString(resource['service.namespace'])
    const scopes = Array.isArray(batch.scopeSpans)
      ? batch.scopeSpans
      : Array.isArray(batch.instrumentationLibrarySpans) ? batch.instrumentationLibrarySpans : []
    for (const scope of scopes) {
      if (!isRecord(scope) || !Array.isArray(scope.spans)) continue
      const scopeInfo = isRecord(scope.scope) ? scope.scope : isRecord(scope.instrumentationLibrary) ? scope.instrumentationLibrary : {}
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
          serviceNamespace: serviceNamespace || asString(attributes['service.namespace']),
          name: asString(span.name),
          startTimeMs,
          durationMs: endTimeMs >= startTimeMs ? endTimeMs - startTimeMs : 0,
          status: otelStatus(span.status),
          statusMessage: statusMessage(span.status),
          kind: otelKind(span.kind),
          scopeName: asString(scopeInfo.name),
          resourceAttributes: JSON.stringify(resource),
          attributes: JSON.stringify(attributes),
          events: JSON.stringify(normalizeEvents(span.events)),
          links: JSON.stringify(normalizeLinks(span.links))
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
      const resource = attributesToRecord(process.tags)
      const refs = Array.isArray(span.references) ? span.references.filter(isRecord) : []
      const parent = refs.find((ref) => asString(ref.refType).toUpperCase().includes('CHILD')) ?? refs[0]
      rows.push({
        traceId: asString(span.traceID ?? trace.traceID),
        spanId: asString(span.spanID),
        parentSpanId: parent ? asString(parent.spanID) : '',
        service: asString(process.serviceName),
        serviceNamespace: asString(resource['service.namespace']),
        name: asString(span.operationName ?? span.name),
        startTimeMs: microsToMs(span.startTime),
        durationMs: microsToMs(span.duration),
        status: tags.error === true || tags.error === 'true' ? 'ERROR' : '',
        statusMessage: '',
        kind: asString(tags['span.kind']).toUpperCase(),
        scopeName: '',
        resourceAttributes: JSON.stringify(resource),
        attributes: JSON.stringify(tags),
        events: JSON.stringify([]),
        links: JSON.stringify(refs.filter((ref) => ref !== parent).map((ref) => ({ traceId: asString(ref.traceID), spanId: asString(ref.spanID), refType: asString(ref.refType) })))
      })
    }
  }
  return rows
}

function normalizeDirectSpans(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(payload.spans)) return []
  return payload.spans.filter(isRecord).map((span) => {
    const attributes = attributesToRecord(span.attributes ?? span.tags)
    const resource = attributesToRecord(span.resourceAttributes ?? (isRecord(span.resource) ? span.resource.attributes : undefined))
    const startTimeMs = span.startTimeUnixNano !== undefined ? nanosToMs(span.startTimeUnixNano) : asNumber(span.startTimeMs)
    const durationMs = span.durationNanos !== undefined ? nanosToMs(span.durationNanos) : asNumber(span.durationMs)
    return {
      traceId: asString(span.traceId ?? span.traceID),
      spanId: asString(span.spanId ?? span.spanID),
      parentSpanId: asString(span.parentSpanId ?? span.parentSpanID),
      service: asString(span.serviceName ?? resource['service.name'] ?? attributes['service.name']),
      serviceNamespace: asString(resource['service.namespace'] ?? attributes['service.namespace']),
      name: asString(span.name ?? span.operationName),
      startTimeMs,
      durationMs,
      status: otelStatus(span.status),
      statusMessage: statusMessage(span.status),
      kind: otelKind(span.kind),
      scopeName: asString(span.scopeName),
      resourceAttributes: JSON.stringify(resource),
      attributes: JSON.stringify(attributes),
      events: JSON.stringify(normalizeEvents(span.events)),
      links: JSON.stringify(normalizeLinks(span.links))
    }
  })
}

export function normalizeTempoTrace(raw: unknown, durationMs = 0): QueryResult {
  let payload = raw
  if (isRecord(payload) && isRecord(payload.trace)) payload = payload.trace
  if (isRecord(payload) && isRecord(payload.data) && !Array.isArray(payload.data)) payload = payload.data
  if (!isRecord(payload)) throw new Error('gcx returned valid JSON, but the Tempo trace response is not an object.')
  const otelRows = normalizeOtelSpans(payload)
  const jaegerRows = otelRows.length === 0 ? normalizeJaegerSpans(payload) : []
  const rows = otelRows.length > 0 ? otelRows : jaegerRows.length > 0 ? jaegerRows : normalizeDirectSpans(payload)
  if (rows.length === 0) throw new Error('gcx returned a Tempo trace, but DataKoala could not find any spans in the response.')
  rows.sort((left, right) => asNumber(left.startTimeMs) - asNumber(right.startTimeMs))
  return { columns: spanColumns, rows, rowCount: rows.length, durationMs, execution: { provider: 'tempo', durationMs, rowCount: rows.length } }
}

function collectService(services: Map<string, TempoService>, name: unknown, namespace?: unknown) {
  const serviceName = asString(name).trim()
  const serviceNamespace = asString(namespace).trim()
  if (!serviceName) return
  const key = `${serviceNamespace}\u0000${serviceName}`
  services.set(key, { name: serviceName, ...(serviceNamespace ? { namespace: serviceNamespace } : {}) })
}

export function normalizeTempoServices(raw: unknown): TempoService[] {
  const services = new Map<string, TempoService>()
  for (const trace of tempoSearchTraces(raw)) {
    collectService(services, trace.rootServiceName ?? trace.rootService ?? trace.serviceName, trace.rootServiceNamespace)
    const rawSets = trace.spanSets ?? trace.spanSet
    const sets = Array.isArray(rawSets) ? rawSets : rawSets ? [rawSets] : []
    for (const set of sets) {
      if (!isRecord(set) || !Array.isArray(set.spans)) continue
      for (const span of set.spans) {
        if (!isRecord(span)) continue
        const attributes = attributesToRecord(span.attributes)
        const resource = attributesToRecord(span.resourceAttributes ?? (isRecord(span.resource) ? span.resource.attributes : undefined))
        collectService(services, span.serviceName ?? resource['service.name'] ?? attributes['service.name'], resource['service.namespace'] ?? attributes['service.namespace'])
      }
    }
  }
  return [...services.values()].sort((left, right) => `${left.namespace ?? ''}/${left.name}`.localeCompare(`${right.namespace ?? ''}/${right.name}`))
}

export function normalizeTempoLabelValues(raw: unknown): string[] {
  let payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  if (isRecord(payload) && 'tagValues' in payload) payload = payload.tagValues
  const values: unknown[] = []
  if (Array.isArray(payload)) {
    for (const item of payload) values.push(isRecord(item) && 'value' in item ? item.value : item)
  } else if (isRecord(payload)) {
    for (const group of Object.values(payload)) {
      if (Array.isArray(group)) values.push(...group.map((item) => isRecord(item) && 'value' in item ? item.value : item))
    }
  }
  return [...new Set(values.map(asString).map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function searchRangeArgs(request?: TempoQueryRequest): string[] {
  return request ? ['--from', request.start, '--to', request.end] : ['--since', DEFAULT_SEARCH_SINCE]
}

function searchRangeLabel(request?: TempoQueryRequest): string {
  if (!request) return `last ${DEFAULT_SEARCH_SINCE}`
  const format = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('.000Z', 'Z')
  }
  return `${format(request.start)} → ${format(request.end)}`
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= values.length) return
      output[index] = await mapper(values[index])
    }
  })
  await Promise.all(workers)
  return output
}

export class GcxTempoTransport implements TempoTransport {
  private readonly context?: string
  private readonly datasourceUid?: string
  private readonly run: GcxCommandRunner

  constructor(context?: string, run: GcxCommandRunner = runGcxCommand, datasourceUid?: string) {
    this.context = context
    this.run = run
    this.datasourceUid = datasourceUid
  }

  private commonArgs(): string[] {
    return [
      ...(this.context ? ['--context', this.context] : []),
      ...(this.datasourceUid ? ['--datasource', this.datasourceUid] : [])
    ]
  }

  async query(value: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const query = value.trim()
    if (!query) throw new Error('Enter a TraceQL query or trace ID.')
    return TRACE_ID.test(query) ? this.get(query, request) : this.search(query, request)
  }

  async probe(): Promise<void> {
    try {
      parseJson((await this.run(['traces', 'labels', ...this.commonArgs(), '-o', 'json'])).stdout, 'traces labels')
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
      throw tempoError(error)
    }
  }

  async attributeValues(attribute: string, query?: string): Promise<string[]> {
    const args = [
      'traces', 'labels', ...this.commonArgs(), '--label', attribute,
      ...(query ? ['--query', query] : []),
      '-o', 'json'
    ]
    try {
      return normalizeTempoLabelValues(parseJson((await this.run(args)).stdout, `traces labels ${attribute}`))
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
      throw tempoError(error)
    }
  }

  async services(): Promise<TempoService[]> {
    try {
      const names = await this.attributeValues('resource.service.name')
      if (!names.length) return []
      const namespaces = await this.attributeValues('resource.service.namespace')
      const mapped = new Map<string, TempoService>()
      await mapConcurrent(namespaces, SERVICE_DISCOVERY_CONCURRENCY, async (namespace) => {
        const scopedNames = await this.attributeValues('resource.service.name', `{ resource.service.namespace = ${JSON.stringify(namespace)} }`)
        for (const name of scopedNames) collectService(mapped, name, namespace)
      })
      const assigned = new Set([...mapped.values()].map((service) => service.name))
      for (const name of names) if (!assigned.has(name)) collectService(mapped, name)
      return [...mapped.values()].sort((left, right) => `${left.namespace ?? ''}/${left.name}`.localeCompare(`${right.namespace ?? ''}/${right.name}`))
    } catch (error) {
      try {
        const args = ['traces', 'query', '{}', ...this.commonArgs(), '--since', '24h', '--limit', '100', '-o', 'json']
        return normalizeTempoServices(parseJson((await this.run(args)).stdout, 'traces service discovery fallback'))
      } catch {
        if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
        throw tempoError(error)
      }
    }
  }

  private async enrichSearchStatuses(result: QueryResult): Promise<QueryResult> {
    const rows = await mapConcurrent(result.rows, STATUS_CONCURRENCY, async (row) => {
      if (asString(row.status) !== 'unknown') return row
      const traceId = asString(row.traceId)
      if (!TRACE_ID.test(traceId)) return row
      try {
        const trace = await this.get(traceId)
        const hasError = trace.rows.some((span) => asString(span.status).toUpperCase().includes('ERROR'))
        return { ...row, status: hasError ? 'error' : 'ok' }
      } catch {
        return row
      }
    })
    return { ...result, rows }
  }

  async search(expression: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const started = Date.now()
    try {
      const args = ['traces', 'query', expression, ...this.commonArgs(), ...searchRangeArgs(request), '--limit', String(SEARCH_LIMIT), '-o', 'json']
      const normalized = normalizeTempoSearch(parseJson((await this.run(args)).stdout, 'traces query'), Date.now() - started, searchRangeLabel(request))
      return request?.includeStatus ? this.enrichSearchStatuses(normalized) : normalized
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
      throw tempoError(error)
    }
  }

  async get(traceId: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const started = Date.now()
    const perf = (request as TempoQueryContext | undefined)?.performance ?? createTempoPerformance(request?.diagnosticRequestId, 'trace.get')
    try {
      const args = ['traces', 'get', traceId, ...this.commonArgs(), '-o', 'json']
      const gcxStarted = perf?.now() ?? 0
      const response = await this.run(args)
      const gcxWallMs = perf ? perf.now() - gcxStarted : 0
      const parseStarted = perf?.now()
      const raw = parseJson(response.stdout, 'traces get')
      if (parseStarted !== undefined) perf?.recordParse(perf.now() - parseStarted)
      perf?.recordGcx({ phase: 'traces.get', gcxWallMs, stdout: response.stdout, raw })
      const normalizeStarted = perf?.now()
      let result = normalizeTempoTrace(raw, Date.now() - started)
      if (normalizeStarted !== undefined) perf?.recordNormalize(perf.now() - normalizeStarted)
      if (perf) result = { ...result, execution: { ...result.execution!, requestId: perf.requestId } }
      const boundedTraceLookup = args.includes('--from') && args.includes('--to')
      perf?.complete({ spanCount: result.rows.length, boundedTraceLookup })
      return result
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('gcx returned')) throw error
      throw tempoError(error)
    }
  }
}
