import { BigQuery, BigQueryDate, BigQueryDatetime, BigQueryInt, BigQueryTime, BigQueryTimestamp, Geography } from '@google-cloud/bigquery'
import type { BigQueryProfile, ColumnMeta, ConnectResult, DataSourceCapabilities, DataSourceProfile, LogicalType, QueryResult, TestResult } from '../../shared/types.ts'
import type { DataColumn, DataRelation, DataSourceAdapter, DataSourceSession, QueryRequest } from '../data-source.ts'

const ROW_LIMIT = 10_000
const capabilities: DataSourceCapabilities = { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: true, costEstimate: true, serverReadOnly: false, schemaAutocomplete: false }

export interface BigQueryClientLike {
  getDatasets(options?: Record<string, unknown>): Promise<unknown[]>
  dataset(id: string, options?: Record<string, unknown>): any
  createQueryJob(options: Record<string, unknown>): Promise<any[]>
}
export type BigQueryClientFactory = (options: { projectId: string }) => BigQueryClientLike

function profile(value: DataSourceProfile): BigQueryProfile {
  if (value.kind !== 'bigquery') throw new Error('A BigQuery profile is required.')
  if (!value.billingProject.trim()) throw new Error('Billing project is required.')
  if (!/^\d+$/.test(value.maximumBytesBilled) || BigInt(value.maximumBytesBilled) <= 0n) throw new Error('Maximum bytes billed must be a positive decimal integer.')
  return value
}

function friendlyError(error: unknown): string {
  const e = error as { code?: number | string; message?: string; errors?: { reason?: string }[] }
  const message = e?.message || String(error)
  const reason = e?.errors?.[0]?.reason || ''
  if (e?.code === 401 || /credential|authentication|unauthenticated/i.test(message)) return `BigQuery authentication failed. Configure Google Application Default Credentials. ${message}`
  if (reason === 'accessDenied' || e?.code === 403 && !/disabled|has not been used/i.test(message)) return `BigQuery permission denied for the configured project. ${message}`
  if (/disabled|has not been used|not enabled/i.test(message)) return `The BigQuery API is disabled for the billing project. ${message}`
  if (/location/i.test(message)) return `BigQuery location mismatch. Check the configured location; queries are not retried elsewhere. ${message}`
  if (e?.code === 404 || /project.*not found|notFound/i.test(reason)) return `BigQuery project was not found or is inaccessible. ${message}`
  return `BigQuery request failed. ${message}`
}

function logical(type: string): LogicalType {
  const t = type.toUpperCase()
  if (['INT64', 'INTEGER', 'FLOAT64', 'FLOAT', 'NUMERIC', 'BIGNUMERIC', 'DECIMAL', 'BIGDECIMAL'].includes(t)) return 'number'
  if (['DATE', 'DATETIME', 'TIME'].includes(t)) return 'date'
  if (t === 'TIMESTAMP') return 'timestamp'
  if (t === 'BOOL' || t === 'BOOLEAN') return 'boolean'
  if (t === 'BYTES') return 'binary'
  if (t === 'JSON') return 'json'
  if (t === 'RECORD' || t === 'STRUCT') return 'struct'
  return 'string'
}

export function normalizeBigQueryValue(value: any): unknown {
  if (value == null) return null
  if (value instanceof BigQueryInt || value instanceof BigQueryDate || value instanceof BigQueryDatetime || value instanceof BigQueryTime || value instanceof BigQueryTimestamp || value instanceof Geography) return value.value
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (Array.isArray(value)) return value.map(normalizeBigQueryValue)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    return Object.fromEntries(keys.map((key) => [key, normalizeBigQueryValue(value[key])]))
  }
  return value
}

class BigQuerySession implements DataSourceSession {
  readonly info
  readonly capabilities = capabilities
  private readonly client: BigQueryClientLike
  private readonly p: BigQueryProfile
  constructor(client: BigQueryClientLike, p: BigQueryProfile) {
    this.client = client
    this.p = p
    this.info = { profileId: p.id, provider: 'bigquery' as const }
  }
  private project() { return this.p.defaultProject?.trim() || this.p.billingProject }
  async listNamespaces() {
    const [datasets] = await this.client.getDatasets({ projectId: this.project(), all: true }) as any
    return datasets.filter((d: any) => !this.p.defaultDataset || d.id === this.p.defaultDataset).map((d: any) => ({ name: `${this.project()}.${d.id}` }))
  }
  async listRelations(namespace?: { name: string }): Promise<DataRelation[]> {
    const datasetId = namespace?.name.split('.').at(-1) || this.p.defaultDataset
    if (!datasetId) return []
    const [tables] = await this.client.dataset(datasetId, { projectId: this.project() }).getTables({ autoPaginate: true })
    return Promise.all(tables.map(async (table: any) => {
      const [metadata] = await table.getMetadata(); const type = metadata.type
      return { namespace: `${this.project()}.${datasetId}`, name: table.id, kind: type === 'VIEW' ? 'view' : type === 'MATERIALIZED_VIEW' ? 'materialized-view' : 'table' }
    }))
  }
  async describeRelation(ref: { namespace: string; name: string }): Promise<DataColumn[]> {
    const datasetId = ref.namespace.split('.').at(-1)!
    const [metadata] = await this.client.dataset(datasetId, { projectId: this.project() }).table(ref.name).getMetadata()
    return (metadata.schema?.fields || []).map((field: any) => ({ name: field.name, nativeType: field.type, nullable: field.mode !== 'REQUIRED' }))
  }
  async query(request: QueryRequest): Promise<QueryResult> {
    const common = { query: request.sql, params: request.parameters || [], useLegacySql: false, location: this.p.location || undefined, defaultDataset: this.p.defaultDataset ? { projectId: this.project(), datasetId: this.p.defaultDataset } : undefined, maximumBytesBilled: this.p.maximumBytesBilled }
    const [dryJob] = await this.client.createQueryJob({ ...common, dryRun: true })
    const dryMetadata = dryJob.metadata
    const statementType = dryMetadata.statistics?.query?.statementType
    if (statementType !== 'SELECT') throw new Error(`BigQuery is read-only: only one SELECT statement is allowed (received ${statementType || 'a script or unsupported statement'}).`)
    const started = Date.now()
    const [job] = await this.client.createQueryJob(common)
    const [rows, nextQuery, apiResponse] = await job.getQueryResults({ maxResults: ROW_LIMIT + 1, autoPaginate: false })
    const [metadata] = await job.getMetadata()
    const query = metadata.statistics?.query || {}; const schema = apiResponse?.schema?.fields || []
    const truncated = rows.length > ROW_LIMIT || Boolean(nextQuery || apiResponse?.pageToken)
    const safeRows = rows.slice(0, ROW_LIMIT).map((row: any) => normalizeBigQueryValue(row) as Record<string, unknown>)
    const columns: ColumnMeta[] = schema.map((field: any) => ({ name: field.name, nativeType: field.type, logicalType: field.mode === 'REPEATED' ? 'list' : logical(field.type), nativeTypeId: field.type, dataTypeID: 0, dataTypeName: field.type }))
    const durationMs = Date.now() - started
    const bytes = Number(query.totalBytesProcessed)
    return { columns, rows: safeRows, rowCount: safeRows.length, durationMs, execution: { provider: 'bigquery', durationMs, rowCount: safeRows.length, truncated, bytesProcessed: Number.isSafeInteger(bytes) ? bytes : undefined, cacheHit: query.cacheHit } }
  }
  async estimateQuery(sql: string) { const [job] = await this.client.createQueryJob({ query: sql, dryRun: true, useLegacySql: false, location: this.p.location || undefined, maximumBytesBilled: this.p.maximumBytesBilled }); return { bytesProcessed: Number(job.metadata?.statistics?.query?.totalBytesProcessed) } }
  async close() {}
}

export class BigQueryAdapter implements DataSourceAdapter {
  readonly kind = 'bigquery' as const
  private readonly createClient: BigQueryClientFactory
  constructor(createClient: BigQueryClientFactory = (options) => new BigQuery(options)) { this.createClient = createClient }
  private client(p: BigQueryProfile) { return this.createClient({ projectId: p.billingProject }) }
  async test(value: DataSourceProfile): Promise<TestResult> {
    try { const p = profile(value); await this.client(p).getDatasets({ projectId: p.defaultProject || p.billingProject, maxResults: 1 }); return { ok: true, sourceInfo: { label: 'Google BigQuery' } } }
    catch (error) { return { ok: false, error: friendlyError(error) } }
  }
  async connect(value: DataSourceProfile): Promise<{ result: ConnectResult; session?: DataSourceSession }> {
    const p = profile(value); const tested = await this.test(p)
    if (!tested.ok) return { result: tested }
    return { result: { ok: true, generation: Date.now(), sourceInfo: tested.sourceInfo }, session: new BigQuerySession(this.client(p), p) }
  }
}

export const __testing = { friendlyError, capabilities, ROW_LIMIT }
