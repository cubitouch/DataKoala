import type { ColumnMeta } from '../shared/types.ts'
import type { LokiDatasourceOption, LokiLogRow, LokiMetadataRequest, LokiQueryRequest, LokiQueryResult, LokiResultKind } from '../shared/loki.ts'
import { normalizeGcxQuery } from './gcx-prometheus-transport.ts'
import { gcxError, parseGcxJson, runGcxCommand, sanitizeGcxError, type GcxCommandRunner } from './gcx-command.ts'
import { logqlResultKind } from '../shared/loki-builder.ts'

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const column = (name: string, logicalType: ColumnMeta['logicalType']): ColumnMeta => ({ name, logicalType, nativeType: logicalType, dataTypeID: 0, dataTypeName: logicalType ?? 'unknown' })

export function classifyLogql(expression: string): LokiResultKind {
  return logqlResultKind(expression)
}

export function normalizeLokiDatasources(raw: unknown): LokiDatasourceOption[] {
  if (!Array.isArray(raw)) throw new Error('gcx returned valid JSON, but the Grafana datasource response must be an array.')
  return raw.map((value) => {
    if (!isRecord(value) || typeof value.uid !== 'string' || typeof value.name !== 'string' || typeof value.type !== 'string') throw new Error('gcx returned an invalid Grafana datasource entry.')
    return value as unknown as LokiDatasourceOption
  }).filter(({ type }) => /loki/i.test(type)).sort((a, b) => a.name.localeCompare(b.name))
}

function severityOf(...records: Record<string, unknown>[]): string {
  const names = ['severity', 'severity_text', 'level', 'loglevel', 'log_level']
  for (const record of records) for (const [key, value] of Object.entries(record)) {
    if (names.includes(key.toLowerCase()) && value != null && String(value).trim()) return String(value).toLowerCase()
  }
  return 'unknown'
}
function traceIdOf(...records: Record<string, unknown>[]): string | undefined {
  for (const record of records) for (const [key, value] of Object.entries(record)) {
    if (['trace_id', 'traceid'].includes(key.toLowerCase()) && value != null && String(value)) return String(value)
  }
}

export function normalizeLokiQuery(raw: unknown, request: Pick<LokiQueryRequest, 'limit'>, durationMs = 0, expectedKind?: LokiResultKind): LokiQueryResult {
  if (!isRecord(raw)) throw new Error('gcx returned valid JSON, but the Loki response was not an object.')
  if (raw.status === 'error') throw new Error(sanitizeGcxError(String(raw.error ?? 'Loki rejected the query.')))
  const data = isRecord(raw.data) ? raw.data : raw
  if (!isRecord(data) || typeof data.resultType !== 'string' || !Array.isArray(data.result)) throw new Error('gcx returned an unsupported Loki response shape.')
  if (data.resultType === 'matrix' || data.resultType === 'vector') {
    if (expectedKind === 'logs') throw new Error('Loki returned metrics for a log expression.')
    const normalizedData = data.resultType === 'matrix' ? { ...data, result: data.result.map((series) => {
      if (!isRecord(series) || Array.isArray(series.values)) return series
      return Array.isArray(series.value) ? { ...series, values: [series.value] } : series
    }) } : data
    const metric = normalizeGcxQuery({ status: 'success', data: normalizedData }, durationMs)
    return { ...metric, resultKind: 'metrics', execution: { ...metric.execution!, provider: 'loki' } }
  }
  if (data.resultType !== 'streams') throw new Error(`Loki returned unexpected result kind "${data.resultType}".`)
  if (expectedKind === 'metrics') throw new Error('Loki returned log streams for a metric expression.')
  const rows: LokiLogRow[] = []
  for (const series of data.result) {
    if (!isRecord(series) || !isRecord(series.stream) || !Array.isArray(series.values)) throw new Error('Loki returned an invalid log stream.')
    const labels = Object.fromEntries(Object.entries(series.stream).map(([key, value]) => [key, String(value)]))
    for (const value of series.values) {
      const objectEntry = isRecord(value) ? value : undefined
      const tupleEntry = Array.isArray(value) ? value : undefined
      const timestamp = objectEntry?.timestamp ?? tupleEntry?.[0]
      const line = objectEntry?.line ?? tupleEntry?.[1]
      if (typeof timestamp !== 'string' || typeof line !== 'string') throw new Error('Loki returned an invalid log entry.')
      const rawStructured = objectEntry?.structuredMetadata ?? tupleEntry?.[2]
      const rawParsed = objectEntry?.parsed ?? tupleEntry?.[3]
      const structuredMetadata = isRecord(rawStructured) ? Object.fromEntries(Object.entries(rawStructured).map(([key, item]) => [key, String(item)])) : {}
      const parsedFields = isRecord(rawParsed) ? rawParsed : {}
      const timestampNs = timestamp
      let timestampMs: number
      try { timestampMs = Number(BigInt(timestampNs) / 1_000_000n) } catch { throw new Error('Loki returned an invalid nanosecond timestamp.') }
      rows.push({ id: `${timestampNs}:${rows.length}`, timestampNs, timestampMs, line, labels, structuredMetadata, parsedFields, severity: severityOf(parsedFields, structuredMetadata, labels), traceId: traceIdOf(parsedFields, structuredMetadata, labels) })
    }
  }
  const truncated = rows.length > request.limit
  const logRows = rows.slice(0, request.limit)
  return {
    resultKind: 'logs', logRows,
    columns: [column('timestampMs', 'timestamp'), column('line', 'string'), column('labels', 'json'), column('structuredMetadata', 'json'), column('parsedFields', 'json')],
    rows: logRows, rowCount: logRows.length, durationMs,
    notice: truncated ? `Showing the first ${request.limit} log entries; more results are available.` : undefined,
    execution: { provider: 'loki', durationMs, rowCount: logRows.length, truncated, notice: truncated ? `Result limited to ${request.limit} entries.` : undefined }
  }
}

function normalizeStringData(raw: unknown, description: string): string[] {
  const data = isRecord(raw) && raw.status === 'success' ? raw.data : undefined
  if (!Array.isArray(data) || data.some((item) => typeof item !== 'string')) throw new Error(`Loki returned an invalid ${description} response.`)
  return [...new Set(data as string[])].sort()
}

export interface LokiTransport {
  query(request: LokiQueryRequest): Promise<LokiQueryResult>
  datasources(): Promise<LokiDatasourceOption[]>
  labels(request: LokiMetadataRequest): Promise<string[]>
  labelValues(label: string, request: LokiMetadataRequest): Promise<string[]>
  formatQuery(query: string): Promise<string>
  probe(): Promise<void>
}
export class GcxLokiTransport implements LokiTransport {
  private readonly context: string | undefined
  private readonly run: GcxCommandRunner
  private readonly datasourceUid: string | undefined
  constructor(context?: string, run: GcxCommandRunner = runGcxCommand, datasourceUid?: string) {
    this.context = context
    this.run = run
    this.datasourceUid = datasourceUid
  }
  private contextArgs(): string[] { return this.context ? ['--context', this.context] : [] }
  private async json(args: string[], label: string): Promise<unknown> {
    try { return parseGcxJson((await this.run(args)).stdout, label) } catch (error) { if (error instanceof Error && /^(gcx returned|Loki returned|Invalid LogQL)/.test(error.message)) throw error; throw gcxError(error, 'Loki') }
  }
  async datasources() { return normalizeLokiDatasources(await this.json(['api', '/api/datasources', ...this.contextArgs(), '-o', 'json'], 'Grafana datasources')) }
  async probe(): Promise<void> {
    const datasources = await this.datasources()
    if (this.datasourceUid && datasources.length && !datasources.some(({ uid }) => uid === this.datasourceUid)) throw new Error('The selected Loki datasource is not available in this gcx context.')
  }
  async query(request: LokiQueryRequest): Promise<LokiQueryResult> {
    const kind = classifyLogql(request.expression)
    const started = Date.now()
    const args = kind === 'metrics' && this.datasourceUid
      ? ['api', this.metricProxyPath(request), ...this.contextArgs(), '-o', 'json']
      : ['logs', kind === 'logs' ? 'query' : 'metrics', request.expression, ...this.contextArgs(), ...(this.datasourceUid ? ['--datasource', this.datasourceUid] : []), '--from', request.start, '--to', request.end, '--step', request.step, ...(kind === 'logs' ? ['--limit', String(request.limit + 1)] : []), '-o', 'json']
    return normalizeLokiQuery(await this.json(args, kind === 'metrics' ? 'Loki metric range query' : 'logs query'), request, Date.now() - started, kind)
  }
  private metricProxyPath(request: LokiQueryRequest): string {
    if (!this.datasourceUid) throw new Error('Select a Loki datasource before querying metrics.')
    const params = new URLSearchParams({ query: request.expression, start: request.start, end: request.end, step: request.step })
    return `/api/datasources/proxy/uid/${encodeURIComponent(this.datasourceUid)}/loki/api/v1/query_range?${params}`
  }
  private proxyPath(endpoint: string, request: LokiMetadataRequest): string {
    if (!this.datasourceUid) throw new Error('Select a Loki datasource before exploring metadata.')
    const params = new URLSearchParams({ start: request.start, end: request.end })
    if (request.selector) params.set('query', request.selector)
    return `/api/datasources/proxy/uid/${encodeURIComponent(this.datasourceUid)}/loki/api/v1/${endpoint}?${params}`
  }
  async labels(request: LokiMetadataRequest) { return normalizeStringData(await this.json(['api', this.proxyPath('labels', request), ...this.contextArgs(), '-o', 'json'], 'Loki labels'), 'labels') }
  async labelValues(label: string, request: LokiMetadataRequest) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(label)) throw new Error('Invalid Loki label name.')
    return normalizeStringData(await this.json(['api', this.proxyPath(`label/${encodeURIComponent(label)}/values`, request), ...this.contextArgs(), '-o', 'json'], 'Loki label values'), 'label values')
  }
  async formatQuery(query: string): Promise<string> {
    if (!this.datasourceUid) throw new Error('Select a Loki datasource before formatting LogQL.')
    const path = `/api/datasources/proxy/uid/${encodeURIComponent(this.datasourceUid)}/loki/api/v1/format_query?${new URLSearchParams({ query })}`
    const raw = await this.json(['api', path, ...this.contextArgs(), '-o', 'json'], 'Loki format query')
    if (!isRecord(raw) || raw.status !== 'success' || typeof raw.data !== 'string') throw new Error('Loki returned an invalid format response.')
    return raw.data
  }
}
