import {
  legacyBuilderTimeColumn,
  legacyBuilderAxes,
  legacyLokiGroupBy,
  legacyLokiResultView,
  legacyPromqlFilters,
  legacyPromqlAggregation,
} from './workspaceMigrations.ts'
import { isDisplayUnit } from './displayUnit.ts'
import {
  compatibleTimeBucket,
  SEVEN_DAYS,
  type BuilderTimeRange,
} from './builderTimeRange.ts'
import { parseBuilderRollingTimeRange } from '@shared/builderTimeRange.ts'
import type { TimeWindow } from './customTimeRange.ts'
import type {
  Aggregation,
  ResultView,
  ValueAxisScale,
  VisualizationConfiguration,
} from './resultVisualization.ts'
import { deserializeResultFilters, type ResultFilter } from './resultFilters.ts'
import type {
  AppState,
  BuilderQueryState,
  QueryMode,
  QuerySession,
  TimeBucket,
} from '@store/useStore.ts'
import {
  DEFAULT_PROMQL_BUILDER,
  type PromqlBuilderState,
} from './promqlBuilder.ts'
import { DEFAULT_LOKI_BUILDER, type LokiBuilderState } from '@shared/loki.ts'
import {
  cloneTempoBuilder,
  DEFAULT_TRACE_RANGE,
  DEFAULT_TRACE_RESULT_VIEW,
  DEFAULT_TRACE_SAMPLE_SIZE,
  defaultTempoBuilder,
  parseTempoBuilder,
  parseTempoSampleSize,
  parseTraceResultView,
  type TraceResultView,
} from './tempoQueryState.ts'
import type { TraceBuilderState, TraceSampleSize } from './traceBuilder.ts'

const WORKSPACE_VERSION = 2

const QUERY_MODES: QueryMode[] = ['sql', 'builder']
const TIME_BUCKETS: TimeBucket[] = [
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
]
const RESULT_VIEWS: ResultView[] = [
  'table',
  'bar',
  'line',
  'area',
  'scatter',
  'treemap',
  'sunburst',
]
const AGGREGATIONS: Aggregation[] = [
  'sum',
  'average',
  'minimum',
  'maximum',
  'count',
]
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
  tempoBuilder: TraceBuilderState
  tempoTimeRange: BuilderTimeRange
  tempoSampleSize: TraceSampleSize
  tempoResultView: TraceResultView
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
interface WorkspaceEnvelope {
  version: typeof WORKSPACE_VERSION
  activeTabId: string
  tabs: unknown[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T => typeof value === 'string' && allowed.includes(value as T)
const stringOrNull = (value: unknown): string | null | undefined =>
  value === null ? null : typeof value === 'string' ? value : undefined

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    return null
  return [...new Set(value as string[])]
}

function timeWindow(value: unknown): TimeWindow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.from !== 'string' ||
    typeof value.to !== 'string'
  )
    return null
  return { id: value.id, from: value.from, to: value.to }
}

function timeRange(value: unknown): BuilderTimeRange | null {
  if (!isRecord(value)) return null
  if (value.kind === 'all') return { kind: 'all' }
  if (value.kind === 'rolling')
    return parseBuilderRollingTimeRange(value.amount, value.unit)
  if (value.kind !== 'custom') return null
  const startDate = stringOrNull(value.startDate)
  const endDate = stringOrNull(value.endDate)
  if (
    startDate === undefined ||
    endDate === undefined ||
    typeof value.startTime !== 'string' ||
    typeof value.endTime !== 'string'
  )
    return null
  const windows =
    value.recurringWindows === undefined
      ? []
      : Array.isArray(value.recurringWindows)
        ? value.recurringWindows.map(timeWindow)
        : null
  if (windows === null || windows.some((window) => window === null)) return null
  return {
    kind: 'custom',
    startDate,
    startTime: value.startTime,
    endDate,
    endTime: value.endTime,
    recurringWindows: windows as TimeWindow[],
  }
}

function table(value: unknown): BuilderQueryState['table'] | undefined {
  if (value === null) return null
  if (
    !isRecord(value) ||
    typeof value.schema !== 'string' ||
    typeof value.name !== 'string'
  )
    return undefined
  return { schema: value.schema, name: value.name }
}

function parsePromqlBuilder(value: unknown): PromqlBuilderState {
  if (!isRecord(value))
    return {
      ...DEFAULT_PROMQL_BUILDER,
      filterBy: [],
      groupBy: [],
      labelValues: {},
    }
  const calculations = [
    'raw',
    'rate',
    'increase',
    'observation-rate',
    'histogram-average',
    'histogram-sum',
    'percentile',
  ] as const
  const aggregations = ['none', 'sum', 'avg', 'min', 'max'] as const
  const windows = ['1m', '5m', '10m', '15m', '30m', '1h'] as const
  const quantiles = [0.5, 0.75, 0.9, 0.95, 0.99, 0.999] as const
  const filters = legacyPromqlFilters(value.filters)
  const restoredFilterBy =
    stringArray(value.filterBy) ?? filters.map((filter) => filter.label)
  const restoredLabelValues = isRecord(value.labelValues)
    ? Object.fromEntries(
        Object.entries(value.labelValues).flatMap(([label, values]) =>
          Array.isArray(values) &&
          values.every((item) => typeof item === 'string')
            ? [[label, [...new Set(values as string[])]]]
            : [],
        ),
      )
    : Object.fromEntries(filters.map((filter) => [filter.label, filter.values]))
  const legacyAggregation = legacyPromqlAggregation(value.calculation)
  const calculation = isOneOf(value.calculation, calculations)
    ? value.calculation
    : 'raw'
  const histogramCalculation =
    calculation === 'percentile' ||
    calculation === 'observation-rate' ||
    calculation === 'histogram-average' ||
    calculation === 'histogram-sum'
  const aggregation = histogramCalculation
    ? 'sum'
    : isOneOf(value.aggregation, aggregations)
      ? value.aggregation
      : (legacyAggregation ??
        ((calculation === 'rate' || calculation === 'increase') &&
        (stringArray(value.groupBy)?.length ?? 0) > 0
          ? 'sum'
          : 'none'))
  return {
    metric: typeof value.metric === 'string' ? value.metric : '',
    filterBy: restoredFilterBy,
    labelValues: restoredLabelValues,
    groupBy: stringArray(value.groupBy) ?? [],
    calculation,
    aggregation,
    window: isOneOf(value.window, windows) ? value.window : '5m',
    percentile:
      typeof value.percentile === 'number' &&
      quantiles.includes(value.percentile as (typeof quantiles)[number])
        ? (value.percentile as (typeof quantiles)[number])
        : 0.95,
  }
}

function parseLokiBuilder(value: unknown): LokiBuilderState {
  if (!isRecord(value))
    return {
      ...DEFAULT_LOKI_BUILDER,
      labelMatchers: [],
      lineFilters: [],
      parsers: [],
      fieldFilters: [],
    }
  const labelOperators = ['=', '!=', '=~', '!~'] as const
  const lineOperators = ['|=', '!=', '|~', '!~'] as const
  const parserKinds = ['json', 'logfmt', 'pattern', 'regexp'] as const
  const labelMatchers = Array.isArray(value.labelMatchers)
    ? value.labelMatchers.flatMap((matcher) => {
        if (
          !isRecord(matcher) ||
          typeof matcher.label !== 'string' ||
          !isOneOf(matcher.operator, labelOperators) ||
          typeof matcher.value !== 'string'
        )
          return []
        const values =
          matcher.values === undefined ? undefined : stringArray(matcher.values)
        if (matcher.values !== undefined && !values) return []
        return [
          {
            label: matcher.label,
            operator: matcher.operator,
            value: matcher.value,
            ...(values ? { values: [...new Set(values)] } : {}),
          },
        ]
      })
    : []
  const lineFilters = Array.isArray(value.lineFilters)
    ? value.lineFilters.flatMap((filter) =>
        isRecord(filter) &&
        isOneOf(filter.operator, lineOperators) &&
        typeof filter.value === 'string'
          ? [{ operator: filter.operator, value: filter.value }]
          : [],
      )
    : []
  const parsers = Array.isArray(value.parsers)
    ? value.parsers.flatMap((stage) =>
        isRecord(stage) &&
        isOneOf(stage.kind, parserKinds) &&
        (stage.expression === undefined || typeof stage.expression === 'string')
          ? [
              {
                kind: stage.kind,
                ...(typeof stage.expression === 'string'
                  ? { expression: stage.expression }
                  : {}),
              },
            ]
          : [],
      )
    : []
  const fieldFilters = Array.isArray(value.fieldFilters)
    ? value.fieldFilters.flatMap((filter) =>
        isRecord(filter) &&
        typeof filter.field === 'string' &&
        isOneOf(filter.operator, labelOperators) &&
        typeof filter.value === 'string'
          ? [
              {
                field: filter.field,
                operator: filter.operator,
                value: filter.value,
              },
            ]
          : [],
      )
    : []
  return { labelMatchers, lineFilters, parsers, fieldFilters }
}

/**
 * Read old time-first v2 drafts, early axis-first #46 drafts, and the current
 * axis-first shape. Missing xColumn/timeColumn keys are legacy-compatible; malformed
 * non-string values still fail closed.
 */
function builderDraft(
  value: unknown,
  legacyMissingRange?: BuilderTimeRange,
): BuilderQueryState | null {
  if (!isRecord(value)) return null
  const restoredTable = table(value.table)
  const explicitTimeColumn =
    value.timeColumn === undefined ? null : stringOrNull(value.timeColumn)
  const persistedX =
    value.xColumn === undefined ? null : stringOrNull(value.xColumn)
  const restoredSeries = stringArray(value.seriesColumns)
  const restoredRange =
    value.timeRange === undefined
      ? legacyMissingRange
      : timeRange(value.timeRange)
  const restoredBucket =
    value.timeBucket === undefined
      ? 'day'
      : isOneOf(value.timeBucket, TIME_BUCKETS)
        ? value.timeBucket
        : null
  if (
    restoredTable === undefined ||
    explicitTimeColumn === undefined ||
    persistedX === undefined ||
    !restoredSeries ||
    restoredBucket === null ||
    (value.timeRange !== undefined && restoredRange === null)
  )
    return null
  if (!restoredTable)
    return {
      table: null,
      timeColumn: null,
      timeBucket: 'day',
      seriesColumns: [],
      timeRange: undefined,
    }

  const resolvedTimeColumn = legacyBuilderTimeColumn(
    explicitTimeColumn,
    persistedX,
    Boolean(restoredRange),
  )
  const range = resolvedTimeColumn ? restoredRange : undefined
  return {
    table: restoredTable,
    timeColumn: resolvedTimeColumn,
    timeBucket: range ? compatibleTimeBucket(restoredBucket, range) : 'day',
    seriesColumns: restoredSeries,
    timeRange: range ?? undefined,
  }
}

function visualization(value: unknown): VisualizationConfiguration | null {
  if (
    !isRecord(value) ||
    !isOneOf(value.view, RESULT_VIEWS) ||
    !isOneOf(value.aggregation, AGGREGATIONS)
  )
    return null
  const xColumn = stringOrNull(value.xColumn)
  const valueColumn = stringOrNull(value.valueColumn)
  const seriesColumn = stringOrNull(value.seriesColumn)
  const seriesColumns =
    value.seriesColumns === undefined ? [] : stringArray(value.seriesColumns)
  const hierarchyDimensions =
    value.hierarchyDimensions === undefined
      ? []
      : stringArray(value.hierarchyDimensions)
  const valueAxisScale =
    value.valueAxisScale === undefined
      ? 'linear'
      : isOneOf(value.valueAxisScale, VALUE_AXIS_SCALES)
        ? value.valueAxisScale
        : null
  if (
    xColumn === undefined ||
    valueColumn === undefined ||
    seriesColumn === undefined ||
    !seriesColumns ||
    !hierarchyDimensions ||
    !valueAxisScale ||
    (value.displayUnit !== undefined && !isDisplayUnit(value.displayUnit))
  )
    return null
  return {
    view: value.view,
    xColumn,
    valueColumn,
    aggregation: value.aggregation,
    seriesColumn,
    seriesColumns,
    hierarchyDimensions,
    valueAxisScale,
    ...(isDisplayUnit(value.displayUnit)
      ? { displayUnit: { ...value.displayUnit } }
      : {}),
  }
}

export function cloneTimeRange(
  value: BuilderTimeRange | undefined,
): BuilderTimeRange | undefined {
  if (!value) return undefined
  if (value.kind !== 'custom') return { ...value }
  return {
    ...value,
    recurringWindows: (value.recurringWindows ?? []).map((window) => ({
      ...window,
    })),
  }
}
function cloneVisualization(
  value: VisualizationConfiguration,
): VisualizationConfiguration {
  return {
    ...value,
    seriesColumns: [...(value.seriesColumns ?? [])],
    hierarchyDimensions: [...(value.hierarchyDimensions ?? [])],
  }
}
export function builderQueryFilters(filters: ResultFilter[]): ResultFilter[] {
  return filters
    .filter((filter) => filter.execution === 'query')
    .map((filter) => ({
      ...filter,
      provenance: filter.provenance
        ? {
            ...filter.provenance,
            table: { ...filter.provenance.table },
            sourceColumns: [...filter.provenance.sourceColumns],
          }
        : undefined,
    }))
}

function normalizeBuilderAxis(
  builder: BuilderQueryState,
  visualizationState: VisualizationConfiguration,
): { builder: BuilderQueryState; visualization: VisualizationConfiguration } {
  const axes = legacyBuilderAxes(
    builder.timeColumn,
    visualizationState.xColumn,
    visualizationState.valueColumn,
    visualizationState.aggregation,
  )
  const sourceX = axes.xColumn
  const valueColumn = axes.valueColumn
  const aggregation = axes.aggregation
  const timeColumn = builder.table ? builder.timeColumn : null
  const range = timeColumn
    ? cloneTimeRange(builder.timeRange ?? SEVEN_DAYS)
    : undefined
  const temporalX = Boolean(sourceX && timeColumn && sourceX === timeColumn)
  const seriesColumns = builder.seriesColumns.filter(
    (column) => column !== sourceX && column !== valueColumn,
  )
  return {
    builder: {
      table: builder.table ? { ...builder.table } : null,
      timeColumn,
      timeBucket:
        temporalX && range
          ? compatibleTimeBucket(builder.timeBucket, range)
          : 'day',
      seriesColumns,
      timeRange: range,
    },
    visualization: {
      ...cloneVisualization(visualizationState),
      xColumn: builder.table ? sourceX : null,
      valueColumn: aggregation === 'count' ? null : valueColumn,
      aggregation,
      seriesColumn: null,
      seriesColumns,
    },
  }
}

function sessionDraft(session: QuerySession): QuerySessionDraft {
  const normalized = normalizeBuilderAxis(
    session.builder,
    session.builderVisualization,
  )
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
    lokiGroupBy: session.lokiGroupBy,
    lokiResultView: session.lokiResultView,
    tempoBuilder: cloneTempoBuilder(session.tempoBuilder),
    tempoTimeRange: cloneTimeRange(session.tempoTimeRange)!,
    tempoSampleSize: session.tempoSampleSize,
    tempoResultView: session.tempoResultView,
    builder: normalized.builder,
    sqlVisualization: cloneVisualization(session.sqlVisualization),
    builderVisualization: normalized.visualization,
    builderQueryFilters: builderQueryFilters(session.builderResultFilters),
  }
}

export function workspaceDraftFromState(
  state: WorkspacePersistableState,
): WorkspaceDraft {
  const tabs = state.tabs.map(sessionDraft)
  const activeTabId = tabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : (tabs[0]?.id ?? '')
  return { activeTabId, tabs }
}

/**
 * Persist X independently from the dataset's Time range source. Time range remains
 * available for categorical/numeric X axes, while Time bucket is only serialized
 * when X is the temporal source itself.
 */
function serializedSession(tab: QuerySessionDraft): Record<string, unknown> {
  const xColumn = tab.builderVisualization.xColumn
  const temporalX = Boolean(
    xColumn && tab.builder.timeColumn && xColumn === tab.builder.timeColumn,
  )
  const persistedBuilder: Record<string, unknown> = {
    table: tab.builder.table,
    xColumn,
    timeColumn: tab.builder.timeColumn,
    seriesColumns: tab.builder.seriesColumns,
  }
  if (tab.builder.timeColumn && tab.builder.timeRange)
    persistedBuilder.timeRange = tab.builder.timeRange
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
    lokiGroupBy: tab.lokiGroupBy,
    lokiResultView: tab.lokiResultView,
    tempoBuilder: tab.tempoBuilder,
    tempoTimeRange: tab.tempoTimeRange,
    tempoSampleSize: tab.tempoSampleSize,
    tempoResultView: tab.tempoResultView,
    builder: persistedBuilder,
    sqlVisualization: tab.sqlVisualization,
    builderVisualization: tab.builderVisualization,
    builderQueryFilters: tab.builderQueryFilters,
  }
}

export function serializeWorkspaceDraft(
  state: WorkspacePersistableState,
): string {
  const draft = workspaceDraftFromState(state)
  const envelope: WorkspaceEnvelope = {
    version: WORKSPACE_VERSION,
    activeTabId: draft.activeTabId,
    tabs: draft.tabs.map(serializedSession),
  }
  return JSON.stringify(envelope)
}

function parsedQueryFilters(value: unknown): ResultFilter[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  try {
    return deserializeResultFilters(JSON.stringify(value)).filter(
      (filter) => filter.execution === 'query',
    )
  } catch {
    return null
  }
}

function parseSession(value: unknown): QuerySessionDraft | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.title !== 'string' ||
    !value.title.trim()
  )
    return null
  const connectionProfileId = stringOrNull(value.connectionProfileId)
  const parsedBuilder = builderDraft(value.builder)
  const sqlVisualization = visualization(value.sqlVisualization)
  const parsedBuilderVisualization = visualization(value.builderVisualization)
  const filters = parsedQueryFilters(value.builderQueryFilters)
  const prometheusTimeRange =
    value.prometheusTimeRange === undefined
      ? ({ kind: 'rolling', amount: 1, unit: 'hour' } as const)
      : timeRange(value.prometheusTimeRange)
  const prometheusStep =
    value.prometheusStep === undefined
      ? 'auto'
      : isOneOf(value.prometheusStep, [
            'auto',
            '15s',
            '30s',
            '1m',
            '2m',
            '5m',
            '10m',
            '15m',
            '30m',
            '1h',
            '2h',
            '6h',
            '12h',
            '1d',
          ] as const)
        ? value.prometheusStep
        : null
  const promqlBuilder = parsePromqlBuilder(value.promqlBuilder)
  const lokiTimeRange =
    value.lokiTimeRange === undefined
      ? ({ kind: 'rolling', amount: 1, unit: 'hour' } as const)
      : timeRange(value.lokiTimeRange)
  const lokiBuilder = parseLokiBuilder(value.lokiBuilder)
  const lokiResultLimit =
    typeof value.lokiResultLimit === 'number' &&
    value.lokiResultLimit > 0 &&
    value.lokiResultLimit <= 5000
      ? value.lokiResultLimit
      : 1000
  const lokiGroupBy = [
    ...new Set(
      Array.isArray(value.lokiGroupBy)
        ? value.lokiGroupBy.filter(
            (item): item is string =>
              typeof item === 'string' &&
              item.length > 0 &&
              !item.startsWith('__'),
          )
        : legacyLokiGroupBy(value.lokiBreakdown),
    ),
  ]
  const migratedLokiView = legacyLokiResultView(value.lokiResultView)
  const lokiResultView = isOneOf(migratedLokiView, [
    'list',
    'table',
    'patterns',
    'line',
    'area',
    'bar',
    'scatter',
    'treemap',
    'sunburst',
  ] as const)
    ? migratedLokiView
    : 'list'
  const tempoBuilder =
    parseTempoBuilder(value.tempoBuilder) ?? defaultTempoBuilder()
  const tempoTimeRange = (value.tempoTimeRange === undefined
    ? null
    : timeRange(value.tempoTimeRange)) ?? { ...DEFAULT_TRACE_RANGE }
  const tempoSampleSize =
    parseTempoSampleSize(value.tempoSampleSize) ?? DEFAULT_TRACE_SAMPLE_SIZE
  const tempoResultView =
    parseTraceResultView(value.tempoResultView) ?? DEFAULT_TRACE_RESULT_VIEW
  if (
    connectionProfileId === undefined ||
    !isOneOf(value.queryMode, QUERY_MODES) ||
    typeof value.sql !== 'string' ||
    !parsedBuilder ||
    !sqlVisualization ||
    !parsedBuilderVisualization ||
    filters === null ||
    !prometheusTimeRange ||
    !prometheusStep ||
    !lokiTimeRange
  )
    return null
  const normalized = normalizeBuilderAxis(
    parsedBuilder,
    parsedBuilderVisualization,
  )
  return {
    id: value.id,
    title: value.title.trim(),
    connectionProfileId,
    queryMode: value.queryMode,
    sql: value.sql,
    prometheusTimeRange,
    prometheusStep,
    promqlBuilder,
    lokiTimeRange,
    lokiBuilder,
    lokiResultLimit,
    lokiGroupBy,
    lokiResultView,
    tempoBuilder,
    tempoTimeRange,
    tempoSampleSize,
    tempoResultView,
    builder: normalized.builder,
    sqlVisualization,
    builderVisualization: normalized.visualization,
    builderQueryFilters: filters,
  }
}

export function parseWorkspaceDraft(raw: string | null): WorkspaceDraft | null {
  if (!raw) return null
  try {
    const envelope: unknown = JSON.parse(raw)
    if (
      !isRecord(envelope) ||
      envelope.version !== WORKSPACE_VERSION ||
      typeof envelope.activeTabId !== 'string' ||
      !Array.isArray(envelope.tabs) ||
      envelope.tabs.length === 0
    )
      return null
    const tabs = envelope.tabs.map(parseSession)
    if (tabs.some((tab) => tab === null)) return null
    const validTabs = tabs as QuerySessionDraft[]
    if (new Set(validTabs.map((tab) => tab.id)).size !== validTabs.length)
      return null
    return {
      activeTabId: validTabs.some((tab) => tab.id === envelope.activeTabId)
        ? envelope.activeTabId
        : validTabs[0].id,
      tabs: validTabs,
    }
  } catch {
    return null
  }
}
