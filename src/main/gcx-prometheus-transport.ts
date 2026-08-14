import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PrometheusDatasourceOption, PrometheusMetricMetadata, PrometheusQueryRequest } from '../shared/prometheus.ts'
import type { ColumnMeta, QueryResult } from '../shared/types.ts'
import type { PrometheusTransport } from './prometheus-transport.ts'

export interface GcxCommandResult { stdout: string; stderr: string }
export type GcxCommandRunner = (args: string[]) => Promise<GcxCommandResult>

const execute = promisify(execFile)
export const runGcxCommand: GcxCommandRunner = async (args) => {
  const result = await execute('gcx', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true })
  return { stdout: result.stdout, stderr: result.stderr }
}

function parseJson(value: string, command: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error(`gcx returned malformed JSON for ${command}. Update gcx and try again.`) }
}

function errorMessage(error: unknown): string {
  const value = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
  if (value?.code === 'ENOENT') return 'gcx is not installed. Install gcx, then try again.'
  const detail = `${value?.stderr ?? ''} ${value?.stdout ?? ''} ${value?.message ?? ''}`.toLowerCase()
  if (/expired|token.*expir|session.*expir/.test(detail)) return 'gcx authentication has expired. Run gcx login, then try again.'
  if (/not authenticated|not logged|no.*context|login required|unauthenticated/.test(detail)) return 'gcx is installed but no authenticated context is available. Run gcx login, then try again.'
  if (/forbidden|permission|not permitted|access denied|status.?403/.test(detail)) return 'Metrics access is not permitted for this account.'
  const raw = `${value?.stderr ?? ''} ${value?.stdout ?? ''}`.trim()
  if (raw && /parse|promql|query|bad_data|execution|timeout|server error/i.test(raw)) return sanitizeGcxError(raw)
  return 'gcx could not complete the Prometheus operation. Check the selected context and run gcx login if needed.'
}

function sanitizeGcxError(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1[redacted]')
    .replace(/(cookie\s*[:=]\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/(token|password|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s@]+@/g, 'https://[redacted]@')
    .trim()
}

function throwNormalizedGcxApiError(error: unknown): never {
  if (error instanceof Error && (error.name === 'PrometheusApiError' || error.message.startsWith('gcx returned') || error.message.startsWith('Select a Grafana'))) throw error
  const value = error as NodeJS.ErrnoException & { stderr?: string }
  const normalized = errorMessage(error)
  if (/not installed|authentication has expired|no authenticated context|not permitted/.test(normalized)) throw new Error(normalized)
  const exitCode = value?.code === undefined ? '' : ` (exit code ${String(value.code)})`
  const stderr = sanitizeGcxError(value?.stderr ?? '')
  const diagnostic = `gcx api failed${exitCode}${stderr ? `: ${stderr}` : `: ${normalized}`}`
  if (process.env.NODE_ENV !== 'production') console.error(`[prometheus:gcx] ${diagnostic}`)
  throw new Error(diagnostic)
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`gcx metric metadata field "${key}" must be a string.`)
  return value
}

export function normalizeGcxMetadata(raw: unknown): PrometheusMetricMetadata[] {
  if (!isRecord(raw) || raw.status !== 'success' || !isRecord(raw.data)) {
    throw new Error('gcx returned valid JSON, but the metrics metadata response must contain status "success" and a data object.')
  }

  const entries: PrometheusMetricMetadata[] = []
  for (const [name, values] of Object.entries(raw.data)) {
    if (!name || !Array.isArray(values)) throw new Error(`gcx returned an unexpected metadata entry for metric "${name}".`)
    for (const value of values) {
      if (!isRecord(value)) throw new Error(`gcx returned a non-object metadata value for metric "${name}".`)
      entries.push({ name, type: optionalString(value, 'type'), help: optionalString(value, 'help'), unit: optionalString(value, 'unit') })
    }
  }

  const unique = new Map<string, PrometheusMetricMetadata>()
  for (const entry of entries) {
    const previous = unique.get(entry.name)
    unique.set(entry.name, previous ? {
      name: entry.name,
      type: previous.type ?? entry.type,
      help: previous.help ?? entry.help,
      unit: previous.unit ?? entry.unit
    } : entry)
  }
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[prometheus:gcx] gcx returned ${entries.length} raw metadata entries`)
    console.debug(`[prometheus:gcx] DataKoala normalized ${unique.size} unique metrics`)
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeGcxLabels(raw: unknown): string[] {
  if (!isRecord(raw) || raw.status !== 'success' || !Array.isArray(raw.data) || raw.data.some((value) => typeof value !== 'string')) {
    throw new Error('gcx returned valid JSON, but the labels response must contain status "success" and a string data array.')
  }
  return [...new Set(raw.data as string[])].sort((a, b) => a.localeCompare(b))
}

export function normalizeGcxDatasources(raw: unknown): PrometheusDatasourceOption[] {
  if (!Array.isArray(raw)) throw new Error('gcx returned valid JSON, but the Grafana datasource response must be an array.')
  const compatible: PrometheusDatasourceOption[] = []
  for (const value of raw) {
    if (!isRecord(value) || typeof value.uid !== 'string' || typeof value.name !== 'string' || typeof value.type !== 'string') {
      throw new Error('gcx returned an invalid Grafana datasource entry.')
    }
    if (/prometheus|mimir/i.test(value.type)) compatible.push({ uid: value.uid, name: value.name, type: value.type })
  }
  return compatible.sort((a, b) => a.name.localeCompare(b.name))
}

const column = (name: string, logicalType: ColumnMeta['logicalType'], nativeType: string, dataTypeID: number): ColumnMeta =>
  ({ name, logicalType, nativeType, dataTypeID, dataTypeName: nativeType })

function samplePair(value: unknown, context: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'number') throw new Error(`gcx returned an invalid ${context} sample.`)
  const numeric = typeof value[1] === 'number' ? value[1] : typeof value[1] === 'string' ? Number(value[1]) : NaN
  if (Number.isNaN(numeric)) throw new Error(`gcx returned a non-numeric ${context} sample value.`)
  return [value[0], numeric]
}

export function normalizeGcxQuery(raw: unknown, durationMs = 0): QueryResult {
  if (!isRecord(raw)) throw new Error('gcx returned valid JSON, but the Prometheus query response was not an object.')
  if (raw.status === 'error') {
    const detail = typeof raw.error === 'string' ? raw.error : 'Prometheus rejected the query.'
    const kind = typeof raw.errorType === 'string' ? `${raw.errorType}: ` : ''
    const error = new Error(sanitizeGcxError(`${kind}${detail}`))
    error.name = 'PrometheusApiError'
    throw error
  }
  if (raw.status !== 'success' || !isRecord(raw.data) || !Array.isArray(raw.data.result) || !['matrix', 'vector'].includes(String(raw.data.resultType))) {
    throw new Error('gcx returned valid JSON, but not a supported Prometheus matrix or vector response.')
  }
  const labels = new Set<string>()
  const pending: { metric: Record<string, string>; pair: [number, number] }[] = []
  for (const item of raw.data.result) {
    if (!isRecord(item) || !isRecord(item.metric) || Object.values(item.metric).some((v) => typeof v !== 'string')) throw new Error('gcx returned an invalid Prometheus series label set.')
    const metric = item.metric as Record<string, string>
    Object.keys(metric).forEach((name) => labels.add(name))
    if (raw.data.resultType === 'matrix') {
      if (!Array.isArray(item.values)) throw new Error('gcx returned a matrix series without values.')
      item.values.forEach((value) => pending.push({ metric, pair: samplePair(value, 'range') }))
    } else pending.push({ metric, pair: samplePair(item.value, 'instant') })
  }
  const labelNames = [...labels].sort()
  const rows = pending.map(({ metric, pair }) => {
    const identity = labelNames.filter((name) => metric[name] !== undefined).map((name) => `${name}=${JSON.stringify(metric[name])}`).join(',')
    return { timestamp: new Date(pair[0] * 1000).toISOString(), value: pair[1], series: identity ? `{${identity}}` : '{}', ...metric }
  })
  return {
    columns: [column('timestamp', 'timestamp', 'timestamptz', 1184), column('value', 'number', 'double precision', 701), column('series', 'string', 'text', 25), ...labelNames.map((name) => column(name, 'string', 'text', 25))],
    rows, rowCount: rows.length, durationMs,
    execution: { provider: 'prometheus', durationMs, rowCount: rows.length }
  }
}

export function normalizeGcxFormattedQuery(raw: unknown): string {
  if (!isRecord(raw)) throw new Error('gcx returned valid JSON, but the Prometheus format response was not an object.')
  if (raw.status === 'error') {
    const detail = typeof raw.error === 'string' ? raw.error : 'Prometheus rejected the query.'
    const kind = typeof raw.errorType === 'string' ? `${raw.errorType}: ` : ''
    const error = new Error(sanitizeGcxError(`${kind}${detail}`))
    error.name = 'PrometheusApiError'
    throw error
  }
  if (raw.status !== 'success' || typeof raw.data !== 'string') {
    throw new Error('gcx returned valid JSON, but the Prometheus format response must contain status "success" and string data.')
  }
  return raw.data
}

function normalizeVersion(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const value = optionalString(record, 'version') ?? optionalString(record, 'Version')
    if (value) return value
  }
  throw new Error('gcx returned valid JSON, but did not include a version.')
}

export class GcxPrometheusTransport implements PrometheusTransport {
  private readonly context: string | undefined
  private readonly datasourceUid: string | undefined
  private readonly run: GcxCommandRunner
  private readonly labelCache = new Map<string, Promise<string[]>>()
  constructor(context: string | undefined, run: GcxCommandRunner = runGcxCommand, datasourceUid?: string) { this.context = context; this.run = run; this.datasourceUid = datasourceUid }
  async datasources(): Promise<PrometheusDatasourceOption[]> {
    try {
      const contextArgs = this.context ? ['--context', this.context] : []
      return normalizeGcxDatasources(parseJson((await this.run(['api', '/api/datasources', ...contextArgs, '-o', 'json'])).stdout, 'Grafana datasources'))
    } catch (error) { throwNormalizedGcxError(error) }
  }
  async version(): Promise<string> {
    try {
      return normalizeVersion(parseJson((await this.run(['version', '-o', 'json'])).stdout, 'version'))
    } catch (error) { throwNormalizedGcxError(error) }
  }
  async metadata(): Promise<PrometheusMetricMetadata[]> {
    try {
      const contextArgs = this.context ? ['--context', this.context] : []
      const datasourceArgs = this.datasourceUid ? ['--datasource', this.datasourceUid] : []
      return normalizeGcxMetadata(parseJson((await this.run(['metrics', 'metadata', ...contextArgs, ...datasourceArgs, '-o', 'json'])).stdout, 'metrics metadata'))
    } catch (error) { throwNormalizedGcxError(error) }
  }
  labelsForMetric(metricName: string): Promise<string[]> {
    return this.cachedLabels(`metric:${metricName}`, ['--metric', metricName]).then((labels) => labels.filter((label) => label !== '__name__'))
  }
  labelValues(metricName: string, labelName: string): Promise<string[]> {
    return this.cachedLabels(`values:${metricName}:${labelName}`, ['--metric', metricName, '--label', labelName])
  }
  private cachedLabels(key: string, scopeArgs: string[]): Promise<string[]> {
    const cached = this.labelCache.get(key)
    if (cached) return cached
    const request = this.fetchLabels(scopeArgs).catch((error) => { this.labelCache.delete(key); throw error })
    this.labelCache.set(key, request)
    return request
  }
  private async fetchLabels(scopeArgs: string[]): Promise<string[]> {
    try {
      if (!this.datasourceUid) throw new Error('Select a Prometheus datasource before exploring labels.')
      const contextArgs = this.context ? ['--context', this.context] : []
      const metricName = scopeArgs[1]
      const labelName = scopeArgs[3]
      const base = `/api/datasources/proxy/uid/${encodeURIComponent(this.datasourceUid)}/api/v1/`
      const endpoint = labelName ? `label/${encodeURIComponent(labelName)}/values` : 'labels'
      const query = new URLSearchParams({ 'match[]': metricName }).toString()
      return normalizeGcxLabels(parseJson((await this.run(['api', `${base}${endpoint}?${query}`, ...contextArgs, '-o', 'json'])).stdout, 'metrics labels'))
    } catch (error) { throwNormalizedGcxError(error) }
  }
  async query(request: PrometheusQueryRequest): Promise<QueryResult> {
    const started = Date.now()
    try {
      const contextArgs = this.context ? ['--context', this.context] : []
      const datasourceArgs = this.datasourceUid ? ['--datasource', this.datasourceUid] : []
      const args = ['metrics', 'query', request.expression, ...contextArgs, ...datasourceArgs, '--from', request.start, '--to', request.end, '--step', request.step, '-o', 'json']
      return normalizeGcxQuery(parseJson((await this.run(args)).stdout, 'metrics query'), Date.now() - started)
    } catch (error) { throwNormalizedGcxError(error) }
  }
  async formatQuery(query: string): Promise<string> {
    try {
      if (!this.datasourceUid?.trim()) throw new Error('Select a Grafana Prometheus datasource before formatting PromQL.')
      const uid = encodeURIComponent(this.datasourceUid.trim())
      const search = new URLSearchParams({ query }).toString()
      const path = `/api/datasources/proxy/uid/${uid}/api/v1/format_query?${search}`
      const contextArgs = this.context ? ['--context', this.context] : []
      const args = ['api', path, ...contextArgs, '-o', 'json']
      return normalizeGcxFormattedQuery(parseJson((await this.run(args)).stdout, 'Prometheus format query'))
    } catch (error) { throwNormalizedGcxApiError(error) }
  }
}

function throwNormalizedGcxError(error: unknown): never {
  if (error instanceof Error && (error.name === 'PrometheusApiError' || error.message.startsWith('gcx returned') || error.message.startsWith('Select a Grafana') || error.message.includes('metric metadata shape') || /^(bad_data|execution|timeout|canceled|Prometheus rejected)/.test(error.message))) throw error
  throw new Error(errorMessage(error))
}
