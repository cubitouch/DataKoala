/**
 * Provider-neutral main-process facade. IPC continues to call this stable API;
 * provider behavior lives behind adapters and sessions.
 */
import { sqlDialectForSourceKind, type ConnectionId, type ConnectionStateEvent, type ConnectResult, type DataSourceProfile, type QueryResult } from '../shared/types.ts'
import { AdapterRegistry } from './data-source.ts'
import type { DataSourceSession } from './data-source.ts'
import { PostgresAdapter, DatabaseConnectionError, __testing } from './adapters/postgres-adapter.ts'
import { LocalFilesAdapter } from './adapters/local-files-adapter.ts'
import { SqliteFileAdapter } from './adapters/sqlite-file-adapter.ts'
import { BigQueryAdapter } from './adapters/bigquery-adapter.ts'
import { PrometheusAdapter } from './adapters/prometheus-adapter.ts'
import { TempoAdapter } from './adapters/tempo-adapter.ts'
import type { PrometheusQueryRequest } from '../shared/prometheus.ts'
import { formatPromql } from './promql-formatter.ts'
import { toIpcSafeQueryResult } from './ipc-serialization.ts'

const postgresAdapter = new PostgresAdapter()
export const adapterRegistry = new AdapterRegistry()
  .register(postgresAdapter)
  .register(new LocalFilesAdapter())
  .register(new SqliteFileAdapter())
  .register(new BigQueryAdapter())
  .register(new PrometheusAdapter())
  .register(new TempoAdapter())

export class SessionManager {
  private readonly registry: AdapterRegistry
  private readonly sessions = new Map<ConnectionId, { session: DataSourceSession; generation: number }>()
  private readonly pendingConnections = new Map<number, {
    profileId: ConnectionId
    adapter: ReturnType<AdapterRegistry['get']>
  }>()
  private connectionIntent = 0

  constructor(registry: AdapterRegistry) { this.registry = registry }

  async connect(profile: DataSourceProfile): Promise<ConnectResult> {
    const intent = ++this.connectionIntent
    const adapter = this.registry.get(profile.kind)
    const pending = { profileId: profile.id, adapter }
    this.pendingConnections.set(intent, pending)
    await Promise.all([this.closeSessions(), this.cancelPendingConnections(intent)])
    if (intent !== this.connectionIntent) {
      this.pendingConnections.delete(intent)
      return supersededResult()
    }

    let result: ConnectResult = supersededResult()
    try {
      const connected = await adapter.connect(profile)
      if (intent !== this.connectionIntent) {
        if (connected.session) await connected.session.close()
        return result
      }
      result = connected.result
      if (connected.result.ok && connected.session) {
        this.sessions.set(profile.id, { session: connected.session, generation: connected.result.generation })
      }
      return result
    } finally {
      this.pendingConnections.delete(intent)
    }
  }

  async disconnect(id: ConnectionId, generation?: number): Promise<void> {
    if (generation === undefined) {
      const pending = [...this.pendingConnections.entries()]
        .filter(([, connection]) => connection.profileId === id)
      for (const [intent] of pending) this.pendingConnections.delete(intent)
      if (pending.some(([intent]) => intent === this.connectionIntent)) this.connectionIntent++
      await Promise.allSettled(pending.map(([, connection]) => connection.adapter.cancelConnect?.(id)))
    }
    const current = this.sessions.get(id)
    if (!current || (generation !== undefined && current.generation !== generation)) return
    this.sessions.delete(id)
    await current.session.close()
  }

  async disconnectAll(): Promise<void> {
    this.connectionIntent++
    await Promise.all([this.closeSessions(), this.cancelPendingConnections()])
    await Promise.allSettled(this.registry.values().map((adapter) => adapter.shutdown?.()))
  }

  get(id: ConnectionId): DataSourceSession | undefined {
    return this.sessions.get(id)?.session
  }

  private async closeSessions(): Promise<void> {
    const active = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.allSettled(active.map(({ session }) => session.close()))
  }

  private async cancelPendingConnections(exceptIntent?: number): Promise<void> {
    const pending = [...this.pendingConnections.entries()]
      .filter(([intent]) => intent !== exceptIntent)
    for (const [intent] of pending) this.pendingConnections.delete(intent)
    await Promise.allSettled(pending.map(([, connection]) =>
      connection.adapter.cancelConnect?.(connection.profileId)))
  }
}

const sessionManager = new SessionManager(adapterRegistry)

export { DatabaseConnectionError, __testing }

export function onConnectionStateChanged(listener: (event: ConnectionStateEvent) => void): void {
  postgresAdapter.onConnectionStateChanged(listener)
}

export function testConnection(profile: DataSourceProfile) {
  return adapterRegistry.get(profile.kind).test(profile)
}

export async function connect(profile: DataSourceProfile): Promise<ConnectResult> {
  return sessionManager.connect(profile)
}

export async function disconnect(id: ConnectionId, generation?: number): Promise<void> {
  await sessionManager.disconnect(id, generation)
}

export async function disconnectAll(): Promise<void> {
  await sessionManager.disconnectAll()
}

function supersededResult(): ConnectResult {
  return { ok: false, error: 'This connection attempt was superseded by a newer connection.' }
}

function session(id: ConnectionId): DataSourceSession {
  const value = sessionManager.get(id)
  if (!value) throw new DatabaseConnectionError('NOT_CONNECTED', 'This profile is not connected.')
  return value
}

export async function runQuery(id: ConnectionId, sql: string, parameters: unknown[] = [], prometheus?: Omit<PrometheusQueryRequest, 'expression'>): Promise<QueryResult> {
  return toIpcSafeQueryResult(await session(id).query({ sql, parameters, prometheus }))
}

export function formatPrometheusQuery(_id: ConnectionId, query: string): Promise<string> {
  return formatPromql(query)
}

export function queryDialect(id: ConnectionId) {
  const provider = session(id).info.provider
  if (provider === 'prometheus') throw new Error('Prometheus uses PromQL, not a SQL dialect.')
  if (provider === 'tempo') throw new Error('Tempo uses TraceQL, not a SQL dialect.')
  return sqlDialectForSourceKind(provider)
}

export async function listObjects(id: ConnectionId) {
  return (await session(id).listRelations()).map((relation) => ({
    schema: relation.namespace,
    name: relation.name,
    kind: relation.kind === 'materialized-view' ? 'm' as const
      : relation.kind === 'view' ? 'v' as const
        : relation.kind === 'metric' ? 'metric' as const
          : relation.kind === 'service' ? 'service' as const
            : 'r' as const,
    details: relation.details
  }))
}

export async function describeTable(id: ConnectionId, schema: string, table: string) {
  return (await session(id).describeRelation({ namespace: schema, name: table })).map((column) => ({
    name: column.name,
    dataTypeName: column.nativeType,
    nullable: column.nullable ?? false
  }))
}

export function labelsForMetric(id: ConnectionId, metricName: string): Promise<string[]> {
  const operation = session(id).labelsForMetric
  if (!operation) throw new Error('Metric label discovery is not supported by this datasource.')
  return operation(metricName)
}

export function labelValues(id: ConnectionId, metricName: string, labelName: string): Promise<string[]> {
  const operation = session(id).labelValues
  if (!operation) throw new Error('Metric label discovery is not supported by this datasource.')
  return operation(metricName, labelName)
}

export async function explainQuery(id: ConnectionId, sql: string, analyze: boolean) {
  const explain = session(id).explain
  if (!explain) throw new Error('Explain is not supported by this datasource.')
  return explain(sql, analyze)
}
