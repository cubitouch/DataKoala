import type {
  ConnectionStateEvent,
  DataSourceCapabilities,
  DataSourceKind,
  DataSourceProfile,
  DataObjectDetails,
  ConnectResult,
  ExplainResult,
  QueryResult,
  TestResult
} from '../shared/types.ts'
import type { PrometheusQueryRequest } from '../shared/prometheus.ts'
import type { TempoQueryRequest } from '../shared/tempo.ts'

export interface DataNamespace { name: string; isSystem?: boolean }
export interface DataNamespaceRef { name: string }
export interface DataRelation { namespace: string; name: string; kind: 'table' | 'view' | 'materialized-view' | 'metric' | 'service'; details?: DataObjectDetails }
export interface DataRelationRef { namespace: string; name: string }
export interface DataColumn { name: string; nativeType: string; nullable?: boolean }
export interface QueryRequest {
  sql: string
  parameters?: unknown[]
  prometheus?: Omit<PrometheusQueryRequest, 'expression'>
  tempo?: TempoQueryRequest
}
export interface QueryEstimate { bytesProcessed?: number; notice?: string }
export interface SessionInfo { profileId: string; provider: DataSourceKind; serverVersion?: string }

export interface DataSourceSession {
  info: SessionInfo
  capabilities: DataSourceCapabilities
  query(request: QueryRequest): Promise<QueryResult>
  listNamespaces(): Promise<DataNamespace[]>
  listRelations(namespace?: DataNamespaceRef): Promise<DataRelation[]>
  describeRelation(ref: DataRelationRef): Promise<DataColumn[]>
  labelsForMetric?(metricName: string): Promise<string[]>
  labelValues?(metricName: string, labelName: string): Promise<string[]>
  attributeValues?(attribute: string): Promise<string[]>
  explain?(sql: string, analyze?: boolean): Promise<ExplainResult>
  estimateQuery?(sql: string): Promise<QueryEstimate>
  cancel?(queryId: string): Promise<void>
  close(): Promise<void>
}

export interface DataSourceAdapter {
  readonly kind: DataSourceKind
  test(profile: DataSourceProfile): Promise<TestResult>
  connect(profile: DataSourceProfile): Promise<{ result: ConnectResult; session?: DataSourceSession }>
  /** Cancel an in-progress connection for one profile, when the provider supports it. */
  cancelConnect?(profileId: string): Promise<void>
  /** Release adapter-owned work that has not produced a session yet. */
  shutdown?(): Promise<void>
  onConnectionStateChanged?(listener: (event: ConnectionStateEvent) => void): void
}

export class AdapterRegistry {
  private readonly adapters = new Map<DataSourceKind, DataSourceAdapter>()

  register(adapter: DataSourceAdapter): this {
    if (this.adapters.has(adapter.kind)) throw new Error(`Adapter already registered for ${adapter.kind}`)
    this.adapters.set(adapter.kind, adapter)
    return this
  }

  get(kind: DataSourceKind): DataSourceAdapter {
    const adapter = this.adapters.get(kind)
    if (!adapter) throw new Error(`No data source adapter is registered for ${kind}`)
    return adapter
  }

  values(): DataSourceAdapter[] { return [...this.adapters.values()] }
}
