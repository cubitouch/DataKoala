import { compatibleTimeBucket, SEVEN_DAYS, type BuilderTimeRange } from './builderTimeRange.ts'
import type { TimeWindow } from './customTimeRange.ts'
import type { Aggregation, ResultView, ValueAxisScale, VisualizationConfiguration } from './resultVisualization.ts'
import { deserializeResultFilters, type ResultFilter } from './resultFilters.ts'
import type { AppState, BuilderQueryState, QueryMode, QuerySession, TimeBucket } from '../store/useStore.ts'
import { DEFAULT_PROMQL_BUILDER, type PromqlBuilderState } from './promqlBuilder.ts'
import { DEFAULT_LOKI_BUILDER, type LokiBuilderState } from '@shared/loki'

export const WORKSPACE_STORAGE_KEY = 'datakoala.workspace.v2'
const LEGACY_DATAKOALA_WORKSPACE_STORAGE_KEY = 'datakoala.workspace.v2'
export const LEGACY_WORKSPACE_STORAGE_KEY = 'datakoala.workspace.v1'
const WORKSPACE_VERSION = 2
const SAVE_DELAY_MS = 150

const QUERY_MODES: QueryMode[] = ['sql', 'builder']
const TIME_BUCKETS: TimeBucket[] = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']
const RESULT_VIEWS: ResultView[] = ['table', 'bar', 'line', 'area', 'scatter', 'treemap', 'sunburst']
const AGGREGATIONS: Aggregation[] = ['sum', 'average', 'minimum', 'maximum', 'count']
const VALUE_AXIS_SCALES: ValueAxisScale[] = ['linear', 'log']

export interface QuerySessionDraft {
  id: string
  title: string
  connectionProfileId: string | null
  queryMode: QueryMode
  sql: string
  prometheusTimeRange: BuilderTimeRange
  prometheusStep: QuerySession['prometheusStep']
  promqlBuilder: PromqlBuilderState
  lokiTimeRange: BuilderTimeRange
  lokiBuilder: LokiBuilderState
  lokiResultLimit: number
  lokiDisplayDirection: 'backward' | 'forward'
  lokiBreakdown: string | null
  lokiRangeHistory: BuilderTimeRange[]
  builder: BuilderQueryState
  sqlVisualization: VisualizationConfiguration
  builderVisualization: VisualizationConfiguration
  builderQueryFilters: ResultFilter[]
}

export interface WorkspaceDraft {
  activeTabId: string
  tabs: QuerySessionDraft[]
}

export type WorkspacePersistableState = Pick<AppState, 'activeTabId' | 'tabs'>
export interface WorkspaceRestorePatch {
  tabs: QuerySession[]
  activeTabId: string
  activeProfileId: string | null
}

export interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface WorkspaceEventTarget {
  addEventListener(type: 'beforeunload' | 'pagehide', listener: () => void): void
  removeEventListener(type: 'beforeunload' | 'pagehide', listener: () => void): void
}

interface WorkspaceEnvelope {
  version: typeof WORKSPACE_VERSION
  activeTabId: string
  tabs: unknown[]
}

interface StartWorkspacePersistenceOptions {
  storage?: WorkspaceStorage | null
  target?: WorkspaceEventTarget | null
  delayMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T => typeof value === 'string' && allowed.includes(value as T)
const stringOrNull = (value: unknown): string | null | undefined => value === null ? null : typeof value === 'string' ? value : undefined

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
  return [...new Set(value as string[])]
}

function timeWindow(value: unknown): TimeWindow | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.from !== 'string' || typeof value.to !== 'string') return null
  return { id: value.id, from: value.from, to: value.to }
}

function timeRange(value: unknown): BuilderTimeRange | null {
  if (!isRecord(value)) return null
  if (value.kind === 'all') return { kind: 'all' }
  if (value.kind === 'rolling') {
    if (value.unit === 'hour' && typeof value.amount === 'number' && [1, 6, 12, 24].includes(value.amount)) return { kind: 'rolling', amount: value.amount as 1 | 6 | 12 | 24, unit: 'hour' }
    if (value.unit === 'day' && typeof value.amount === 'number' && [7, 30].includes(value.amount)) return { kind: 'rolling', amount: value.amount as 7 | 30, unit: 'day' }
    if (value.unit === 'month' && typeof value.amount === 'number' && [3, 6, 12].includes(value.amount)) return { kind: 'rolling', amount: value.amount as 3 | 6 | 12, unit: 'month' }
    return null
  }
  if (value.kind !== 'custom') return null
  const startDate = stringOrNull(value.startDate)
  const endDate = stringOrNull(value.endDate)
  if (startDate === undefined || endDate === undefined || typeof value.startTime !== 'string' || typeof value.endTime !== 'string') return null
  const windows = value.recurringWindows === undefined ? [] : Array.isArray(value.recurringWindows) ? value.recurringWindows.map(timeWindow) : null
  if (windows === null || windows.some((window) => window === null)) return null
  return { kind: 'custom', startDate, startTime: value.startTime, endDate, endTime: value.endTime, recurringWindows: windows as TimeWindow[] }
}

function table(value: unknown): BuilderQueryState['table'] | undefined {
  if (value === null) return null
  if (!isRecord(value) || typeof value.schema !== 'string' || typeof value.name !== 'string') return undefined
  return { schema: value.schema, name: value.name }
}

function parsePromqlBuilder(value: unknown): PromqlBuilderState {
  if (!isRecord(value)) return { ...DEFAULT_PROMQL_BUILDER, filterBy: [], groupBy: [], labelValues: {} }
  const calculations = ['raw', 'rate', 'increase', 'observation-rate', 'histogram-average', 'histogram-sum', 'percentile'] as const
  const aggregations = ['none', 'sum', 'avg', 'min', 'max'] as const
  const windows = ['1m', '5m', '10m', '15m', '30m', '1h'] as const
  const quantiles = [0.5, 0.75, 0.9, 0.95, 0.99, 0.999] as const
  const filters = Array.isArray(value.filters) ? value.filters.flatMap((filter) => {
    if (!isRecord(filter) || typeof filter.label !== 'string' || !filter.label) return []
    if (Array.isArray(filter.values) && filter.values.every((item) => typeof item === 'string')) return [{ label: filter.label, values: [...new Set(filter.values as string[])] }]
    // Defensive migration from the unreleased row-matcher shape. Only inclusive
    // equality can be represented faithfully by the new Builder.
    if (filter.operator === '=' && typeof filter.value === 'string' && filter.value) return [{ label: filter.label, values: [filter.value] }]
    return []
  }) : []
  const restoredFilterBy = stringArray(value.filterBy) ?? filters.map((filter) => filter.label)
  const restoredLabelValues = isRecord(value.labelValues)
    ? Object.fromEntries(Object.entries(value.labelValues).flatMap(([label, values]) => Array.isArray(values) && values.every((item) => typeof item === 'string') ? [[label, [...new Set(values as string[])]]] : []))
    : Object.fromEntries(filters.map((filter) => [filter.label, filter.values]))
  const legacyAggregation = isOneOf(value.calculation, ['sum', 'avg', 'min', 'max'] as const) ? value.calculation : undefined
  const calculation = isOneOf(value.calculation, calculations) ? value.calculation : 'raw'
  const histogramCalculation = calculation === 'percentile' || calculation === 'observation-rate' || calculation === 'histogram-average' || calculation === 'histogram-sum'
  const aggregation = histogramCalculation ? 'sum' : isOneOf(value.aggregation, aggregations) ? value.aggregation : legacyAggregation ?? ((calculation === 'rate' || calculation === 'increase') && (stringArray(value.groupBy)?.length ?? 0) > 0 ? 'sum' : 'none')
  return {
    metric: typeof value.metric === 'string' ? value.metric : '', filterBy: restoredFilterBy, labelValues: restoredLabelValues,
    groupBy: stringArray(value.groupBy) ?? [],
    calculation,
    aggregation,
    window: isOneOf(value.window, windows) ? value.window : '5m',
    percentile: typeof value.percentile === 'number' && quantiles.includes(value.percentile as typeof quantiles[number]) ? value.percentile as typeof quantiles[number] : 0.95
  }
}

/**
 * Read old time-first v2 drafts, early axis-first #46 drafts, and the current
 * axis-first shape. Missing xColumn/timeColumn keys are legacy-compatible; malformed
 * non-string values still fail closed.
 */
function builderDraft(value: unknown, legacyMissingRange?: BuilderTimeRange): BuilderQueryState | null {
  if (!isRecord(value)) return null
  const restoredTable = table(value.table)
  const explicitTimeColumn = value.timeColumn === undefined ? null : stringOrNull(value.timeColumn)
  const persistedX = value.xColumn === undefined ? null : stringOrNull(value.xColumn)
  const restoredSeries = stringArray(value.seriesColumns)
  const restoredRange = value.timeRange === undefined ? legacyMissingRange : timeRange(value.timeRange)
  const restoredBucket = value.timeBucket === undefined ? 'day' : isOneOf(value.timeBucket, TIME_BUCKETS) ? value.timeBucket : null
  if (restoredTable === undefined || explicitTimeColumn === undefined || persistedX === undefined || !restoredSeries || restoredBucket === null || (value.timeRange !== undefined && restoredRange === null)) return null
  if (!restoredTable) return { table: null, timeColumn: null, timeBucket: 'day', seriesColumns: [], timeRange: undefined }

  // Early axis-first drafts stored xColumn + range but omitted timeColumn. Infer that
  // temporal source. Pre-#46 v2 drafts already stored timeColumn directly.
  const inferredLegacyAxisTime = explicitTimeColumn === null && persistedX && restoredRange ? persistedX : null
  const resolvedTimeColumn = explicitTimeColumn ?? inferredLegacyAxisTime
  const range = resolvedTimeColumn ? restoredRange : undefined
  return {
    table: restoredTable,
    timeColumn: resolvedTimeColumn,
    timeBucket: range ? compatibleTimeBucket(restoredBucket, range) : 'day',
    seriesColumns: restoredSeries,
    timeRange: range ?? undefined
  }
}

function visualization(value: unknown): VisualizationConfiguration | null {
  if (!isRecord(value) || !isOneOf(value.view, RESULT_VIEWS) || !isOneOf(value.aggregation, AGGREGATIONS)) return null
  const xColumn = stringOrNull(value.xColumn)
  const valueColumn = stringOrNull(value.valueColumn)
  const seriesColumn = stringOrNull(value.seriesColumn)
  const seriesColumns = value.seriesColumns === undefined ? [] : stringArray(value.seriesColumns)
  const hierarchyDimensions = value.hierarchyDimensions === undefined ? [] : stringArray(value.hierarchyDimensions)
  const valueAxisScale = value.valueAxisScale === undefined ? 'linear' : isOneOf(value.valueAxisScale, VALUE_AXIS_SCALES) ? value.valueAxisScale : null
  const anomalyDetectionEnabled = value.anomalyDetectionEnabled === undefined ? false : typeof value.anomalyDetectionEnabled === 'boolean' ? value.anomalyDetectionEnabled : null
  if (xColumn === undefined || valueColumn === undefined || seriesColumn === undefined || !seriesColumns || !hierarchyDimensions || !valueAxisScale || anomalyDetectionEnabled === null) return null
  return { view: value.view, xColumn, valueColumn, aggregation: value.aggregation, seriesColumn, seriesColumns, hierarchyDimensions, valueAxisScale, anomalyDetectionEnabled }
}

function cloneTimeRange(value: BuilderTimeRange | undefined): BuilderTimeRange | undefined {
  if (!value) return undefined
  if (value.kind !== 'custom') return { ...value }
  return { ...value, recurringWindows: (value.recurringWindows ?? []).map((window) => ({ ...window })) }
}
function cloneVisualization(value: VisualizationConfiguration): VisualizationConfiguration {
  return { ...value, seriesColumns: [...(value.seriesColumns ?? [])], hierarchyDimensions: [...(value.hierarchyDimensions ?? [])] }
}
function builderQueryFilters(filters: ResultFilter[]): ResultFilter[] {
  return filters.filter((filter) => filter.execution === 'query').map((filter) => ({
    ...filter,
    provenance: filter.provenance ? {
      ...filter.provenance,
      table: { ...filter.provenance.table },
      sourceColumns: [...filter.provenance.sourceColumns]
    } : undefined
  }))
}

function normalizeBuilderAxis(builder: BuilderQueryState, visualizationState: VisualizationConfiguration): { builder: BuilderQueryState; visualization: VisualizationConfiguration } {
  const legacyTimeAlias = visualizationState.xColumn === 'time_bucket'
  const sourceX = legacyTimeAlias ? builder.timeColumn : visualizationState.xColumn
  const legacyCountAlias = visualizationState.valueColumn === 'count' && visualizationState.aggregation === 'sum'
  const valueColumn = legacyCountAlias ? null : visualizationState.valueColumn
  const aggregation: Aggregation = legacyCountAlias ? 'count' : visualizationState.aggregation
  const timeColumn = builder.table ? builder.timeColumn : null
  const range = timeColumn ? cloneTimeRange(builder.timeRange ?? SEVEN_DAYS) : undefined
  const temporalX = Boolean(sourceX && timeColumn && sourceX === timeColumn)
  const seriesColumns = builder.seriesColumns.filter((column) => column !== sourceX && column !== valueColumn)
  return {
    builder: {
      table: builder.table ? { ...builder.table } : null,
      timeColumn,
      timeBucket: temporalX && range ? compatibleTimeBucket(builder.timeBucket, range) : 'day',
      seriesColumns,
      timeRange: range
    },
    visualization: {
      ...cloneVisualization(visualizationState),
      xColumn: builder.table ? sourceX : null,
      valueColumn: aggregation === 'count' ? null : valueColumn,
      aggregation,
      seriesColumn: null,
      seriesColumns
    }
  }
}

function sessionDraft(session: QuerySession): QuerySessionDraft {
  const normalized = normalizeBuilderAxis(session.builder, session.builderVisualization)
  return {
    id: session.id,
    title: session.title,
    connectionProfileId: session.connectionProfileId,
    queryMode: session.queryMode,
    sql: session.sql,
    prometheusTimeRange: session.prometheusTimeRange,
    prometheusStep: session.prometheusStep,
    promqlBuilder: session.promqlBuilder,
    lokiTimeRange: session.lokiTimeRange,
    lokiBuilder: session.lokiBuilder,
    lokiResultLimit: session.lokiResultLimit,
    lokiDisplayDirection: session.lokiDisplayDirection,
    lokiBreakdown: session.lokiBreakdown,
    lokiRangeHistory: session.lokiRangeHistory,
    builder: normalized.builder,
    sqlVisualization: cloneVisualization(session.sqlVisualization),
    builderVisualization: normalized.visualization,
    builderQueryFilters: builderQueryFilters(session.builderResultFilters)
  }
}

export function workspaceDraftFromState(state: WorkspacePersistableState): WorkspaceDraft {
  const tabs = state.tabs.map(sessionDraft)
  const activeTabId = tabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : tabs[0]?.id ?? ''
  return { activeTabId, tabs }
}

/**
 * Persist X independently from the dataset's Time range source. Time range remains
 * available for categorical/numeric X axes, while Time bucket is only serialized
 * when X is the temporal source itself.
 */
function serializedSession(tab: QuerySessionDraft): Record<string, unknown> {
  const xColumn = tab.builderVisualization.xColumn
  const temporalX = Boolean(xColumn && tab.builder.timeColumn && xColumn === tab.builder.timeColumn)
  const persistedBuilder: Record<string, unknown> = {
    table: tab.builder.table,
    xColumn,
    timeColumn: tab.builder.timeColumn,
    seriesColumns: tab.builder.seriesColumns
  }
  if (tab.builder.timeColumn && tab.builder.timeRange) persistedBuilder.timeRange = tab.builder.timeRange
  if (temporalX) persistedBuilder.timeBucket = tab.builder.timeBucket
  return {
    id: tab.id,
    title: tab.title,
    connectionProfileId: tab.connectionProfileId,
    queryMode: tab.queryMode,
    sql: tab.sql,
    prometheusTimeRange: tab.prometheusTimeRange,
    prometheusStep: tab.prometheusStep,
    promqlBuilder: tab.promqlBuilder,
    lokiTimeRange: tab.lokiTimeRange,
    lokiBuilder: tab.lokiBuilder,
    lokiResultLimit: tab.lokiResultLimit,
    lokiDisplayDirection: tab.lokiDisplayDirection,
    lokiBreakdown: tab.lokiBreakdown,
    lokiRangeHistory: tab.lokiRangeHistory,
    builder: persistedBuilder,
    sqlVisualization: tab.sqlVisualization,
    builderVisualization: tab.builderVisualization,
    builderQueryFilters: tab.builderQueryFilters
  }
}

export function serializeWorkspaceDraft(state: WorkspacePersistableState): string {
  const draft = workspaceDraftFromState(state)
  const envelope: WorkspaceEnvelope = { version: WORKSPACE_VERSION, activeTabId: draft.activeTabId, tabs: draft.tabs.map(serializedSession) }
  return JSON.stringify(envelope)
}

function parsedQueryFilters(value: unknown): ResultFilter[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  try {
    return deserializeResultFilters(JSON.stringify(value)).filter((filter) => filter.execution === 'query')
  } catch {
    return null
  }
}

function parseSession(value: unknown): QuerySessionDraft | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.title !== 'string' || !value.title.trim()) return null
  const connectionProfileId = stringOrNull(value.connectionProfileId)
  const parsedBuilder = builderDraft(value.builder)
  const sqlVisualization = visualization(value.sqlVisualization)
  const parsedBuilderVisualization = visualization(value.builderVisualization)
  const filters = parsedQueryFilters(value.builderQueryFilters)
  const prometheusTimeRange = value.prometheusTimeRange === undefined ? { kind: 'rolling', amount: 1, unit: 'hour' } as const : timeRange(value.prometheusTimeRange)
  const prometheusStep = value.prometheusStep === undefined ? '30s' : isOneOf(value.prometheusStep, ['15s', '30s', '1m', '5m'] as const) ? value.prometheusStep : null
  const promqlBuilder = parsePromqlBuilder(value.promqlBuilder)
  const lokiTimeRange = value.lokiTimeRange === undefined ? { kind: 'rolling', amount: 1, unit: 'hour' } as const : timeRange(value.lokiTimeRange)
  const lokiBuilder = isRecord(value.lokiBuilder) ? value.lokiBuilder as unknown as LokiBuilderState : { ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }
  const lokiResultLimit = typeof value.lokiResultLimit === 'number' && value.lokiResultLimit > 0 && value.lokiResultLimit <= 5000 ? value.lokiResultLimit : 1000
  const lokiDisplayDirection = isOneOf(value.lokiDisplayDirection, ['backward', 'forward'] as const) ? value.lokiDisplayDirection : 'backward'
  const lokiBreakdown = stringOrNull(value.lokiBreakdown) ?? null
  const lokiRangeHistory = Array.isArray(value.lokiRangeHistory) ? value.lokiRangeHistory.map(timeRange).filter((item): item is BuilderTimeRange => item !== null) : []
  if (connectionProfileId === undefined || !isOneOf(value.queryMode, QUERY_MODES) || typeof value.sql !== 'string' || !parsedBuilder || !sqlVisualization || !parsedBuilderVisualization || filters === null || !prometheusTimeRange || !prometheusStep) return null
  const normalized = normalizeBuilderAxis(parsedBuilder, parsedBuilderVisualization)
  return { id: value.id, title: value.title.trim(), connectionProfileId, queryMode: value.queryMode, sql: value.sql, prometheusTimeRange, prometheusStep, promqlBuilder, lokiTimeRange: lokiTimeRange!, lokiBuilder, lokiResultLimit, lokiDisplayDirection, lokiBreakdown, lokiRangeHistory, builder: normalized.builder, sqlVisualization, builderVisualization: normalized.visualization, builderQueryFilters: filters }
}

export function parseWorkspaceDraft(raw: string | null): WorkspaceDraft | null {
  if (!raw) return null
  try {
    const envelope: unknown = JSON.parse(raw)
    if (!isRecord(envelope) || envelope.version !== WORKSPACE_VERSION || typeof envelope.activeTabId !== 'string' || !Array.isArray(envelope.tabs) || envelope.tabs.length === 0) return null
    const tabs = envelope.tabs.map(parseSession)
    if (tabs.some((tab) => tab === null)) return null
    const validTabs = tabs as QuerySessionDraft[]
    if (new Set(validTabs.map((tab) => tab.id)).size !== validTabs.length) return null
    return { activeTabId: validTabs.some((tab) => tab.id === envelope.activeTabId) ? envelope.activeTabId : validTabs[0].id, tabs: validTabs }
  } catch {
    return null
  }
}

function parseLegacyWorkspace(raw: string | null): WorkspaceDraft | null {
  if (!raw) return null
  try {
    const envelope: unknown = JSON.parse(raw)
    if (!isRecord(envelope) || envelope.version !== 1 || !isRecord(envelope.draft)) return null
    const draft = envelope.draft
    const parsedBuilder = builderDraft(draft.builder, SEVEN_DAYS)
    const sqlVisualization = visualization(draft.sqlVisualization)
    const parsedBuilderVisualization = visualization(draft.builderVisualization)
    if (!isOneOf(draft.queryMode, QUERY_MODES) || typeof draft.sql !== 'string' || !parsedBuilder || !sqlVisualization || !parsedBuilderVisualization) return null
    const normalized = normalizeBuilderAxis(parsedBuilder, parsedBuilderVisualization)
    const id = 'migrated-query-1'
    return {
      activeTabId: id,
      tabs: [{ id, title: 'Query 1', connectionProfileId: null, queryMode: draft.queryMode, sql: draft.sql, prometheusTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' }, prometheusStep: '30s', promqlBuilder: { ...DEFAULT_PROMQL_BUILDER, filterBy: [], groupBy: [], labelValues: {} }, lokiTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' }, lokiBuilder: { ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }, lokiResultLimit: 1000, lokiDisplayDirection: 'backward', lokiBreakdown: null, lokiRangeHistory: [], builder: normalized.builder, sqlVisualization, builderVisualization: normalized.visualization, builderQueryFilters: [] }]
    }
  } catch {
    return null
  }
}

function browserStorage(): WorkspaceStorage | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}
function browserEventTarget(): WorkspaceEventTarget | null {
  if (typeof window === 'undefined') return null
  return {
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener)
  }
}
function safeRead(storage: WorkspaceStorage | null, key: string): string | null {
  if (!storage) return null
  try { return storage.getItem(key) } catch { return null }
}

export function readWorkspaceDraft(storage: WorkspaceStorage | null = browserStorage()): WorkspaceDraft | null {
  return parseWorkspaceDraft(safeRead(storage, WORKSPACE_STORAGE_KEY))
    ?? parseWorkspaceDraft(safeRead(storage, LEGACY_DATAKOALA_WORKSPACE_STORAGE_KEY))
    ?? parseLegacyWorkspace(safeRead(storage, LEGACY_WORKSPACE_STORAGE_KEY))
}

function restoredSession(draft: QuerySessionDraft): QuerySession {
  return {
    id: draft.id,
    title: draft.title,
    connectionProfileId: draft.connectionProfileId,
    sql: draft.sql,
    prometheusTimeRange: draft.prometheusTimeRange,
    prometheusStep: draft.prometheusStep,
    promqlBuilder: draft.promqlBuilder,
    lokiTimeRange: draft.lokiTimeRange,
    lokiBuilder: draft.lokiBuilder,
    lokiResultLimit: draft.lokiResultLimit,
    lokiDisplayDirection: draft.lokiDisplayDirection,
    lokiBreakdown: draft.lokiBreakdown,
    lokiRangeHistory: draft.lokiRangeHistory,
    running: false,
    queryError: null,
    result: null,
    pendingResult: null,
    resultRevision: 0,
    lastSuccessfulResultRevision: 0,
    isResultStale: false,
    queryMode: draft.queryMode,
    builder: draft.builder,
    builderHasRun: false,
    sqlVisualization: draft.sqlVisualization,
    builderVisualization: draft.builderVisualization,
    sqlResultFilters: [],
    builderResultFilters: builderQueryFilters(draft.builderQueryFilters),
    queryFilterRevision: { sql: 0, builder: 0 },
    builderFilterNotice: null,
    explainText: null,
    showExplain: false,
    activeExplainRequest: null,
    seriesVisibility: {}
  }
}

export function restoreWorkspaceDraft(
  setState: (patch: WorkspaceRestorePatch) => void,
  storage: WorkspaceStorage | null = browserStorage()
): WorkspaceDraft | null {
  const draft = readWorkspaceDraft(storage)
  if (!draft) return null
  const tabs = draft.tabs.map(restoredSession)
  const activeTabId = tabs.some((tab) => tab.id === draft.activeTabId) ? draft.activeTabId : tabs[0].id
  setState({ tabs, activeTabId, activeProfileId: null })
  return draft
}

export function startWorkspacePersistence(
  getState: () => WorkspacePersistableState,
  subscribe: (listener: (state: WorkspacePersistableState) => void) => () => void,
  options: StartWorkspacePersistenceOptions = {}
): () => void {
  const storage = options.storage === undefined ? browserStorage() : options.storage
  if (!storage) return () => undefined
  const target = options.target === undefined ? browserEventTarget() : options.target
  const delayMs = options.delayMs ?? SAVE_DELAY_MS
  let lastSerialized = safeRead(storage, WORKSPACE_STORAGE_KEY)
  let timer: ReturnType<typeof setTimeout> | null = null

  const write = () => {
    timer = null
    const serialized = serializeWorkspaceDraft(getState())
    if (serialized === lastSerialized) return
    try {
      storage.setItem(WORKSPACE_STORAGE_KEY, serialized)
      lastSerialized = serialized
    } catch {
      // Local persistence is best-effort. A quota/storage failure must never block editing or query execution.
    }
  }
  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    write()
  }
  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(write, Math.max(0, delayMs))
  }

  const unsubscribe = subscribe(schedule)
  target?.addEventListener('beforeunload', flush)
  target?.addEventListener('pagehide', flush)
  return () => {
    flush()
    unsubscribe()
    target?.removeEventListener('beforeunload', flush)
    target?.removeEventListener('pagehide', flush)
  }
}
