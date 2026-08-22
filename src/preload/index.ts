import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  ConnectResult,
  ConnectionStateEvent,
  DataSourceProfile,
  QueryResult,
  TableInfo,
  TestResult
} from '@shared/types'
import type { SeriesCardinalityProbeRequest, SeriesCardinalityProbeResult, SeriesStatisticsRequest, SeriesStatisticsResult } from '@shared/chartLimits'
import type { BigQueryDatasetOption, BigQueryDiscoveryDefaults, BigQueryProjectOption } from '@shared/bigqueryDiscovery'
import type { PrometheusDatasourceOption, PrometheusDiscoveryResult, PrometheusQueryRequest } from '@shared/prometheus'
import type { TempoQueryRequest, TempoSearchProgress, TempoSearchProgressEnvelope } from '@shared/tempo'
import type { PrometheusTransportConfig } from '@shared/types'

let queryProgressSequence = 0

function nextQueryProgressRequestId(): string {
  queryProgressSequence += 1
  return `${process.pid}-${Date.now()}-${queryProgressSequence}-${Math.random().toString(36).slice(2)}`
}

const api = {
  /** True only when the app is launched by a test/repro harness. */
  smokeMode: process.env.DATAKOALA_SMOKE === '1' || !!process.env.DATAKOALA_REPRO,
  /** Narrow opt-in flag; no arbitrary environment values cross the context bridge. */
  tempoPerformanceEnabled: process.env.DATAKOALA_TEMPO_PERF === '1',
  connections: {
    list: (): Promise<DataSourceProfile[]> => ipcRenderer.invoke('connections:list'),
    upsert: (p: DataSourceProfile): Promise<DataSourceProfile> =>
      ipcRenderer.invoke('connections:upsert', p),
    chooseFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.CONNECTION_CHOOSE_FILES),
    chooseSqliteFile: (): Promise<string | null> => ipcRenderer.invoke(IPC.CONNECTION_CHOOSE_SQLITE_FILE),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('connections:remove', id),
    test: (p: DataSourceProfile): Promise<TestResult> =>
      ipcRenderer.invoke(IPC.CONNECTION_TEST, p),
    connect: (
      p: DataSourceProfile
    ): Promise<ConnectResult & { id: string }> =>
      ipcRenderer.invoke(IPC.CONNECTION_CONNECT, p),
    disconnect: (id: string, generation?: number): Promise<void> => ipcRenderer.invoke(IPC.CONNECTION_DISCONNECT, id, generation),
    onStateChanged: (listener: (event: ConnectionStateEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        if (isConnectionStateEvent(value)) listener(value)
      }
      ipcRenderer.on(IPC.CONNECTION_STATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.CONNECTION_STATE_CHANGED, handler)
    },
    listObjects: (id: string): Promise<TableInfo[]> => ipcRenderer.invoke(IPC.CONNECTION_LIST_OBJECTS, id),
    describeTable: (id: string, schema: string, table: string) =>
      ipcRenderer.invoke(IPC.CONNECTION_DESCRIBE_TABLE, id, schema, table),
    bigquery: {
      discoverProjects: (): Promise<BigQueryProjectOption[]> => ipcRenderer.invoke(IPC.BIGQUERY_DISCOVER_PROJECTS),
      listDatasets: (projectId: string): Promise<BigQueryDatasetOption[]> => ipcRenderer.invoke(IPC.BIGQUERY_LIST_DATASETS, projectId),
      discoverDefaults: (): Promise<BigQueryDiscoveryDefaults> => ipcRenderer.invoke(IPC.BIGQUERY_DISCOVER_DEFAULTS)
    },
    prometheus: {
      discover: (transport: PrometheusTransportConfig): Promise<PrometheusDiscoveryResult> => ipcRenderer.invoke(IPC.PROMETHEUS_DISCOVER, transport),
      discoverDatasources: (transport: Pick<PrometheusTransportConfig, 'kind' | 'context'>): Promise<PrometheusDatasourceOption[]> => ipcRenderer.invoke(IPC.PROMETHEUS_DISCOVER_DATASOURCES, transport),
      labelsForMetric: (id: string, metricName: string): Promise<string[]> => ipcRenderer.invoke(IPC.PROMETHEUS_METRIC_LABELS, id, metricName),
      labelValues: (id: string, metricName: string, labelName: string): Promise<string[]> => ipcRenderer.invoke(IPC.PROMETHEUS_LABEL_VALUES, id, metricName, labelName),
      formatQuery: (connectionId: string, query: string): Promise<string> => ipcRenderer.invoke(IPC.PROMETHEUS_FORMAT_QUERY, connectionId, query)
    },
    tempo: {
      attributeValues: (id: string, attribute: string): Promise<string[]> => ipcRenderer.invoke(IPC.TEMPO_ATTRIBUTE_VALUES, id, attribute)
    }
  },
  query: {
    run: async (
      id: string,
      sql: string,
      parameters: unknown[] = [],
      request?: Omit<PrometheusQueryRequest, 'expression'> | TempoQueryRequest,
      onProgress?: (progress: TempoSearchProgress, requestId?: string) => void,
      tempoDiagnostic = false
    ): Promise<QueryResult> => {
      const requestId = (onProgress || (tempoDiagnostic && api.tempoPerformanceEnabled)) ? nextQueryProgressRequestId() : ''
      const diagnosticRequest = api.tempoPerformanceEnabled && (onProgress || tempoDiagnostic)
        ? { ...(request ?? {}), diagnosticRequestId: requestId }
        : request
      if (!onProgress) return ipcRenderer.invoke(IPC.QUERY_RUN, id, sql, parameters, diagnosticRequest)
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        if (!isTempoSearchProgressEnvelope(value) || value.requestId !== requestId) return
        onProgress(value.progress, requestId)
      }
      ipcRenderer.on(IPC.QUERY_PROGRESS, handler)
      try {
        return await ipcRenderer.invoke(IPC.QUERY_RUN, id, sql, parameters, {
          ...(diagnosticRequest ?? {}),
          progressRequestId: requestId
        })
      } finally {
        ipcRenderer.removeListener(IPC.QUERY_PROGRESS, handler)
      }
    },
    probeSeriesCardinality: (id: string, request: SeriesCardinalityProbeRequest): Promise<SeriesCardinalityProbeResult> =>
      ipcRenderer.invoke(IPC.QUERY_PROBE_SERIES_CARDINALITY, id, request),
    seriesStatistics: (id: string, request: SeriesStatisticsRequest): Promise<SeriesStatisticsResult> =>
      ipcRenderer.invoke(IPC.QUERY_SERIES_STATISTICS, id, request),
    explain: (id: string, sql: string, analyze: boolean): Promise<{ text: string }> =>
      ipcRenderer.invoke(IPC.QUERY_EXPLAIN, id, sql, analyze)
  },
  export: {
    saveText: (opts: { defaultName: string; content: string }): Promise<string | null> =>
      ipcRenderer.invoke('export:save-text', opts),
    saveBinary: (opts: {
      defaultName: string
      base64: string
      extensions?: string[]
    }): Promise<string | null> => ipcRenderer.invoke('export:save-binary', opts)
  },
  clipboardImage: {
    writePng: (dataUrl: string): Promise<{ ok: true } | { ok: false }> =>
      ipcRenderer.invoke(IPC.CLIPBOARD_WRITE_PNG, dataUrl)
  }
}

function isConnectionStateEvent(value: unknown): value is ConnectionStateEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return typeof event.profileId === 'string' &&
    ['connecting', 'connected', 'idle', 'reconnecting', 'disconnecting', 'disconnected', 'failed'].includes(String(event.state)) &&
    typeof event.expected === 'boolean' && typeof event.message === 'string' &&
    (event.code === null || ['CONNECTION_LOST', 'NOT_CONNECTED', 'RECONNECTING', 'RECONNECT_FAILED', 'QUERY_CANCELLED_BY_DISCONNECT'].includes(String(event.code))) &&
    typeof event.generation === 'number' && typeof event.timestamp === 'number' && typeof event.recoverable === 'boolean' &&
    (event.technicalDetail === undefined || typeof event.technicalDetail === 'string') &&
    (event.recoverability === undefined || ['transient', 'authentication', 'configuration', 'server-unavailable', 'unknown'].includes(String(event.recoverability))) &&
    (event.source === undefined || ['pool:idle-client-error', 'pool:client-acquired', 'pool:connect-failed', 'client:active-query-error', 'client:end', 'socket:close'].includes(String(event.source))) &&
    (event.activeOperationAffected === undefined || typeof event.activeOperationAffected === 'boolean')
}

function isTempoSearchProgressEnvelope(value: unknown): value is TempoSearchProgressEnvelope {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Record<string, unknown>
  if (typeof envelope.requestId !== 'string' || !envelope.progress || typeof envelope.progress !== 'object') return false
  const progress = envelope.progress as Record<string, unknown>
  return progress.provider === 'tempo' &&
    typeof progress.coveredMs === 'number' && typeof progress.totalMs === 'number' &&
    typeof progress.completedChunks === 'number' && typeof progress.pendingChunks === 'number' &&
    typeof progress.queriesCompleted === 'number' && typeof progress.tracesFound === 'number' &&
    Array.isArray(progress.rows)
}

contextBridge.exposeInMainWorld('datakoala', api)

export type DataKoalaApi = typeof api
