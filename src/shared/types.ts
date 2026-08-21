export type ConnectionId = string

export type ConnectionLifecycleState = 'connecting' | 'connected' | 'idle' | 'reconnecting' | 'disconnecting' | 'disconnected' | 'failed'
export type ConnectionErrorCode = 'CONNECTION_LOST' | 'NOT_CONNECTED' | 'RECONNECTING' | 'RECONNECT_FAILED' | 'QUERY_CANCELLED_BY_DISCONNECT'
export type ConnectionFailureKind = 'transient' | 'authentication' | 'configuration' | 'server-unavailable' | 'unknown'

export interface ConnectionStateEvent {
  profileId: ConnectionId
  state: ConnectionLifecycleState
  expected: boolean
  message: string
  code: ConnectionErrorCode | null
  technicalDetail?: string
  generation: number
  timestamp: number
  recoverable: boolean
  recoverability?: ConnectionFailureKind
  source?: string
  activeOperationAffected?: boolean
}

export type DataSourceKind = 'postgres' | 'local-files' | 'sqlite-file' | 'bigquery' | 'prometheus' | 'tempo'
export type QueryEngine = 'postgres' | 'duckdb' | 'bigquery' | 'prometheus' | 'tempo'
export type SqlDialect = 'postgres' | 'duckdb' | 'google-sql'
export type QueryLanguage = { kind: 'sql'; dialect: SqlDialect } | { kind: 'promql' } | { kind: 'traceql' }
type SqlDataSourceKind = Exclude<DataSourceKind, 'prometheus' | 'tempo'>

export interface DataSourceDescriptor {
  sourceKind: DataSourceKind
  engine: QueryEngine
  dialect: SqlDialect
}

export const DATA_SOURCE_DESCRIPTORS: Record<SqlDataSourceKind, DataSourceDescriptor> = {
  postgres: { sourceKind: 'postgres', engine: 'postgres', dialect: 'postgres' },
  'local-files': { sourceKind: 'local-files', engine: 'duckdb', dialect: 'duckdb' },
  'sqlite-file': { sourceKind: 'sqlite-file', engine: 'duckdb', dialect: 'duckdb' },
  bigquery: { sourceKind: 'bigquery', engine: 'bigquery', dialect: 'google-sql' }
}

export function sqlDialectForSourceKind(kind: DataSourceKind): SqlDialect {
  if (kind === 'prometheus') throw new Error('Prometheus does not use a SQL dialect.')
  if (kind === 'tempo') throw new Error('Tempo does not use a SQL dialect.')
  return DATA_SOURCE_DESCRIPTORS[kind].dialect
}

export function queryLanguageForSourceKind(kind: DataSourceKind): QueryLanguage {
  if (kind === 'prometheus') return { kind: 'promql' }
  if (kind === 'tempo') return { kind: 'traceql' }
  return { kind: 'sql', dialect: DATA_SOURCE_DESCRIPTORS[kind].dialect }
}

interface ProfileBase {
  id: ConnectionId
  name: string
  version: 1
}

export interface PostgresProfile extends ProfileBase {
  kind: 'postgres'
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  /** readonly by default; the app never issues writes. */
  readonly: boolean
}

export interface LocalFilesProfile extends ProfileBase {
  kind: 'local-files'
  files: { path: string; alias: string }[]
  readonly: true
}

export interface SqliteFileProfile extends ProfileBase {
  kind: 'sqlite-file'
  path: string
  readonly: true
}

export interface BigQueryProfile extends ProfileBase {
  kind: 'bigquery'
  billingProject: string
  location?: string
  defaultProject?: string
  defaultDataset?: string
  /** Decimal bytes, kept as text because BigQuery quotas exceed JS's safe integer range. */
  maximumBytesBilled: string
  readonly: true
}

export interface GcxSignalTransportConfig {
  kind: 'gcx'
  context?: string
  datasourceUid?: string
}

export type PrometheusTransportConfig = GcxSignalTransportConfig
export type TempoTransportConfig = GcxSignalTransportConfig

export interface PrometheusProfile extends ProfileBase {
  kind: 'prometheus'
  readonly: true
  transport: PrometheusTransportConfig
}

export interface TempoProfile extends ProfileBase {
  kind: 'tempo'
  readonly: true
  transport: TempoTransportConfig
}

export type DataSourceProfile = PostgresProfile | LocalFilesProfile | SqliteFileProfile | BigQueryProfile | PrometheusProfile | TempoProfile
/** @deprecated Prefer the discriminated DataSourceProfile union. */
export type ConnectionProfile = PostgresProfile

export type LogicalType = 'number' | 'string' | 'boolean' | 'date' | 'timestamp' | 'json' | 'binary' | 'list' | 'struct' | 'unknown'

export interface ColumnMeta {
  name: string
  logicalType?: LogicalType
  nativeType?: string
  nativeTypeId?: string | number
  /** @deprecated Use nativeTypeId. */
  dataTypeID: number
  /** @deprecated Use nativeType and logicalType. */
  dataTypeName: string
}

export interface QueryExecutionInfo {
  provider: QueryEngine
  durationMs: number
  rowCount?: number
  truncated?: boolean
  bytesProcessed?: number
  cacheHit?: boolean
  notice?: string
  /** Opaque Tempo performance correlation ID, when diagnostics are enabled. */
  requestId?: string
}

export interface QueryResult {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  notice?: string
  execution?: QueryExecutionInfo
}

export interface DataSourceCapabilities {
  builder: boolean
  explain: boolean
  analyze: boolean
  queryCancellation: boolean
  parameterizedQueries: boolean
  costEstimate: boolean
  serverReadOnly: boolean
  schemaAutocomplete: boolean
}

/** The product capability matrix used by adapters and renderer controls alike. */
export const DATA_SOURCE_CAPABILITIES: Record<DataSourceKind, DataSourceCapabilities> = {
  postgres: { builder: true, explain: true, analyze: true, queryCancellation: false, parameterizedQueries: true, costEstimate: false, serverReadOnly: true, schemaAutocomplete: true },
  'local-files': { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: true, costEstimate: false, serverReadOnly: true, schemaAutocomplete: true },
  'sqlite-file': { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: true, costEstimate: false, serverReadOnly: true, schemaAutocomplete: true },
  bigquery: { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: true, costEstimate: true, serverReadOnly: false, schemaAutocomplete: true },
  prometheus: { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: false, costEstimate: false, serverReadOnly: true, schemaAutocomplete: false },
  tempo: { builder: true, explain: false, analyze: false, queryCancellation: false, parameterizedQueries: false, costEstimate: false, serverReadOnly: true, schemaAutocomplete: false }
}

export interface SourceInfo { label?: string; version?: string }
export type TestResult = { ok: true; sourceInfo?: SourceInfo; serverVersion?: string } | { ok: false; error: string }
export type ConnectResult = { ok: true; generation: number; sourceInfo?: SourceInfo; serverVersion?: string } | { ok: false; error: string }

export interface ExplainNode {
  plan: string
  nodeType: string
  actualRows?: number
  actualTime?: number
  loops?: number
  children?: ExplainNode[]
}

export interface ExplainResult {
  text: string
  tree?: ExplainNode
}

export interface TableInfo {
  schema: string
  name: string
  kind: 'r' | 'v' | 'm' | 'metric' | 'service'
  details?: DataObjectDetails
}

export type DataObjectDetails = {
  kind: 'metric'
  type?: string
  help?: string
  unit?: string
} | {
  kind: 'service'
  serviceNamespace?: string
}

export interface DatabaseColumnNode {
  name: string
  dataTypeName: string
  nullable?: boolean
}

export type ColumnsStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface DatabaseRelationNode extends TableInfo {
  qualifiedName: string
  columns?: DatabaseColumnNode[]
  columnsStatus: ColumnsStatus
  columnsError?: string
}

export interface DatabaseSchemaNode {
  name: string
  isSystem: boolean
  relations: DatabaseRelationNode[]
}

/** OIDs of date/timestamp-like types we treat as bucketable. */
export const TIME_TYPE_NAMES = new Set([
  'timestamp',
  'timestamptz',
  'date',
  'time',
  'timetz',
  'timestamp_s',
  'timestamp_ms',
  'timestamp_ns',
  'timestamp with time zone',
  'timestamp without time zone',
  'datetime'
])

export function isTimeType(typeName: string): boolean {
  return TIME_TYPE_NAMES.has(typeName.trim().toLowerCase())
}

/**
 * Numeric types, which are the only sensible choice for a chart's Y axis.
 * Covers both the short names db.ts maps from OIDs (int4, float8, numeric) and the
 * long names information_schema reports (integer, double precision).
 */
export const NUMERIC_TYPE_NAMES = new Set([
  'int2',
  'int4',
  'int8',
  'float4',
  'float8',
  'numeric',
  'money',
  'smallint',
  'integer',
  'bigint',
  'real',
  'double precision',
  'decimal',
  'tinyint',
  'hugeint',
  'utinyint',
  'usmallint',
  'uinteger',
  'ubigint',
  'uhugeint',
  'float',
  'double',
  'int64',
  'float64',
  'bignumeric'
])

export function isNumericType(typeName: string): boolean {
  const normalized = typeName.trim().toLowerCase()
  const baseType = normalized.replace(/\s*\([^)]*\)\s*$/, '')
  return NUMERIC_TYPE_NAMES.has(baseType)
}

/**
 * Pick sensible default chart fields for a result set: prefer a time column for X
 * and a genuinely numeric column for Y. Returns empty strings when there is no
 * reasonable choice, so the UI can prompt instead of rendering an empty chart.
 */
export function pickDefaultChartFields(columns: ColumnMeta[]): { xField: string; yField: string } {
  if (columns.length === 0) return { xField: '', yField: '' }
  const numeric = columns.filter((c) => isNumericType(c.dataTypeName))
  const time = columns.find((c) => isTimeType(c.dataTypeName))

  // X: a time column reads best; otherwise the first non-numeric (a category);
  // otherwise just the first column.
  const xField =
    time?.name ??
    columns.find((c) => !isNumericType(c.dataTypeName))?.name ??
    columns[0].name

  // Y: the first numeric column that is not already the X axis.
  const yField = numeric.find((c) => c.name !== xField)?.name ?? ''
  return { xField, yField }
}
