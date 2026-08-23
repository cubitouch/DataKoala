import { create } from 'zustand'
import type { DataSourceProfile, ConnectionStateEvent, DatabaseColumnNode, DatabaseSchemaNode, QueryResult } from '@shared/types'
import type { VisualizationConfiguration } from '../lib/resultVisualization'
import { deduplicateResultFilters, resultFilterDemotion, stableResultFilterId, type ResultFilter } from '../lib/resultFilters'
import { selectBuilderRelationState } from '../lib/builderRelations'
import { clearedBuilderFiltersMessage, transitionBuilderState } from '../lib/builderTransitions'
import { SEVEN_DAYS, type BuilderTimeRange } from '../lib/builderTimeRange'
import { completeQueryState, deliverQueryResultState, startQueryState, stopQueryState } from '../lib/queryResultLifecycle'
import { normalizeDatabaseObjects } from '../lib/databaseObjects'
import { api } from '../lib/api'
import { DEFAULT_PROMQL_BUILDER, type PromqlBuilderState } from '../lib/promqlBuilder'
import { defaultQueryModeForDatasource, defaultQueryTextForDatasource } from '../lib/queryDefaults'
import { DEFAULT_LOKI_BUILDER, type LokiBuilderState } from '@shared/loki'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'idle' | 'reconnecting' | 'error'
export type MetadataStatus = 'idle' | 'loading' | 'loaded' | 'error'

export type ChartType = 'bar' | 'line' | 'scatter' | 'area' | 'treemap' | 'sunburst'
export type QueryMode = 'sql' | 'builder'
export type ExplainRequest = 'explain' | 'analyze' | null
export type TimeBucket = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
export interface BuilderQueryState {
  table: { schema: string; name: string } | null
  timeColumn: string | null
  timeBucket: TimeBucket
  seriesColumns: string[]
  timeRange?: BuilderTimeRange
}

export interface ChartConfig {
  type: ChartType
  xField: string
  yField: string
  seriesField?: string
  aggregation: 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max'
  timeBucket?: string
}

export interface QuerySession {
  id: string
  title: string
  connectionProfileId: string | null
  sql: string
  /** True only until the user first edits a newly-created manual query. */
  manualQueryPristine?: boolean
  prometheusTimeRange: BuilderTimeRange
  prometheusStep: '15s' | '30s' | '1m' | '5m'
  promqlBuilder: PromqlBuilderState
  lokiTimeRange: BuilderTimeRange
  lokiBuilder: LokiBuilderState
  lokiResultLimit: number
  lokiDisplayDirection: 'backward' | 'forward'
  lokiBreakdown: string | null
  lokiRangeHistory: BuilderTimeRange[]
  running: boolean
  queryError: string | null
  result: QueryResult | null
  pendingResult: QueryResult | null
  resultRevision: number
  lastSuccessfulResultRevision: number
  isResultStale: boolean
  queryMode: QueryMode
  builder: BuilderQueryState
  builderHasRun: boolean
  sqlVisualization: VisualizationConfiguration
  builderVisualization: VisualizationConfiguration
  sqlResultFilters: ResultFilter[]
  builderResultFilters: ResultFilter[]
  queryFilterRevision: Record<QueryMode, number>
  builderFilterNotice: { id: number; message: string } | null
  explainText: string | null
  showExplain: boolean
  activeExplainRequest: ExplainRequest
  seriesVisibility: Record<string, boolean>
}

export interface ConnectionMetadataState {
  schemas: DatabaseSchemaNode[]
  status: MetadataStatus
  error: string | null
  isStale: boolean
}

const defaultSqlVisualization = (): VisualizationConfiguration => ({
  view: 'table', xColumn: null, valueColumn: null, aggregation: 'sum', seriesColumn: null,
  seriesColumns: [], hierarchyDimensions: [], valueAxisScale: 'linear', anomalyDetectionEnabled: false
})
const defaultBuilderVisualization = (): VisualizationConfiguration => ({
  view: 'line', xColumn: 'time_bucket', valueColumn: 'count', aggregation: 'sum', seriesColumn: null,
  seriesColumns: [], hierarchyDimensions: [], valueAxisScale: 'linear', anomalyDetectionEnabled: false
})

let sessionSequence = 0
function sessionId(): string {
  sessionSequence++
  return globalThis.crypto?.randomUUID?.() ?? `query-${Date.now()}-${sessionSequence}`
}

export function createQuerySession(index = 1, options: Partial<Pick<QuerySession, 'id' | 'title' | 'connectionProfileId' | 'queryMode' | 'sql'>> = {}): QuerySession {
  return {
    id: options.id ?? sessionId(),
    title: options.title ?? `Query ${index}`,
    connectionProfileId: options.connectionProfileId ?? null,
    sql: options.sql ?? defaultQueryTextForDatasource(),
    manualQueryPristine: options.sql === undefined,
    prometheusTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' },
    prometheusStep: '30s',
    promqlBuilder: { ...DEFAULT_PROMQL_BUILDER, filterBy: [], groupBy: [], labelValues: {} },
    lokiTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' },
    lokiBuilder: { ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] },
    lokiResultLimit: 1000,
    lokiDisplayDirection: 'backward',
    lokiBreakdown: null,
    lokiRangeHistory: [],
    running: false,
    queryError: null,
    result: null,
    pendingResult: null,
    resultRevision: 0,
    lastSuccessfulResultRevision: 0,
    isResultStale: false,
    queryMode: options.queryMode ?? defaultQueryModeForDatasource(),
    builder: { table: null, timeColumn: null, timeBucket: 'day', seriesColumns: [], timeRange: SEVEN_DAYS },
    builderHasRun: false,
    sqlVisualization: defaultSqlVisualization(),
    builderVisualization: defaultBuilderVisualization(),
    sqlResultFilters: [],
    builderResultFilters: [],
    queryFilterRevision: { sql: 0, builder: 0 },
    builderFilterNotice: null,
    explainText: null,
    showExplain: false,
    activeExplainRequest: null,
    seriesVisibility: {}
  }
}

const EMPTY_METADATA: ConnectionMetadataState = { schemas: [], status: 'idle', error: null, isStale: false }
function emptyMetadata(): ConnectionMetadataState {
  return EMPTY_METADATA
}

export interface AppState {
  profiles: DataSourceProfile[]
  activeProfileId: string | null
  serverVersion: string | null
  connected: boolean
  connecting: boolean
  connectionStatus: ConnectionStatus
  connectionError: string | null
  connectionGeneration: number
  disconnectedAt: number | null
  reconnectAttemptId: number
  activeReconnectAttempt: { id: number; profileId: string } | null
  metadataByProfileId: Record<string, ConnectionMetadataState>

  tabs: QuerySession[]
  activeTabId: string

  setProfiles: (profiles: DataSourceProfile[]) => void
  setActive: (id: string | null) => void
  detachProfile: (id: string) => void
  setConnected: (value: boolean, version?: string | null, error?: string | null) => void
  setConnecting: (value: boolean) => void
  setConnectionGeneration: (generation: number) => void
  applyConnectionEvent: (event: ConnectionStateEvent) => void
  connectProfile: (profile: DataSourceProfile) => Promise<void>
  reconnectActiveProfile: () => Promise<void>
  setMetadata: (schemas: DatabaseSchemaNode[], status: MetadataStatus, error?: string | null, profileId?: string) => void
  setRelationColumns: (qualifiedName: string, columns: DatabaseColumnNode[] | undefined, status: 'loading' | 'loaded' | 'error', error?: string, profileId?: string) => void

  createTab: () => string
  activateTab: (id: string) => Promise<void>
  closeTab: (id: string) => void
  renameTab: (id: string, title: string) => void
  clearActiveResults: () => void
  resetActiveQuery: () => void

  setSql: (sql: string, tabId?: string) => void
  setPrometheusQueryOptions: (patch: Partial<Pick<QuerySession, 'prometheusTimeRange' | 'prometheusStep'>>, tabId?: string) => void
  setPromqlBuilder: (patch: Partial<PromqlBuilderState>, tabId?: string) => void
  setLokiState: (patch: Partial<Pick<QuerySession, 'lokiTimeRange' | 'lokiBuilder' | 'lokiResultLimit' | 'lokiDisplayDirection' | 'lokiBreakdown' | 'lokiRangeHistory'>>, tabId?: string) => void
  setResult: (result: QueryResult | null, error?: string | null, tabId?: string) => void
  startQuery: (tabId?: string) => void
  completeQuery: (result: QueryResult | null, error?: string | null, tabId?: string) => void
  setRunning: (value: boolean, tabId?: string) => void
  setQueryMode: (mode: QueryMode, tabId?: string) => void
  setBuilder: (patch: Partial<BuilderQueryState>, tabId?: string) => void
  clearBuilderFilterNotice: (id: number, tabId?: string) => void
  selectBuilderRelation: (table: NonNullable<BuilderQueryState['table']>, tabId?: string) => void
  setBuilderHasRun: (value: boolean, tabId?: string) => void
  setVisualization: (mode: QueryMode, patch: Partial<VisualizationConfiguration>, tabId?: string) => void
  addResultFilter: (mode: QueryMode, filter: ResultFilter, tabId?: string) => void
  removeResultFilter: (mode: QueryMode, id: string, tabId?: string) => void
  clearResultFilters: (mode: QueryMode, tabId?: string) => void
  setResultFilterExecution: (mode: QueryMode, id: string, execution: 'client' | 'query', tabId?: string) => void
  setExplain: (text: string | null, tabId?: string) => void
  setShowExplain: (value: boolean, tabId?: string) => void
  setActiveExplainRequest: (request: ExplainRequest, tabId?: string) => void
  setSeriesVisibility: (visibility: Record<string, boolean>, tabId?: string) => void
}

export function selectActiveSession(state: Pick<AppState, 'tabs' | 'activeTabId'>): QuerySession {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0]
}

export function selectSession(state: Pick<AppState, 'tabs'>, id: string): QuerySession | undefined {
  return state.tabs.find((tab) => tab.id === id)
}

export function selectActiveMetadata(state: Pick<AppState, 'metadataByProfileId' | 'activeProfileId'>): ConnectionMetadataState {
  return state.activeProfileId ? state.metadataByProfileId[state.activeProfileId] ?? EMPTY_METADATA : EMPTY_METADATA
}

function patchSession(state: AppState, id: string | undefined, update: (session: QuerySession) => QuerySession): Partial<AppState> {
  const target = id ?? state.activeTabId
  if (!state.tabs.some((tab) => tab.id === target)) return {}
  return { tabs: state.tabs.map((tab) => tab.id === target ? update(tab) : tab) }
}

function nextQueryTitle(tabs: QuerySession[]): string {
  const used = new Set(tabs.map((tab) => tab.title))
  let index = tabs.length + 1
  while (used.has(`Query ${index}`)) index++
  return `Query ${index}`
}

let connectionIntent = 0

const initialSession = createQuerySession(1)

export const useStore = create<AppState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  serverVersion: null,
  connected: false,
  connecting: false,
  connectionStatus: 'disconnected',
  connectionError: null,
  connectionGeneration: 0,
  disconnectedAt: null,
  reconnectAttemptId: 0,
  activeReconnectAttempt: null,
  metadataByProfileId: {},

  tabs: [initialSession],
  activeTabId: initialSession.id,

  setProfiles: (profiles) => set({ profiles }),
  setActive: (id) => set((state) => {
    const active = selectActiveSession(state)
    if (active.activeExplainRequest) return {}
    const sameConnection = state.activeProfileId === id
    return {
      ...patchSession(state, state.activeTabId, (session) => ({ ...session, connectionProfileId: id })),
      activeProfileId: id,
      ...(sameConnection ? {} : {
        reconnectAttemptId: state.reconnectAttemptId + 1,
        activeReconnectAttempt: null,
        connecting: false,
        connected: false,
        connectionStatus: 'disconnected' as const,
        connectionError: null,
        serverVersion: null
      })
    }
  }),
  detachProfile: (id) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.connectionProfileId === id ? { ...tab, connectionProfileId: null } : tab),
    ...(state.activeProfileId === id ? {
      activeProfileId: null, connected: false, connecting: false, connectionStatus: 'disconnected' as const,
      connectionError: null, serverVersion: null
    } : {})
  })),
  setConnected: (value, version, error) => set({
    connected: value,
    connectionStatus: value ? 'connected' : error ? 'error' : 'disconnected',
    serverVersion: version ?? null,
    connectionError: error ?? null
  }),
  setConnecting: (value) => set((state) => ({ connecting: value, connectionStatus: value ? 'connecting' : state.connectionStatus })),
  setConnectionGeneration: (connectionGeneration) => set({ connectionGeneration }),
  applyConnectionEvent: (event) => set((state) => {
    if (event.profileId !== state.activeProfileId || event.generation < state.connectionGeneration) return {}
    const metadata = state.metadataByProfileId[event.profileId] ?? emptyMetadata()
    if (event.state === 'idle') return {
      connectionGeneration: event.generation, connected: true, connecting: false, connectionStatus: 'idle', connectionError: null
    }
    if (event.state === 'reconnecting') return {
      connectionGeneration: event.generation, connected: false, connecting: true, connectionStatus: 'reconnecting', connectionError: null
    }
    if (event.state === 'connected') return {
      connectionGeneration: event.generation, connected: true, connecting: false, connectionStatus: 'connected', connectionError: null
    }
    if (event.state !== 'failed' && event.state !== 'disconnected') return { connectionGeneration: event.generation }
    return {
      connectionGeneration: event.generation,
      connected: false,
      connecting: false,
      connectionStatus: event.state === 'failed' ? 'error' : 'disconnected',
      connectionError: event.expected ? null : event.message,
      serverVersion: null,
      disconnectedAt: event.timestamp,
      metadataByProfileId: { ...state.metadataByProfileId, [event.profileId]: { ...metadata, isStale: true } },
      tabs: state.tabs.map((tab) => tab.connectionProfileId === event.profileId ? {
        ...tab,
        running: false,
        pendingResult: null,
        isResultStale: Boolean(tab.result)
      } : tab)
    }
  }),
  connectProfile: async (profile) => {
    const intent = ++connectionIntent
    const previous = get().activeProfileId
    const previousGeneration = get().connectionGeneration
    if (previous && previous !== profile.id) {
      await api.connections.disconnect(previous, previousGeneration).catch(() => undefined)
      if (intent !== connectionIntent) return
    }
    set((state) => ({
      ...patchSession(state, state.activeTabId, (session) => ({ ...session, connectionProfileId: profile.id })),
      activeProfileId: profile.id,
      connecting: true,
      connected: false,
      connectionStatus: 'connecting',
      connectionError: null,
      serverVersion: null
    }))
    try {
      const result = await api.connections.connect(profile)
      if (intent !== connectionIntent || get().activeProfileId !== profile.id) {
        if (result.ok) await api.connections.disconnect(result.id ?? profile.id, result.generation).catch(() => undefined)
        return
      }
      const actualId = result.id ?? profile.id
      if (!result.ok) {
        set({ connected: false, connecting: false, connectionStatus: 'error', connectionError: result.error, serverVersion: null })
        return
      }
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, connectionProfileId: actualId } : tab),
        activeProfileId: actualId,
        connected: true,
        connecting: false,
        connectionStatus: 'connected',
        connectionGeneration: result.generation,
        serverVersion: result.serverVersion,
        connectionError: null,
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [actualId]: { ...(state.metadataByProfileId[actualId] ?? emptyMetadata()), status: 'loading', error: null }
        }
      }))
      if (actualId !== profile.id) set({ profiles: await api.connections.list() })
      try {
        const schemas = normalizeDatabaseObjects(await api.connections.listObjects(actualId))
        if (intent !== connectionIntent) return
        get().setMetadata(schemas, 'loaded', null, actualId)
      } catch (error) {
        if (intent !== connectionIntent) return
        get().setMetadata([], 'error', error instanceof Error ? error.message : String(error), actualId)
      }
    } catch (error) {
      if (intent !== connectionIntent || get().activeProfileId !== profile.id) return
      set({
        connected: false, connecting: false, connectionStatus: 'error', serverVersion: null,
        connectionError: error instanceof Error ? error.message : String(error)
      })
    }
  },
  reconnectActiveProfile: async () => {
    const state = get()
    const profile = state.profiles.find((candidate) => candidate.id === state.activeProfileId)
    if (!profile || state.connecting) return
    const attemptId = state.reconnectAttemptId + 1
    set({ reconnectAttemptId: attemptId, activeReconnectAttempt: { id: attemptId, profileId: profile.id }, connectionStatus: 'reconnecting' })
    await get().connectProfile(profile)
    const current = get()
    if (current.activeReconnectAttempt?.id === attemptId) set({ activeReconnectAttempt: null })
  },
  setMetadata: (schemas, status, error, profileId) => set((state) => {
    const id = profileId ?? state.activeProfileId
    if (!id) return {}
    const previous = state.metadataByProfileId[id] ?? emptyMetadata()
    return {
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [id]: { schemas, status, error: error ?? null, isStale: status === 'loaded' ? false : previous.isStale }
      }
    }
  }),
  setRelationColumns: (qualifiedName, columns, status, error, profileId) => set((state) => {
    const id = profileId ?? state.activeProfileId
    if (!id) return {}
    const metadata = state.metadataByProfileId[id] ?? emptyMetadata()
    return {
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [id]: {
          ...metadata,
          schemas: metadata.schemas.map((schema) => ({
            ...schema,
            relations: schema.relations.map((relation) => relation.qualifiedName === qualifiedName
              ? { ...relation, columns, columnsStatus: status, columnsError: error }
              : relation)
          }))
        }
      }
    }
  }),

  createTab: () => {
    const state = get()
    const active = selectActiveSession(state)
    const tab = createQuerySession(state.tabs.length + 1, {
      title: nextQueryTitle(state.tabs),
      connectionProfileId: active.connectionProfileId
    })
    set({ tabs: [...state.tabs, tab], activeTabId: tab.id })
    return tab.id
  },
  activateTab: async (id) => {
    const before = get()
    const target = selectSession(before, id)
    if (!target) return
    const previousProfile = before.activeProfileId
    const targetProfile = target.connectionProfileId
    const sameProfile = previousProfile === targetProfile && before.connected
    set({
      activeTabId: id,
      activeProfileId: targetProfile,
      ...(sameProfile ? {} : {
        connected: false, connecting: false, connectionStatus: 'disconnected' as const,
        connectionError: null, serverVersion: null, activeReconnectAttempt: null
      })
    })
    if (sameProfile) return
    const intent = ++connectionIntent
    if (previousProfile) await api.connections.disconnect(previousProfile, before.connectionGeneration).catch(() => undefined)
    if (intent !== connectionIntent || get().activeTabId !== id) return
    if (!targetProfile) return
    const profile = get().profiles.find((candidate) => candidate.id === targetProfile)
    if (!profile) return
    // connectProfile owns its own intent token; the active-tab check above prevents a stale switch from invoking it.
    await get().connectProfile(profile)
  },
  closeTab: (id) => set((state) => {
    const index = state.tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return {}
    if (state.tabs.length === 1) {
      const fresh = createQuerySession(1, { connectionProfileId: state.tabs[0].connectionProfileId })
      return { tabs: [fresh], activeTabId: fresh.id }
    }
    const tabs = state.tabs.filter((tab) => tab.id !== id)
    if (state.activeTabId !== id) return { tabs }
    const next = tabs[Math.min(index, tabs.length - 1)]
    return { tabs, activeTabId: next.id }
  }),
  renameTab: (id, title) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.id === id ? { ...tab, title: title.trim() || tab.title } : tab)
  })),
  clearActiveResults: () => set((state) => patchSession(state, undefined, (session) => ({
    ...session,
    running: false,
    queryError: null,
    result: null,
    pendingResult: null,
    resultRevision: 0,
    lastSuccessfulResultRevision: 0,
    isResultStale: false,
    sqlResultFilters: session.sqlResultFilters.filter((filter) => filter.execution === 'query'),
    builderResultFilters: session.builderResultFilters.filter((filter) => filter.execution === 'query'),
    explainText: null,
    showExplain: false,
    activeExplainRequest: null,
    seriesVisibility: {}
  }))),
  resetActiveQuery: () => set((state) => patchSession(state, undefined, (session) => {
    const fresh = createQuerySession(1, {
      id: session.id,
      title: session.title,
      connectionProfileId: session.connectionProfileId
    })
    return fresh
  })),

  setSql: (sql, tabId) => set((state) => patchSession(state, tabId, (session) => session.activeExplainRequest ? session : {
    ...session,
    sql,
    manualQueryPristine: false,
    sqlResultFilters: session.sqlResultFilters.map((filter) => filter.execution === 'query' ? { ...filter, execution: 'client' as const } : filter)
  })),
  setPrometheusQueryOptions: (patch, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, ...patch }))),
  setLokiState: (patch, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, ...patch }))),
  setPromqlBuilder: (patch, tabId) => set((state) => patchSession(state, tabId, (session) => ({
    ...session, promqlBuilder: { ...session.promqlBuilder, ...patch }
  }))),
  setResult: (result, error, tabId) => set((state) => patchSession(state, tabId, (session) => result
    ? { ...session, ...deliverQueryResultState(session, result) }
    : { ...session, queryError: error ?? null })),
  startQuery: (tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, ...startQueryState(session) }))),
  completeQuery: (result, error, tabId) => set((state) => patchSession(state, tabId, (session) => {
    const next = completeQueryState(session, result, error ?? null)
    return result
      ? { ...session, ...next, isResultStale: false, lastSuccessfulResultRevision: session.resultRevision + 1 }
      : { ...session, ...next }
  })),
  setRunning: (value, tabId) => set((state) => patchSession(state, tabId, (session) => value
    ? { ...session, running: true }
    : { ...session, ...stopQueryState(session) })),
  setQueryMode: (queryMode, tabId) => set((state) => patchSession(state, tabId, (session) => session.activeExplainRequest ? session : { ...session, queryMode })),
  setBuilder: (patch, tabId) => set((state) => patchSession(state, tabId, (session) => {
    if (session.activeExplainRequest) return session
    const transition = transitionBuilderState(session, patch)
    const message = clearedBuilderFiltersMessage(transition.removedDescriptions)
    return {
      ...session,
      builder: transition.builder,
      builderResultFilters: transition.builderResultFilters,
      queryFilterRevision: transition.queryFilterRevision ?? session.queryFilterRevision,
      ...(message ? { builderFilterNotice: { id: (session.builderFilterNotice?.id ?? 0) + 1, message } } : {})
    }
  })),
  clearBuilderFilterNotice: (id, tabId) => set((state) => patchSession(state, tabId, (session) =>
    session.builderFilterNotice?.id === id ? { ...session, builderFilterNotice: null } : session)),
  selectBuilderRelation: (table, tabId) => set((state) => patchSession(state, tabId, (session) => {
    if (session.activeExplainRequest) return session
    const selected = selectBuilderRelationState(session, table)
    const transition = transitionBuilderState(session, { table, timeColumn: null, seriesColumns: [] })
    const message = clearedBuilderFiltersMessage(transition.removedDescriptions)
    return {
      ...selected,
      builder: transition.builder,
      builderResultFilters: transition.builderResultFilters,
      queryFilterRevision: transition.queryFilterRevision ?? session.queryFilterRevision,
      ...(message ? { builderFilterNotice: { id: (session.builderFilterNotice?.id ?? 0) + 1, message } } : {})
    }
  })),
  setBuilderHasRun: (builderHasRun, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, builderHasRun }))),
  setVisualization: (mode, patch, tabId) => set((state) => patchSession(state, tabId, (session) => {
    const key = mode === 'sql' ? 'sqlVisualization' : 'builderVisualization'
    return { ...session, [key]: { ...session[key], ...patch } }
  })),
  addResultFilter: (mode, filter, tabId) => set((state) => patchSession(state, tabId, (session) => {
    const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
    return { ...session, [key]: deduplicateResultFilters([...session[key], filter]) }
  })),
  removeResultFilter: (mode, id, tabId) => set((state) => patchSession(state, tabId, (session) => {
    const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
    const removed = session[key].find((filter) => filter.id === id)
    return {
      ...session,
      [key]: session[key].filter((filter) => filter.id !== id),
      queryFilterRevision: removed?.execution === 'query'
        ? { ...session.queryFilterRevision, [mode]: session.queryFilterRevision[mode] + 1 }
        : session.queryFilterRevision
    }
  })),
  clearResultFilters: (mode, tabId) => set((state) => patchSession(state, tabId, (session) => {
    const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
    const revision = session[key].some((filter) => filter.execution === 'query')
      ? { ...session.queryFilterRevision, [mode]: session.queryFilterRevision[mode] + 1 }
      : session.queryFilterRevision
    return { ...session, [key]: [], queryFilterRevision: revision }
  })),
  setResultFilterExecution: (mode, id, execution, tabId) => set((state) => patchSession(state, tabId, (session) => {
    const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
    const target = session[key].find((filter) => filter.id === id)
    const resultAlias = target?.column as 'series' | 'time_bucket'
    const provenance = mode === 'builder' && session.builder.table && (resultAlias === 'series' || resultAlias === 'time_bucket') ? {
      mode: 'builder' as const,
      resultAlias,
      table: session.builder.table,
      sourceColumns: resultAlias === 'series' ? [...session.builder.seriesColumns] : [],
      timeColumn: session.builder.timeColumn,
      timeBucket: session.builder.timeBucket,
      sourceKind: resultAlias === 'time_bucket' ? 'time-bucket' as const : session.builder.seriesColumns.length === 1 ? 'single-column' as const : 'series-tuple' as const,
      targetKind: resultAlias === 'time_bucket' ? 'time-bucket' as const : session.builder.seriesColumns.length === 1 ? 'source-column' as const : 'series-tuple' as const,
      ...(resultAlias === 'series' && session.builder.seriesColumns.length === 1 ? { sourceColumn: session.builder.seriesColumns[0] } : {}),
      displayLabel: resultAlias === 'series' && session.builder.seriesColumns.length === 1
        ? session.builder.seriesColumns[0]
        : resultAlias === 'series' ? session.builder.seriesColumns.join(' + ') : `${session.builder.timeBucket} ${session.builder.timeColumn ?? 'time'}`,
      ...(resultAlias === 'time_bucket' && target && (target.operator === 'range' || target.operator === 'notRange')
        ? { rangeKind: 'bucket-boundaries' as const }
        : {})
    } : undefined
    const columns = session.result?.columns.map((column) => column.name) ?? []
    const filters = deduplicateResultFilters(session[key].map((filter) => {
      if (filter.id !== id) return filter
      const semanticProvenance = mode === 'builder' ? (filter.provenance ?? provenance) : undefined
      if (execution === 'client') {
        const demotion = resultFilterDemotion(filter, columns)
        if (!demotion.allowed) return filter
        const demoted = { ...filter, execution, provenance: semanticProvenance ? { ...semanticProvenance, clientResultColumn: demotion.column } : undefined }
        return { ...demoted, id: stableResultFilterId(demoted) }
      }
      const promoted = { ...filter, execution, provenance: semanticProvenance }
      return { ...promoted, id: stableResultFilterId(promoted) }
    }))
    return {
      ...session,
      [key]: filters,
      queryFilterRevision: { ...session.queryFilterRevision, [mode]: session.queryFilterRevision[mode] + 1 }
    }
  })),
  setExplain: (explainText, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, explainText }))),
  setShowExplain: (showExplain, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, showExplain }))),
  setActiveExplainRequest: (activeExplainRequest, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, activeExplainRequest }))),
  setSeriesVisibility: (seriesVisibility, tabId) => set((state) => patchSession(state, tabId, (session) => ({ ...session, seriesVisibility })))
}))
