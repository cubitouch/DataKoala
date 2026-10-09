import { create } from 'zustand'
import {
  queryLanguageForSourceKind,
  type DataSourceProfile,
  type ConnectionStateEvent,
  type DatabaseColumnNode,
  type DatabaseSchemaNode,
  type ExplainNode,
  type QueryResult,
} from '@shared/types'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import {
  deduplicateResultFilters,
  resultFilterDemotion,
  stableResultFilterId,
  type ResultFilter,
} from '@lib/resultFilters'
import { selectBuilderRelationState } from '@lib/builderRelations'
import {
  clearedBuilderFiltersMessage,
  transitionBuilderState,
} from '@lib/builderTransitions'
import { SEVEN_DAYS, type BuilderTimeRange } from '@lib/builderTimeRange'
import {
  completeQueryState,
  deliverQueryResultState,
  startQueryState,
  stopQueryState,
} from '@lib/queryResultLifecycle'
import { api } from '@lib/api'
import { loadConnectionMetadata } from '@lib/connectionMetadata'
import { refreshConnectionMetadata } from '@lib/metadataRefresh'
import {
  isCurrentProfileConnectionEvent,
  isUsableProfileConnection,
} from '@lib/connectionLifecycle'
import {
  DEFAULT_PROMQL_BUILDER,
  type PromqlBuilderState,
} from '@lib/promqlBuilder'
import {
  defaultQueryModeForDatasource,
  defaultQueryTextForDatasource,
} from '@lib/queryDefaults'
import { DEFAULT_LOKI_BUILDER, type LokiBuilderState } from '@shared/loki'
import {
  DEFAULT_TRACE_RANGE,
  DEFAULT_TRACE_RESULT_VIEW,
  DEFAULT_TRACE_SAMPLE_SIZE,
  defaultTempoBuilder,
  type TraceResultView,
} from '@lib/tempoQueryState'
import type { TraceBuilderState, TraceSampleSize } from '@lib/traceBuilder'
import { sanitizeAiErrorContext } from '@shared/aiErrorContext'
import type { AiBuilderState } from '@shared/ai'
import {
  aiBuilderMutationFingerprint,
  aiBuilderStatesEqual,
  normalizedAiBuilderState,
  transitionBuilderConfiguration,
  transitionNotice,
} from '@lib/builderConfiguration'

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'idle'
  | 'reconnecting'
  | 'error'
export type MetadataStatus = 'idle' | 'loading' | 'loaded' | 'error'
export interface ProfileConnectionState {
  status: ConnectionStatus
  generation: number
  error: string | null
  serverVersion: string | null
}

export type ChartType =
  'bar' | 'line' | 'scatter' | 'area' | 'treemap' | 'sunburst'
export type QueryMode = 'sql' | 'builder'
export type ExplainRequest = 'explain' | 'analyze' | null
export type TimeBucket =
  'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
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
  prometheusStep: import('@lib/prometheusResolution').PrometheusStep
  promqlBuilder: PromqlBuilderState
  lokiTimeRange: BuilderTimeRange
  lokiBuilder: LokiBuilderState
  lokiResultLimit: number
  lokiGroupBy: string[]
  lokiResultView:
    | 'list'
    | 'table'
    | 'patterns'
    | 'line'
    | 'area'
    | 'bar'
    | 'scatter'
    | 'treemap'
    | 'sunburst'
  lokiRangeHistory: BuilderTimeRange[]
  tempoBuilder: TraceBuilderState
  tempoTimeRange: BuilderTimeRange
  tempoSampleSize: TraceSampleSize
  tempoResultView: TraceResultView
  running: boolean
  queryError: string | null
  /** Runtime-only provenance; deliberately excluded from workspace drafts. */
  repairableQueryError?: { query: string; error: string } | null
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
  explainSnapshot: {
    query: string
    mode: 'explain' | 'analyze'
    planningTimeMs?: number
    executionTimeMs?: number
  } | null
  explainText: string | null
  explainTree: ExplainNode | null
  showExplain: boolean
  activeExplainRequest: ExplainRequest
  seriesVisibility: Record<string, boolean>
}

export interface ConnectionMetadataState {
  schemas: DatabaseSchemaNode[]
  status: MetadataStatus
  error: string | null
  isStale: boolean
  revision?: number
  refreshing?: boolean
  refreshError?: string | null
}

const defaultSqlVisualization = (): VisualizationConfiguration => ({
  view: 'table',
  xColumn: null,
  valueColumn: null,
  aggregation: 'sum',
  seriesColumn: null,
  seriesColumns: [],
  hierarchyDimensions: [],
  valueAxisScale: 'linear',
})
const defaultBuilderVisualization = (): VisualizationConfiguration => ({
  view: 'line',
  xColumn: 'time_bucket',
  valueColumn: 'count',
  aggregation: 'sum',
  seriesColumn: null,
  seriesColumns: [],
  hierarchyDimensions: [],
  valueAxisScale: 'linear',
})

let sessionSequence = 0
function sessionId(): string {
  sessionSequence++
  return (
    globalThis.crypto?.randomUUID?.() ??
    `query-${Date.now()}-${sessionSequence}`
  )
}

export function createQuerySession(
  index = 1,
  options: Partial<
    Pick<
      QuerySession,
      'id' | 'title' | 'connectionProfileId' | 'queryMode' | 'sql'
    >
  > = {},
): QuerySession {
  return {
    id: options.id ?? sessionId(),
    title: options.title ?? `Query ${index}`,
    connectionProfileId: options.connectionProfileId ?? null,
    sql: options.sql ?? defaultQueryTextForDatasource(),
    manualQueryPristine: options.sql === undefined,
    prometheusTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' },
    prometheusStep: 'auto',
    promqlBuilder: {
      ...DEFAULT_PROMQL_BUILDER,
      filterBy: [],
      groupBy: [],
      labelValues: {},
    },
    lokiTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' },
    lokiBuilder: {
      ...DEFAULT_LOKI_BUILDER,
      labelMatchers: [],
      lineFilters: [],
      parsers: [],
      fieldFilters: [],
    },
    lokiResultLimit: 1000,
    lokiGroupBy: [],
    lokiResultView: 'list',
    lokiRangeHistory: [],
    tempoBuilder: defaultTempoBuilder(),
    tempoTimeRange: { ...DEFAULT_TRACE_RANGE },
    tempoSampleSize: DEFAULT_TRACE_SAMPLE_SIZE,
    tempoResultView: DEFAULT_TRACE_RESULT_VIEW,
    running: false,
    queryError: null,
    result: null,
    pendingResult: null,
    resultRevision: 0,
    lastSuccessfulResultRevision: 0,
    isResultStale: false,
    queryMode: options.queryMode ?? defaultQueryModeForDatasource(),
    builder: {
      table: null,
      timeColumn: null,
      timeBucket: 'day',
      seriesColumns: [],
      timeRange: SEVEN_DAYS,
    },
    builderHasRun: false,
    sqlVisualization: defaultSqlVisualization(),
    builderVisualization: defaultBuilderVisualization(),
    sqlResultFilters: [],
    builderResultFilters: [],
    queryFilterRevision: { sql: 0, builder: 0 },
    builderFilterNotice: null,
    explainText: null,
    explainTree: null,
    explainSnapshot: null,
    showExplain: false,
    activeExplainRequest: null,
    seriesVisibility: {},
  }
}

const EMPTY_METADATA: ConnectionMetadataState = {
  schemas: [],
  status: 'idle',
  error: null,
  isStale: false,
}
function emptyMetadata(): ConnectionMetadataState {
  return EMPTY_METADATA
}

export interface AppState {
  profiles: DataSourceProfile[]
  connectionStateByProfileId: Record<string, ProfileConnectionState>
  metadataByProfileId: Record<string, ConnectionMetadataState>

  tabs: QuerySession[]
  activeTabId: string

  setProfiles: (profiles: DataSourceProfile[]) => void
  setActive: (id: string | null) => void
  detachProfile: (id: string) => void
  applyConnectionEvent: (event: ConnectionStateEvent) => void
  applyConnectionFailure: (
    profileId: string,
    startingGeneration: number,
    error: string,
    missingGeneration?: number,
  ) => void
  connectProfile: (
    profile: DataSourceProfile,
    options?: { force?: boolean },
  ) => Promise<void>
  reconnectActiveProfile: (profileId: string) => Promise<void>
  setMetadata: (
    schemas: DatabaseSchemaNode[],
    status: MetadataStatus,
    error?: string | null,
    profileId?: string,
  ) => void
  setRelationColumns: (
    qualifiedName: string,
    columns: DatabaseColumnNode[] | undefined,
    status: 'loading' | 'loaded' | 'error',
    error?: string,
    profileId?: string,
  ) => void
  refreshMetadata: (profileId: string) => Promise<void>

  createTab: () => string
  activateTab: (id: string) => Promise<void>
  closeTab: (id: string) => void
  renameTab: (id: string, title: string) => void
  clearActiveResults: () => void
  resetActiveQuery: () => void
  commitLoadedPreset: (nextSession: QuerySession, tabId?: string) => void

  setSql: (sql: string, tabId?: string) => void
  setPrometheusQueryOptions: (
    patch: Partial<
      Pick<QuerySession, 'prometheusTimeRange' | 'prometheusStep'>
    >,
    tabId?: string,
  ) => void
  setPromqlBuilder: (patch: Partial<PromqlBuilderState>, tabId?: string) => void
  setLokiState: (
    patch: Partial<
      Pick<
        QuerySession,
        | 'lokiTimeRange'
        | 'lokiBuilder'
        | 'lokiResultLimit'
        | 'lokiGroupBy'
        | 'lokiResultView'
        | 'lokiRangeHistory'
      >
    >,
    tabId?: string,
  ) => void
  setTempoState: (
    patch: Partial<
      Pick<
        QuerySession,
        | 'tempoBuilder'
        | 'tempoTimeRange'
        | 'tempoSampleSize'
        | 'tempoResultView'
      >
    >,
    tabId?: string,
  ) => void
  setResult: (
    result: QueryResult | null,
    error?: string | null,
    tabId?: string,
  ) => void
  startQuery: (tabId?: string) => void
  completeQuery: (
    result: QueryResult | null,
    error?: string | null,
    tabId?: string,
    repairableQuery?: string,
  ) => void
  setRunning: (value: boolean, tabId?: string) => void
  setQueryMode: (mode: QueryMode, tabId?: string) => void
  setBuilder: (patch: Partial<BuilderQueryState>, tabId?: string) => void
  clearBuilderFilterNotice: (id: number, tabId?: string) => void
  selectBuilderRelation: (
    table: NonNullable<BuilderQueryState['table']>,
    tabId?: string,
  ) => void
  setBuilderHasRun: (value: boolean, tabId?: string) => void
  applyAiBuilderTarget: (
    expected: { profileId: string; state: AiBuilderState; guard: string },
    target: AiBuilderState,
    tabId: string,
  ) => boolean
  setVisualization: (
    mode: QueryMode,
    patch: Partial<VisualizationConfiguration>,
    tabId?: string,
  ) => void
  addResultFilter: (
    mode: QueryMode,
    filter: ResultFilter,
    tabId?: string,
  ) => void
  removeResultFilter: (mode: QueryMode, id: string, tabId?: string) => void
  clearResultFilters: (mode: QueryMode, tabId?: string) => void
  setResultFilterExecution: (
    mode: QueryMode,
    id: string,
    execution: 'client' | 'query',
    tabId?: string,
  ) => void
  setExplain: (
    text: string | null,
    tabId?: string,
    snapshot?: QuerySession['explainSnapshot'],
    tree?: ExplainNode,
  ) => void
  setShowExplain: (value: boolean, tabId?: string) => void
  setActiveExplainRequest: (request: ExplainRequest, tabId?: string) => void
  setSeriesVisibility: (
    visibility: Record<string, boolean>,
    tabId?: string,
  ) => void
}

export function selectActiveSession(
  state: Pick<AppState, 'tabs' | 'activeTabId'>,
): QuerySession {
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0]
}

export function selectSession(
  state: Pick<AppState, 'tabs'>,
  id: string,
): QuerySession | undefined {
  return state.tabs.find((tab) => tab.id === id)
}

export function selectProfileConnection(
  state: Pick<AppState, 'connectionStateByProfileId'>,
  profileId: string | null | undefined,
): ProfileConnectionState | undefined {
  return profileId ? state.connectionStateByProfileId[profileId] : undefined
}

/** Resolves the connection owned by a particular tab without consulting UI selection. */
export function selectTabConnection(
  state: Pick<AppState, 'tabs' | 'connectionStateByProfileId'>,
  tabId: string,
): ProfileConnectionState | undefined {
  const tab = selectSession(state, tabId)
  return selectProfileConnection(state, tab?.connectionProfileId)
}

export function selectActiveTabConnection(
  state: Pick<AppState, 'tabs' | 'activeTabId' | 'connectionStateByProfileId'>,
): ProfileConnectionState | undefined {
  return selectTabConnection(state, state.activeTabId)
}

function patchSession(
  state: AppState,
  id: string | undefined,
  update: (session: QuerySession) => QuerySession,
): Partial<AppState> {
  const target = id ?? state.activeTabId
  if (!state.tabs.some((tab) => tab.id === target)) return {}
  return {
    tabs: state.tabs.map((tab) => (tab.id === target ? update(tab) : tab)),
  }
}

function nextQueryTitle(tabs: QuerySession[]): string {
  const used = new Set(tabs.map((tab) => tab.title))
  let index = tabs.length + 1
  while (used.has(`Query ${index}`)) index++
  return `Query ${index}`
}

let connectionIntent = 0
const connectionIntents = new Map<string, number>()

const initialSession = createQuerySession(1)

export const useStore = create<AppState>((set, get) => ({
  profiles: [],
  connectionStateByProfileId: {},
  metadataByProfileId: {},

  tabs: [initialSession],
  activeTabId: initialSession.id,

  setProfiles: (profiles) => set({ profiles }),
  setActive: (id) =>
    set((state) => {
      const active = selectActiveSession(state)
      if (active.activeExplainRequest) return {}
      return patchSession(state, state.activeTabId, (session) => ({
        ...session,
        connectionProfileId: id,
      }))
    }),
  detachProfile: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.connectionProfileId === id
          ? { ...tab, connectionProfileId: null }
          : tab,
      ),
      connectionStateByProfileId: Object.fromEntries(
        Object.entries(state.connectionStateByProfileId).filter(
          ([profileId]) => profileId !== id,
        ),
      ),
    })),
  applyConnectionEvent: (event) =>
    set((state) => {
      const previousConnection =
        state.connectionStateByProfileId[event.profileId]
      if (!isCurrentProfileConnectionEvent(previousConnection, event)) return {}
      const metadata =
        state.metadataByProfileId[event.profileId] ?? emptyMetadata()
      const status: ConnectionStatus =
        event.state === 'failed'
          ? 'error'
          : event.state === 'disconnecting'
            ? 'disconnected'
            : event.state
      const nextConnection: ProfileConnectionState = {
        status,
        generation: event.generation,
        error:
          event.state === 'failed' && !event.expected ? event.message : null,
        serverVersion: previousConnection?.serverVersion ?? null,
      }
      const scoped = {
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          [event.profileId]: nextConnection,
        },
      }
      if (event.state !== 'failed' && event.state !== 'disconnected')
        return scoped
      return {
        ...scoped,
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [event.profileId]: {
            ...metadata,
            isStale: true,
            refreshing: false,
          },
        },
        tabs: state.tabs.map((tab) =>
          tab.connectionProfileId === event.profileId
            ? {
                ...tab,
                running: false,
                pendingResult: null,
                isResultStale: Boolean(tab.result),
              }
            : tab,
        ),
      }
    }),
  // Entry points retain their existing fallback if scoped state disappears mid-attempt.
  applyConnectionFailure: (
    profileId,
    startingGeneration,
    error,
    missingGeneration = 0,
  ) =>
    set((state) => {
      const current = state.connectionStateByProfileId[profileId]
      if (
        (current?.generation ?? 0) > startingGeneration ||
        current?.status === 'connected'
      )
        return {}
      return {
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          [profileId]: {
            status: 'error',
            generation: current?.generation ?? missingGeneration,
            error,
            serverVersion: null,
          },
        },
      }
    }),
  connectProfile: async (profile, options) => {
    const intent = ++connectionIntent
    connectionIntents.set(profile.id, intent)
    const startingGeneration =
      get().connectionStateByProfileId[profile.id]?.generation ?? 0
    set((state) => ({
      ...(!options?.force
        ? {
            ...patchSession(state, state.activeTabId, (session) => ({
              ...session,
              connectionProfileId: profile.id,
            })),
          }
        : {}),
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        [profile.id]: {
          status: options?.force ? 'reconnecting' : 'connecting',
          generation:
            state.connectionStateByProfileId[profile.id]?.generation ?? 0,
          error: null,
          serverVersion: null,
        },
      },
    }))
    try {
      const result = await (options?.force
        ? api.connections.reconnect(profile)
        : api.connections.connect(profile))
      // SessionManager owns session replacement/cleanup; a stale response may
      // reference the same live generation reused by the newer renderer attempt.
      if (connectionIntents.get(profile.id) !== intent) return
      const actualId = result.id ?? profile.id
      if (!result.ok) {
        get().applyConnectionFailure(
          profile.id,
          startingGeneration,
          result.error,
        )
        return
      }
      const currentConnection = get().connectionStateByProfileId[actualId]
      if (currentConnection && currentConnection.generation > result.generation)
        return
      set((state) => ({
        ...(actualId !== profile.id
          ? {
              tabs: state.tabs.map((tab) =>
                tab.connectionProfileId === profile.id
                  ? { ...tab, connectionProfileId: actualId }
                  : tab,
              ),
            }
          : {}),
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          [actualId]: {
            status: 'connected',
            generation: result.generation,
            error: null,
            serverVersion: result.serverVersion ?? null,
          },
        },
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [actualId]: {
            ...(state.metadataByProfileId[actualId] ?? emptyMetadata()),
            status: 'loading',
            error: null,
            refreshing: false,
            refreshError: null,
          },
        },
      }))
      if (actualId !== profile.id)
        set({ profiles: await api.connections.list() })
      try {
        const schemas = await loadConnectionMetadata(actualId)
        if (connectionIntents.get(profile.id) !== intent) return
        const latest = get().connectionStateByProfileId[actualId]
        if (!isUsableProfileConnection(latest, result.generation)) return
        get().setMetadata(schemas, 'loaded', null, actualId)
      } catch (error) {
        if (connectionIntents.get(profile.id) !== intent) return
        const latest = get().connectionStateByProfileId[actualId]
        if (!isUsableProfileConnection(latest, result.generation)) return
        get().setMetadata(
          [],
          'error',
          error instanceof Error ? error.message : String(error),
          actualId,
        )
      }
    } catch (error) {
      if (connectionIntents.get(profile.id) !== intent) return
      const message = error instanceof Error ? error.message : String(error)
      get().applyConnectionFailure(profile.id, startingGeneration, message)
    }
  },
  reconnectActiveProfile: async (profileId: string) => {
    const state = get()
    const profile = state.profiles.find(
      (candidate) => candidate.id === profileId,
    )
    const connection = profile
      ? state.connectionStateByProfileId[profile.id]
      : undefined
    if (
      !profile ||
      connection?.status === 'connecting' ||
      connection?.status === 'reconnecting'
    )
      return
    set((current) => ({
      connectionStateByProfileId: {
        ...current.connectionStateByProfileId,
        [profile.id]: {
          status: 'reconnecting',
          generation: connection?.generation ?? 0,
          error: null,
          serverVersion: connection?.serverVersion ?? null,
        },
      },
    }))
    await get().connectProfile(profile, { force: true })
  },
  setMetadata: (schemas, status, error, profileId) =>
    set((state) => {
      const id = profileId
      if (!id) return {}
      const previous = state.metadataByProfileId[id] ?? emptyMetadata()
      return {
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [id]: {
            schemas,
            status,
            error: error ?? null,
            isStale: status === 'loaded' ? false : previous.isStale,
          },
        },
      }
    }),
  setRelationColumns: (qualifiedName, columns, status, error, profileId) =>
    set((state) => {
      const id = profileId
      if (!id) return {}
      const metadata = state.metadataByProfileId[id] ?? emptyMetadata()
      return {
        metadataByProfileId: {
          ...state.metadataByProfileId,
          [id]: {
            ...metadata,
            schemas: metadata.schemas.map((schema) => ({
              ...schema,
              relations: schema.relations.map((relation) =>
                relation.qualifiedName === qualifiedName
                  ? {
                      ...relation,
                      columns,
                      columnsStatus: status,
                      columnsError: error,
                    }
                  : relation,
              ),
            })),
          },
        },
      }
    }),
  refreshMetadata: (profileId) =>
    refreshConnectionMetadata(profileId, { getState: get, setState: set }),

  createTab: () => {
    const state = get()
    const active = selectActiveSession(state)
    const tab = createQuerySession(state.tabs.length + 1, {
      title: nextQueryTitle(state.tabs),
      connectionProfileId: active.connectionProfileId,
    })
    set({ tabs: [...state.tabs, tab], activeTabId: tab.id })
    return tab.id
  },
  activateTab: async (id) => {
    const before = get()
    const target = selectSession(before, id)
    if (!target) return
    const targetProfile = target.connectionProfileId
    const live = targetProfile
      ? before.connectionStateByProfileId[targetProfile]
      : undefined
    const sameProfile = live?.status === 'connected' || live?.status === 'idle'
    set({ activeTabId: id })
    if (sameProfile) return
    if (
      !targetProfile ||
      !live ||
      live.status === 'connecting' ||
      live.status === 'reconnecting'
    )
      return
    const profile = get().profiles.find(
      (candidate) => candidate.id === targetProfile,
    )
    if (!profile) return
    await get().connectProfile(profile)
  },
  closeTab: (id) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === id)
      if (index < 0) return {}
      if (state.tabs.length === 1) {
        const fresh = createQuerySession(1, {
          connectionProfileId: state.tabs[0].connectionProfileId,
        })
        return { tabs: [fresh], activeTabId: fresh.id }
      }
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      if (state.activeTabId !== id) return { tabs }
      const next = tabs[Math.min(index, tabs.length - 1)]
      return { tabs, activeTabId: next.id }
    }),
  renameTab: (id, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, title: title.trim() || tab.title } : tab,
      ),
    })),
  clearActiveResults: () =>
    set((state) =>
      patchSession(state, undefined, (session) => ({
        ...session,
        running: false,
        queryError: null,
        repairableQueryError: null,
        result: null,
        pendingResult: null,
        resultRevision: 0,
        lastSuccessfulResultRevision: 0,
        isResultStale: false,
        sqlResultFilters: session.sqlResultFilters.filter(
          (filter) => filter.execution === 'query',
        ),
        builderResultFilters: session.builderResultFilters.filter(
          (filter) => filter.execution === 'query',
        ),
        explainText: null,
        explainTree: null,
        explainSnapshot: null,
        showExplain: false,
        activeExplainRequest: null,
        seriesVisibility: {},
      })),
    ),
  resetActiveQuery: () =>
    set((state) =>
      patchSession(state, undefined, (session) => {
        const fresh = createQuerySession(1, {
          id: session.id,
          title: session.title,
          connectionProfileId: session.connectionProfileId,
          queryMode: session.queryMode,
          sql: '',
        })
        return {
          ...fresh,
          builder: {
            ...fresh.builder,
            timeRange: session.builder.timeRange ?? fresh.builder.timeRange,
          },
          prometheusTimeRange: session.prometheusTimeRange,
          prometheusStep: session.prometheusStep,
          lokiTimeRange: session.lokiTimeRange,
          lokiResultLimit: session.lokiResultLimit,
          tempoTimeRange: session.tempoTimeRange,
          tempoSampleSize: session.tempoSampleSize,
        }
      }),
    ),
  commitLoadedPreset: (nextSession, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const profile = state.profiles.find(
          (candidate) => candidate.id === session.connectionProfileId,
        )
        const preservesBuilderQueryFilters =
          profile && queryLanguageForSourceKind(profile.kind).kind === 'sql'
        return {
          ...nextSession,
          // A preset changes the contents of the current tab, never the tab itself.
          id: session.id,
          title: session.title,
          connectionProfileId: session.connectionProfileId,
          manualQueryPristine: false,
          running: false,
          queryError: null,
          repairableQueryError: null,
          result: null,
          pendingResult: null,
          resultRevision: 0,
          lastSuccessfulResultRevision: 0,
          isResultStale: false,
          builderHasRun: false,
          sqlResultFilters: [],
          builderResultFilters: preservesBuilderQueryFilters
            ? nextSession.builderResultFilters.filter(
                (filter) => filter.execution === 'query',
              )
            : [],
          queryFilterRevision: { sql: 0, builder: 0 },
          builderFilterNotice: null,
          explainText: null,
          explainTree: null,
          explainSnapshot: null,
          showExplain: false,
          activeExplainRequest: null,
          seriesVisibility: {},
          lokiRangeHistory: [],
        }
      }),
    ),

  setSql: (sql, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) =>
        session.activeExplainRequest
          ? session
          : {
              ...session,
              sql,
              repairableQueryError: null,
              manualQueryPristine: false,
              sqlResultFilters: session.sqlResultFilters.map((filter) =>
                filter.execution === 'query'
                  ? { ...filter, execution: 'client' as const }
                  : filter,
              ),
            },
      ),
    ),
  setPrometheusQueryOptions: (patch, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({ ...session, ...patch })),
    ),
  setLokiState: (patch, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({ ...session, ...patch })),
    ),
  setTempoState: (patch, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({ ...session, ...patch })),
    ),
  setPromqlBuilder: (patch, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({
        ...session,
        promqlBuilder: { ...session.promqlBuilder, ...patch },
      })),
    ),
  setResult: (result, error, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) =>
        result
          ? {
              ...session,
              ...deliverQueryResultState(session, result),
              repairableQueryError: null,
            }
          : {
              ...session,
              queryError: error ?? null,
              repairableQueryError: null,
            },
      ),
    ),
  startQuery: (tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({
        ...session,
        ...startQueryState(session),
        repairableQueryError: null,
      })),
    ),
  completeQuery: (result, error, tabId, repairableQuery) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const next = completeQueryState(session, result, error ?? null)
        return result
          ? {
              ...session,
              ...next,
              repairableQueryError: null,
              isResultStale: false,
              lastSuccessfulResultRevision: session.resultRevision + 1,
            }
          : {
              ...session,
              ...next,
              repairableQueryError:
                error && repairableQuery
                  ? {
                      query: repairableQuery,
                      error: sanitizeAiErrorContext(error),
                    }
                  : null,
            }
      }),
    ),
  setRunning: (value, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) =>
        value
          ? { ...session, running: true }
          : { ...session, ...stopQueryState(session) },
      ),
    ),
  setQueryMode: (queryMode, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) =>
        session.activeExplainRequest ? session : { ...session, queryMode },
      ),
    ),
  setBuilder: (patch, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        if (session.activeExplainRequest) return session
        const transition = transitionBuilderState(session, patch)
        const message = clearedBuilderFiltersMessage(
          transition.removedDescriptions,
        )
        return {
          ...session,
          builder: transition.builder,
          builderResultFilters: transition.builderResultFilters,
          queryFilterRevision:
            transition.queryFilterRevision ?? session.queryFilterRevision,
          ...(message
            ? {
                builderFilterNotice: {
                  id: (session.builderFilterNotice?.id ?? 0) + 1,
                  message,
                },
              }
            : {}),
        }
      }),
    ),
  clearBuilderFilterNotice: (id, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) =>
        session.builderFilterNotice?.id === id
          ? { ...session, builderFilterNotice: null }
          : session,
      ),
    ),
  selectBuilderRelation: (table, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        if (session.activeExplainRequest) return session
        const selected = selectBuilderRelationState(session, table)
        const transition = transitionBuilderState(session, {
          table,
          timeColumn: null,
          seriesColumns: [],
        })
        const message = clearedBuilderFiltersMessage(
          transition.removedDescriptions,
        )
        return {
          ...selected,
          builder: transition.builder,
          builderResultFilters: transition.builderResultFilters,
          queryFilterRevision:
            transition.queryFilterRevision ?? session.queryFilterRevision,
          ...(message
            ? {
                builderFilterNotice: {
                  id: (session.builderFilterNotice?.id ?? 0) + 1,
                  message,
                },
              }
            : {}),
        }
      }),
    ),
  setBuilderHasRun: (builderHasRun, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({ ...session, builderHasRun })),
    ),
  applyAiBuilderTarget: (expected, target, tabId) => {
    let applied = false
    set((state) =>
      patchSession(state, tabId, (session) => {
        if (
          session.queryMode !== 'builder' ||
          session.connectionProfileId !== expected.profileId ||
          expected.guard !== aiBuilderMutationFingerprint(session) ||
          !aiBuilderStatesEqual(
            normalizedAiBuilderState(session),
            expected.state,
          )
        )
          return session
        const transition = transitionBuilderConfiguration(session, target)
        const notice = transitionNotice(transition)
        applied = true
        return {
          ...session,
          builder: transition.builder,
          builderVisualization: transition.builderVisualization,
          builderResultFilters: transition.builderResultFilters,
          queryFilterRevision: transition.queryFilterRevision,
          builderHasRun: false,
          isResultStale:
            session.isResultStale ||
            Boolean(session.result) ||
            Boolean(session.pendingResult),
          ...(notice
            ? {
                builderFilterNotice: {
                  id: (session.builderFilterNotice?.id ?? 0) + 1,
                  message: notice,
                },
              }
            : {}),
        }
      }),
    )
    return applied
  },
  setVisualization: (mode, patch, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const key = mode === 'sql' ? 'sqlVisualization' : 'builderVisualization'
        return { ...session, [key]: { ...session[key], ...patch } }
      }),
    ),
  addResultFilter: (mode, filter, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
        return {
          ...session,
          [key]: deduplicateResultFilters([...session[key], filter]),
        }
      }),
    ),
  removeResultFilter: (mode, id, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
        const removed = session[key].find((filter) => filter.id === id)
        return {
          ...session,
          [key]: session[key].filter((filter) => filter.id !== id),
          queryFilterRevision:
            removed?.execution === 'query'
              ? {
                  ...session.queryFilterRevision,
                  [mode]: session.queryFilterRevision[mode] + 1,
                }
              : session.queryFilterRevision,
        }
      }),
    ),
  clearResultFilters: (mode, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
        const revision = session[key].some(
          (filter) => filter.execution === 'query',
        )
          ? {
              ...session.queryFilterRevision,
              [mode]: session.queryFilterRevision[mode] + 1,
            }
          : session.queryFilterRevision
        return { ...session, [key]: [], queryFilterRevision: revision }
      }),
    ),
  setResultFilterExecution: (mode, id, execution, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => {
        const key = mode === 'sql' ? 'sqlResultFilters' : 'builderResultFilters'
        const target = session[key].find((filter) => filter.id === id)
        const resultAlias = target?.column as 'series' | 'time_bucket'
        const provenance =
          mode === 'builder' &&
          session.builder.table &&
          (resultAlias === 'series' || resultAlias === 'time_bucket')
            ? {
                mode: 'builder' as const,
                resultAlias,
                table: session.builder.table,
                sourceColumns:
                  resultAlias === 'series'
                    ? [...session.builder.seriesColumns]
                    : [],
                timeColumn: session.builder.timeColumn,
                timeBucket: session.builder.timeBucket,
                sourceKind:
                  resultAlias === 'time_bucket'
                    ? ('time-bucket' as const)
                    : session.builder.seriesColumns.length === 1
                      ? ('single-column' as const)
                      : ('series-tuple' as const),
                targetKind:
                  resultAlias === 'time_bucket'
                    ? ('time-bucket' as const)
                    : session.builder.seriesColumns.length === 1
                      ? ('source-column' as const)
                      : ('series-tuple' as const),
                ...(resultAlias === 'series' &&
                session.builder.seriesColumns.length === 1
                  ? { sourceColumn: session.builder.seriesColumns[0] }
                  : {}),
                displayLabel:
                  resultAlias === 'series' &&
                  session.builder.seriesColumns.length === 1
                    ? session.builder.seriesColumns[0]
                    : resultAlias === 'series'
                      ? session.builder.seriesColumns.join(' + ')
                      : `${session.builder.timeBucket} ${session.builder.timeColumn ?? 'time'}`,
                ...(resultAlias === 'time_bucket' &&
                target &&
                (target.operator === 'range' || target.operator === 'notRange')
                  ? { rangeKind: 'bucket-boundaries' as const }
                  : {}),
              }
            : undefined
        const columns =
          session.result?.columns.map((column) => column.name) ?? []
        const filters = deduplicateResultFilters(
          session[key].map((filter) => {
            if (filter.id !== id) return filter
            const semanticProvenance =
              mode === 'builder' ? (filter.provenance ?? provenance) : undefined
            if (execution === 'client') {
              const demotion = resultFilterDemotion(filter, columns)
              if (!demotion.allowed) return filter
              const demoted = {
                ...filter,
                execution,
                provenance: semanticProvenance
                  ? {
                      ...semanticProvenance,
                      clientResultColumn: demotion.column,
                    }
                  : undefined,
              }
              return { ...demoted, id: stableResultFilterId(demoted) }
            }
            const promoted = {
              ...filter,
              execution,
              provenance: semanticProvenance,
            }
            return { ...promoted, id: stableResultFilterId(promoted) }
          }),
        )
        return {
          ...session,
          [key]: filters,
          queryFilterRevision: {
            ...session.queryFilterRevision,
            [mode]: session.queryFilterRevision[mode] + 1,
          },
        }
      }),
    ),
  setExplain: (explainText, tabId, snapshot, explainTree) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({
        ...session,
        explainText,
        explainTree: explainTree ?? null,
        explainSnapshot: snapshot ?? null,
      })),
    ),
  setShowExplain: (showExplain, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({ ...session, showExplain })),
    ),
  setActiveExplainRequest: (activeExplainRequest, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({
        ...session,
        activeExplainRequest,
      })),
    ),
  setSeriesVisibility: (seriesVisibility, tabId) =>
    set((state) =>
      patchSession(state, tabId, (session) => ({
        ...session,
        seriesVisibility,
      })),
    ),
}))
