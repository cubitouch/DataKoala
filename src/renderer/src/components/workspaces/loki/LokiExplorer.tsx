import { TextInput } from '@components/ui/TextInput'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  LokiFilterSource,
  LokiLogResult,
  LokiParserKind,
  LokiQueryResult,
} from '@shared/loki'
import { sortLokiLogRowsNewestFirst } from '@shared/loki'
import { buildLokiQuery, logqlResultKind } from '@shared/loki-builder'
import { derivePatternLineContainsCandidate } from '@shared/log-pattern-filter'
import type { LogPatternCluster } from '@shared/log-patterns'
import {
  CHART_SERIES_HARD_LIMIT,
  CHART_SERIES_SOFT_LIMIT,
} from '@shared/chartLimits'
import { buildLokiTrendExpressions } from '@shared/loki-trend'
import type { BuilderTimeRange } from '@lib/builderTimeRange'
import { prometheusRangeBounds } from '@lib/prometheusTimeRange'
import { logql } from '@lib/logqlLanguage'
import { useLokiLabelsResource } from '@lib/useLokiLabelsResource'
import { effectiveLogMessage } from '@lib/lokiLogMessage'
import { api } from '@lib/api'
import { TimeRangeField } from '@components/query/time-range/TimeRangeField'
import { LogResultExplorer } from '@components/results/logs/LogResultExplorer'
import { LogPatternExplorer } from '@components/results/logs/LogPatternExplorer'
import { GenericResultExplorer } from '@components/results/GenericResultExplorer'
import { LokiBuilderPanel } from '@components/builder/loki/LokiBuilderPanel'
import { ModeSwitch } from '@components/query/ModeSwitch'
import { QueryUtilityActions } from '@components/query/QueryUtilityActions'
import { CopySqlButton } from '@components/query/CopySqlButton'
import {
  ChartPicker,
  type ChartPickerView,
} from '@components/results/ChartPicker'
import { selectActiveSession, useStore } from '@store/useStore'
import styles from './LokiExplorer.module.css'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import { applyResultFilters, type ResultFilter } from '@lib/resultFilters'
import { QueryToolbar } from '@components/query/QueryToolbar'
import { QueryCodeEditor } from '@components/query/QueryCodeEditor'
import { GrafanaHandoffActions } from '@components/query/GrafanaHandoffActions'
import { notify } from '@components/ui/feedback/NotificationArea'

const serviceNameFallback = {
  label: 'service_name',
  operator: '=~' as const,
  value: '.+',
}
const unfilteredUnavailable =
  'An unfiltered query isn’t available for this Loki datasource. Add an indexed-label filter to run the query safely.'
// GenericResultExplorer memoizes chart derivation by externalSeriesColumns identity.
// Loki owns its chart dimensions, so provide one stable empty adapter value rather than
// falling through to the component's per-render [] default.
const EMPTY_LOKI_EXTERNAL_SERIES_COLUMNS: string[] = []
function interval(start: string, end: string): string {
  const targetSeconds = Math.max(
    1,
    (Date.parse(end) - Date.parse(start)) / 250_000,
  )
  const choices = [1, 5, 10, 30, 60, 300, 900, 3600, 10_800, 21_600, 86_400]
  return `${choices.find((item) => item >= targetSeconds) ?? 86_400}s`
}
interface LokiTrendRange {
  startMs: number
  endMs: number
}
type LokiChartView =
  'bar' | 'line' | 'area' | 'scatter' | 'treemap' | 'sunburst'
const isLokiChartView = (view: ChartPickerView): view is LokiChartView =>
  ['bar', 'line', 'area', 'scatter', 'treemap', 'sunburst'].includes(view)

function customRange({ startMs, endMs }: LokiTrendRange): BuilderTimeRange {
  const start = new Date(startMs),
    end = new Date(endMs)
  return {
    kind: 'custom',
    startDate: start.toISOString().slice(0, 10),
    startTime: start.toISOString().slice(11, 16),
    endDate: end.toISOString().slice(0, 10),
    endTime: end.toISOString().slice(11, 16),
    recurringWindows: [],
  }
}

interface LokiExplorerProps {
  connectionId: string
  resizeHandle?: ReactNode
}

export function LokiExplorer({
  connectionId,
  resizeHandle,
}: LokiExplorerProps) {
  const profile = useStore((state) =>
    state.profiles.find(
      (item) => item.id === connectionId && item.kind === 'loki',
    ),
  )
  const session = useStore(selectActiveSession)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const setLokiState = useStore((state) => state.setLokiState)
  const connectionStatus = useStore((state) => state.connectionStatus)
  const reconnectActiveProfile = useStore(
    (state) => state.reconnectActiveProfile,
  )
  const setVisualization = useStore((state) => state.setVisualization)
  const setSeriesVisibility = useStore((state) => state.setSeriesVisibility)
  const addResultFilter = useStore((state) => state.addResultFilter)
  const removeResultFilter = useStore((state) => state.removeResultFilter)
  const clearResultFilters = useStore((state) => state.clearResultFilters)
  const mode = session.queryMode === 'builder' ? 'builder' : 'logql'
  const {
    sql: query,
    lokiBuilder: builder,
    lokiTimeRange: range,
    lokiResultLimit: limit,
    lokiGroupBy: groupBy,
    lokiResultView: resultView,
  } = session
  const activeProfileId = useStore((state) => state.activeProfileId)
  const connected = useStore((state) => state.connected)
  const legacyGeneration = useStore((state) => state.connectionGeneration)
  const scopedConnection = useStore(
    (state) => state.connectionStateByProfileId[connectionId],
  )
  const connectionGeneration = scopedConnection?.generation ?? legacyGeneration
  const metadataRevision = useStore(
    (state) => state.metadataByProfileId[connectionId]?.revision ?? 0,
  )
  const metadataRefreshing = useStore(
    (state) => state.metadataByProfileId[connectionId]?.refreshing ?? false,
  )
  const canLoadMetadata =
    scopedConnection?.status === 'connected' ||
    scopedConnection?.status === 'idle' ||
    (connectionId === activeProfileId && connected)
  const labelResource = useLokiLabelsResource(
    connectionId,
    connectionGeneration,
    session.id,
    range,
    canLoadMetadata,
    metadataRevision,
  )
  const labels = [
    ...new Set([
      ...labelResource.labels,
      ...builder.labelMatchers
        .map(({ label }) => label)
        .filter((label) => !label.startsWith('__')),
      ...groupBy,
    ]),
  ].sort()
  const result = session.result as LokiQueryResult | null
  const [trend, setTrend] = useState<LokiQueryResult | null>(null)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [localLevelFilter, setLocalLevelFilter] = useState<{
    value: string
    exclude: boolean
  } | null>(null)
  const [patternScope, setPatternScope] = useState<{
    template: string
    memberIds: Set<string>
  } | null>(null)
  const [formattedGenerated, setFormattedGenerated] = useState<{
    connectionId: string
    source: string
    query: string
  } | null>(null)
  const [trendVisualization, setTrendVisualization] =
    useState<VisualizationConfiguration>({
      view: 'line',
      xColumn: 'timestamp',
      valueColumn: 'value',
      aggregation: 'sum',
      seriesColumn: null,
      seriesColumns: [],
      hierarchyDimensions: [],
      valueAxisScale: 'linear',
      anomalyDetectionEnabled: false,
    })
  const revision = useRef(0),
    trendRevision = useRef(0),
    generatedFormatRevision = useRef(0),
    hasRun = useRef(Boolean(session.result)),
    mounted = useRef(true)
  const trendCacheKey = useRef<string | null>(null)
  const rangeKey = JSON.stringify(range),
    previousRangeKey = useRef(rangeKey)
  const trendRefreshKey = JSON.stringify([
    session.id,
    resultView,
    groupBy,
    rangeKey,
  ])
  const lastProcessedTrendKey = useRef<string | null>(null)
  const fallbackMatcher =
    labelResource.status === 'loaded' &&
    labelResource.labels.includes('service_name')
      ? serviceNameFallback
      : undefined
  const generation = useMemo(() => {
    try {
      return {
        generated: buildLokiQuery(builder, { fallbackMatcher }),
        error: null,
      }
    } catch (caught) {
      return {
        generated: '',
        error: caught instanceof Error ? caught.message : String(caught),
      }
    }
  }, [builder, fallbackMatcher])
  const generated = generation.generated
  const displayedGenerated =
    canLoadMetadata &&
    formattedGenerated?.connectionId === connectionId &&
    formattedGenerated.source === generated
      ? formattedGenerated.query
      : generated
  const expression = mode === 'builder' ? displayedGenerated : query
  const builderDisabledReason =
    mode === 'builder' && !generated && labelResource.status !== 'loading'
      ? generation.error?.includes('safe fallback selector')
        ? unfilteredUnavailable
        : generation.error
      : null
  const isCurrentTab = useCallback(
    (tabId: string) =>
      mounted.current && useStore.getState().activeTabId === tabId,
    [],
  )
  const deactivate = useCallback(() => {
    mounted.current = false
    revision.current += 1
    trendRevision.current += 1
  }, [])
  const clearLokiTransientState = () => {
    revision.current++
    trendRevision.current++
    hasRun.current = false
    trendCacheKey.current = null
    setTrend(null)
    setError(null)
    setWarning(null)
    setTrendError(null)
    setLoading(false)
    setPatternScope(null)
  }
  useEffect(() => {
    mounted.current = true
    return deactivate
  }, [deactivate])
  useEffect(() => {
    const request = ++generatedFormatRevision.current
    if (mode !== 'builder' || !generated.trim() || !canLoadMetadata) {
      setFormattedGenerated(null)
      return
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const formatted = await api.connections.loki.formatQuery(
            connectionId,
            generated,
          )
          if (request !== generatedFormatRevision.current || !mounted.current)
            return
          setFormattedGenerated({
            connectionId,
            source: generated,
            query: formatted.trim() ? formatted : generated,
          })
        } catch {
          if (request !== generatedFormatRevision.current || !mounted.current)
            return
          setFormattedGenerated({
            connectionId,
            source: generated,
            query: generated,
          })
        }
      })()
    }, 160)
    return () => {
      window.clearTimeout(timer)
      if (generatedFormatRevision.current === request)
        generatedFormatRevision.current += 1
    }
  }, [canLoadMetadata, connectionId, generated, mode])
  useLayoutEffect(() => {
    const currentSession = selectActiveSession(useStore.getState())
    revision.current++
    trendRevision.current++
    hasRun.current = Boolean(currentSession.result)
    previousRangeKey.current = JSON.stringify(currentSession.lokiTimeRange)
    lastProcessedTrendKey.current = null
    setTrend(null)
    setTrendError(null)
    setError(null)
    setWarning(null)
    setLoading(false)
  }, [session.id])
  useEffect(() => {
    if (!isLokiChartView(resultView)) return
    setTrendVisualization((current) => ({
      ...current,
      view: resultView,
      xColumn: 'timestamp',
      valueColumn: 'value',
      aggregation: 'sum',
      seriesColumn: groupBy.length === 1 ? groupBy[0] : null,
      seriesColumns: groupBy.length > 1 ? groupBy : [],
      hierarchyDimensions: groupBy,
    }))
  }, [resultView, groupBy, session.id])

  const loadTrend = useCallback(
    async (
      tabId: string,
      queryExpression: string,
      queryRange: BuilderTimeRange,
      queryGroupBy: string[],
    ) => {
      let kind: 'logs' | 'metrics'
      try {
        kind = logqlResultKind(queryExpression)
      } catch {
        return
      }
      if (kind !== 'logs') return
      const bounds = prometheusRangeBounds(queryRange),
        step = interval(bounds.start, bounds.end)
      const key = JSON.stringify([
        tabId,
        connectionId,
        queryExpression,
        bounds,
        queryGroupBy,
      ])
      if (trendCacheKey.current === key && trend) return
      const current = ++trendRevision.current
      setTrendError(null)
      try {
        const plan = buildLokiTrendExpressions(
          queryExpression,
          step,
          queryGroupBy,
          kind,
        )!
        if (plan.cardinalityProbe && queryGroupBy.length > 0) {
          const probe = await api.query
            .runLoki(connectionId, {
              expression: plan.cardinalityProbe,
              ...bounds,
              step,
              limit: 1,
            })
            .catch((error) => {
              throw new Error(
                `Cardinality probe failed: ${error instanceof Error ? error.message : String(error)}`,
              )
            })
          if (current !== trendRevision.current || !isCurrentTab(tabId)) return
          const count = Math.max(
            0,
            ...probe.rows.map((row) => Number(row.value) || 0),
          )
          if (count > CHART_SERIES_HARD_LIMIT)
            throw new Error(
              `Group by ${queryGroupBy.join(', ')} was rejected before fetching: ${count} series exceeds the hard limit of ${CHART_SERIES_HARD_LIMIT}.`,
            )
          if (count > CHART_SERIES_SOFT_LIMIT)
            setWarning(
              `Group by ${queryGroupBy.join(', ')} contains ${count} series; charts may be dense.`,
            )
        }
        const volume = await api.query
          .runLoki(connectionId, {
            expression: plan.trend,
            ...bounds,
            step,
            limit: CHART_SERIES_HARD_LIMIT,
          })
          .catch((error) => {
            throw new Error(
              `Log volume query failed: ${error instanceof Error ? error.message : String(error)}`,
            )
          })
        if (current !== trendRevision.current || !isCurrentTab(tabId)) return
        trendCacheKey.current = key
        setTrend(volume)
      } catch (caught) {
        if (current === trendRevision.current && isCurrentTab(tabId))
          setTrendError(
            caught instanceof Error ? caught.message : String(caught),
          )
      }
    },
    [connectionId, isCurrentTab, trend],
  )
  const executeExpression = useCallback(
    async (queryExpression: string) => {
      if (metadataRefreshing || !queryExpression.trim()) return
      const tabId = session.id
      let kind: 'logs' | 'metrics'
      try {
        kind = logqlResultKind(queryExpression)
      } catch (caught) {
        return setError(
          caught instanceof Error ? caught.message : String(caught),
        )
      }
      const current = ++revision.current
      trendRevision.current++
      trendCacheKey.current = null
      lastProcessedTrendKey.current = null
      setTrend(null)
      hasRun.current = true
      setLoading(true)
      setError(null)
      setTrendError(null)
      setWarning(null)
      const bounds = prometheusRangeBounds(range),
        step = interval(bounds.start, bounds.end)
      try {
        const shouldLoadTrend = kind === 'logs' && isLokiChartView(resultView)
        if (shouldLoadTrend) lastProcessedTrendKey.current = trendRefreshKey
        // Start the synthetic volume query alongside the raw log query, but do not make
        // the primary result lifecycle wait for it. The chart already has an explicit
        // "Loading log volume…" state while this independent Loki metric query finishes.
        if (shouldLoadTrend)
          void loadTrend(tabId, queryExpression, range, groupBy)
        const main = await api.query.runLoki(connectionId, {
          expression: queryExpression,
          ...bounds,
          step,
          limit,
        })
        if (current !== revision.current || !isCurrentTab(tabId)) return
        useStore.getState().completeQuery(main, null, tabId)
      } catch (caught) {
        if (current === revision.current && isCurrentTab(tabId)) {
          // Do not allow a trend from a failed main query to become the visible result.
          trendRevision.current++
          trendCacheKey.current = null
          setTrend(null)
          setTrendError(null)
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } finally {
        if (current === revision.current && isCurrentTab(tabId))
          setLoading(false)
      }
    },
    [
      metadataRefreshing,
      session.id,
      range,
      resultView,
      loadTrend,
      groupBy,
      connectionId,
      limit,
      isCurrentTab,
      trendRefreshKey,
    ],
  )
  const run = useCallback(async () => {
    if (metadataRefreshing) return
    if (!expression.trim())
      return setError(
        mode === 'builder'
          ? (builderDisabledReason ?? 'The Builder query is not ready to run.')
          : 'Enter a LogQL query.',
      )
    await executeExpression(expression)
  }, [
    metadataRefreshing,
    expression,
    mode,
    builderDisabledReason,
    executeExpression,
  ])
  useEffect(() => {
    if (previousRangeKey.current === rangeKey) return
    previousRangeKey.current = rangeKey
    if (hasRun.current) void run()
  }, [rangeKey, run])
  useEffect(() => {
    if (!isLokiChartView(resultView)) {
      lastProcessedTrendKey.current = null
      return
    }
    if (!hasRun.current || result?.resultKind !== 'logs' || !expression.trim())
      return
    if (lastProcessedTrendKey.current === trendRefreshKey) return
    lastProcessedTrendKey.current = trendRefreshKey
    void loadTrend(session.id, expression, range, groupBy)
  }, [
    resultView,
    result?.resultKind,
    expression,
    trendRefreshKey,
    loadTrend,
    session.id,
    range,
    groupBy,
  ])
  useEffect(() => setPatternScope(null), [result])
  const selectRange = (selected: LokiTrendRange) =>
    setLokiState({
      lokiRangeHistory: [...session.lokiRangeHistory, range],
      lokiTimeRange: customRange(selected),
    })
  const restoreRange = (reset = false) => {
    const history = session.lokiRangeHistory
    const prior = reset ? history[0] : history.at(-1)
    if (prior)
      setLokiState({
        lokiTimeRange: prior,
        lokiRangeHistory: reset ? [] : history.slice(0, -1),
      })
  }
  const resultFilter = (
    source: LokiFilterSource,
    key: string,
    value: string,
    exclude: boolean,
    parser?: LokiParserKind,
  ) => {
    const levelField = /^(severity|severity_text|level|loglevel|log_level)$/i.test(
      key,
    )
    if (
      source === 'local' ||
      (source === 'parsed-field' && !parser) ||
      mode !== 'builder'
    ) {
      if (levelField) setLocalLevelFilter({ value, exclude })
      return
    }
    setLocalLevelFilter(null)
    const isLevelAlias = (field: string) =>
      /^(severity|severity_text|level|loglevel|log_level)$/i.test(field)
    if (source === 'label')
      setLokiState({
        lokiBuilder: {
          ...builder,
          labelMatchers: [
            ...builder.labelMatchers.filter((matcher) =>
              levelField ? !isLevelAlias(matcher.label) : matcher.label !== key,
            ),
            { label: key, operator: exclude ? '!=' : '=', value },
          ],
          fieldFilters: levelField
            ? builder.fieldFilters.filter(
                (filter) => !isLevelAlias(filter.field),
              )
            : builder.fieldFilters,
        },
      })
    else
      setLokiState({
        lokiBuilder: {
          ...builder,
          parsers:
            parser && !builder.parsers.some((stage) => stage.kind === parser)
              ? [...builder.parsers, { kind: parser }]
              : builder.parsers,
          labelMatchers: levelField
            ? builder.labelMatchers.filter(
                (matcher) => !isLevelAlias(matcher.label),
              )
            : builder.labelMatchers,
          fieldFilters: [
            ...builder.fieldFilters.filter((filter) =>
              levelField ? !isLevelAlias(filter.field) : filter.field !== key,
            ),
            { field: key, operator: exclude ? '!=' : '=', value },
          ],
        },
      })
    setMode('builder')
  }
  const format = async () => {
    if (!canLoadMetadata) return
    const original = query
    try {
      setSql(await api.connections.loki.formatQuery(connectionId, original))
      notify({ message: 'Formatted', duration: 2600 })
    } catch (caught) {
      setError(
        `Formatting failed; query was not changed. ${caught instanceof Error ? caught.message : String(caught)}`,
      )
    }
  }
  const onSeriesVisibilityChange = useCallback(
    (visibility: Record<string, boolean>) =>
      setSeriesVisibility(visibility, session.id),
    [setSeriesVisibility, session.id],
  )
  const onAddResultFilter = useCallback(
    (filter: ResultFilter) => addResultFilter('sql', filter, session.id),
    [addResultFilter, session.id],
  )
  const onRemoveResultFilter = useCallback(
    (id: string) => removeResultFilter('sql', id, session.id),
    [removeResultFilter, session.id],
  )
  const onClearResultFilters = useCallback(
    () => clearResultFilters('sql', session.id),
    [clearResultFilters, session.id],
  )
  const onMetricVisualizationChange = useCallback(
    (next: VisualizationConfiguration) =>
      setVisualization('sql', next, session.id),
    [setVisualization, session.id],
  )
  const filteredLogRows = useMemo(
    () =>
      result?.resultKind === 'logs'
        ? (applyResultFilters(
            sortLokiLogRowsNewestFirst(result.logRows),
            session.sqlResultFilters,
          ) as LokiLogResult['logRows']).filter((row) =>
            !localLevelFilter ||
            (localLevelFilter.exclude
              ? row.severity !== localLevelFilter.value
              : row.severity === localLevelFilter.value),
          )
        : [],
    [result, session.sqlResultFilters, localLevelFilter],
  )
  const scopedLogRows = useMemo(
    () =>
      patternScope
        ? filteredLogRows.filter(({ id }) => patternScope.memberIds.has(id))
        : filteredLogRows,
    [filteredLogRows, patternScope],
  )
  const scopedResult = useMemo(
    () =>
      result?.resultKind === 'logs'
        ? {
            ...result,
            rows: scopedLogRows,
            logRows: scopedLogRows,
            rowCount: scopedLogRows.length,
          }
        : result,
    [result, scopedLogRows],
  )

  const patternMessagesById = useMemo(
    () =>
      new Map(filteredLogRows.map((row) => [row.id, effectiveLogMessage(row)])),
    [filteredLogRows],
  )
  const viewPatternLogs = useCallback(
    (cluster: LogPatternCluster) => {
      const candidate = derivePatternLineContainsCandidate(
        cluster,
        patternMessagesById,
      )
      const existingLineFilter = builder.lineFilters[0]
      const canUseVisibleBuilderFilter =
        mode === 'builder' &&
        !metadataRefreshing &&
        (builder.lineFilters.length === 0 ||
          (builder.lineFilters.length === 1 &&
            existingLineFilter.operator === '|=' &&
            candidate?.includes(existingLineFilter.value)))

      if (candidate && canUseVisibleBuilderFilter) {
        const nextBuilder = {
          ...builder,
          lineFilters: [{ operator: '|=' as const, value: candidate }],
        }
        try {
          const nextExpression = buildLokiQuery(nextBuilder, {
            fallbackMatcher,
          })
          setPatternScope(null)
          setLokiState({
            lokiBuilder: nextBuilder,
            lokiResultView: 'list',
          })
          setMode('builder')
          void executeExpression(nextExpression)
          return
        } catch {
          // If the next Builder query cannot be represented safely, retain the
          // explicit local member filter below instead of changing query semantics.
        }
      }

      setPatternScope({
        template: cluster.template,
        memberIds: new Set(cluster.memberIds),
      })
      setLokiState({ lokiResultView: 'list' })
    },
    [
      builder,
      executeExpression,
      fallbackMatcher,
      metadataRefreshing,
      mode,
      patternMessagesById,
      setLokiState,
      setMode,
    ],
  )

  return (
    <main className={styles.workspace} aria-label="Loki explorer">
      <section className={styles.queryPanel}>
        <QueryToolbar
          className={styles.queryToolbar}
          mode={<ModeSwitch />}
          options={
            <div className={styles.queryOptions}>
              <TimeRangeField
                labelVisibility="sr-only"
                value={range}
                onChange={(value) => setLokiState({ lokiTimeRange: value })}
              />
              <TextInput
                label="Limit"
                mode="inline"
                type="number"
                min={1}
                max={5000}
                value={limit}
                onValueChange={(text) =>
                  setLokiState({
                    lokiResultLimit: Math.max(1, Math.min(5000, Number(text))),
                  })
                }
              />
              {session.lokiRangeHistory.length > 0 && (
                <div className={styles.rangeHistory}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => restoreRange()}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => restoreRange(true)}
                  >
                    Reset range
                  </button>
                </div>
              )}
            </div>
          }
          utilities={
            <QueryUtilityActions
              busy={loading}
              onBeforeReset={clearLokiTransientState}
              onPresetLoaded={clearLokiTransientState}
            />
          }
          editorActions={
            <div className={styles.editorActions}>
              {mode === 'logql' && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void format()}
                  disabled={!canLoadMetadata || !query.trim()}
                >
                  Format
                </button>
              )}
              <CopySqlButton sql={expression} language="LogQL" />
              <GrafanaHandoffActions
                profile={profile?.kind === 'loki' ? profile : undefined}
                query={expression}
                range={range}
              />
            </div>
          }
          execution={
            <button
              className="btn primary"
              type="button"
              onClick={() => void run()}
              disabled={metadataRefreshing || loading || !expression.trim()}
              title="Run (Ctrl/Command+Enter)"
              aria-describedby={
                builderDisabledReason ? 'loki-builder-run-reason' : undefined
              }
            >
              {loading ? 'Running…' : 'Run'}
            </button>
          }
        />
        <div
          className={`${styles.queryBody}${
            mode === 'logql' ? ` ${styles.rawQueryBody}` : ''
          }`}
        >
          {mode === 'logql' ? (
            <QueryCodeEditor
              value={query}
              height="100%"
              extensions={[logql()]}
              onChange={(value) => setSql(value)}
              aria-label="LogQL editor"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void run()
                }
              }}
            />
          ) : (
            <LokiBuilderPanel
              value={builder}
              generated={displayedGenerated}
              labels={labels}
              connectionId={connectionId}
              connectionGeneration={connectionGeneration}
              canLoadMetadata={canLoadMetadata}
              bounds={labelResource.bounds}
              groupBy={groupBy}
              metadataStatus={labelResource.status}
              metadataError={labelResource.error}
              onChange={(lokiBuilder) => setLokiState({ lokiBuilder })}
              onGroupByChange={(lokiGroupBy) => setLokiState({ lokiGroupBy })}
              onOpenLogql={() => {
                setSql(displayedGenerated)
                setMode('sql')
              }}
            />
          )}
        </div>
      </section>
      {resizeHandle}
      {builderDisabledReason && (
        <div
          id="loki-builder-run-reason"
          className={styles.status}
          role="status"
        >
          {builderDisabledReason}
        </div>
      )}
      {error && (
        <div className={`${styles.status} ${styles.error}`} role="alert">
          {error}
        </div>
      )}
      {canLoadMetadata && labelResource.status === 'error' && (
        <div className={styles.status}>
          Metadata unavailable: {labelResource.error}. Raw LogQL remains
          available.
        </div>
      )}
      {warning && <div className={styles.status}>{warning}</div>}
      <section className={styles.results} aria-label="Loki query results">
        {result?.resultKind === 'logs' ? (
          <>
            <div className={styles.resultViewBar}>
              <ChartPicker
                value={resultView}
                availableViews={[
                  'list',
                  'table',
                  'patterns',
                  'bar',
                  'line',
                  'area',
                  'scatter',
                  'treemap',
                  'sunburst',
                ]}
                onChange={(view: ChartPickerView) =>
                  setLokiState({ lokiResultView: view as typeof resultView })
                }
              />
              {resultView !== 'list' && session.lokiRangeHistory.length > 0 && (
                <div className={styles.rangeHistory}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => restoreRange()}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => restoreRange(true)}
                  >
                    Reset range
                  </button>
                </div>
              )}
            </div>
            {patternScope &&
              (resultView === 'list' || resultView === 'table') && (
                <div className={styles.status} role="status">
                  Local pattern filter: <code>{patternScope.template}</code> ·{' '}
                  {scopedLogRows.length} logs
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setPatternScope(null)}
                  >
                    Clear
                  </button>
                </div>
              )}
            {localLevelFilter && (
              <div className={styles.status} role="status">
                Local level filter:{' '}
                <strong>
                  {localLevelFilter.exclude ? 'not ' : ''}
                  {localLevelFilter.value.toUpperCase()}
                </strong>{' '}
                — loaded logs only.
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setLocalLevelFilter(null)}
                >
                  Clear
                </button>
              </div>
            )}
            <div className={styles.selectedView}>
              {resultView === 'list' ? (
                <LogResultExplorer
                  selectionKey={`${session.id}:${revision.current}`}
                  rows={scopedLogRows}
                  truncated={result.execution?.truncated}
                  limit={limit}
                  onFilter={resultFilter}
                />
              ) : resultView === 'patterns' ? (
                <LogPatternExplorer
                  rows={filteredLogRows}
                  onViewLogs={viewPatternLogs}
                />
              ) : resultView === 'table' ? (
                <GenericResultExplorer
                  mode="sql"
                  dimensionControls="result"
                  externalSeriesColumns={EMPTY_LOKI_EXTERNAL_SERIES_COLUMNS}
                  hasRun
                  result={scopedResult}
                  resultRevision={session.resultRevision}
                  running={session.running}
                  error={session.queryError}
                  isResultStale={session.isResultStale}
                  reconnecting={connectionStatus === 'reconnecting'}
                  configuration={{ ...trendVisualization, view: 'table' }}
                  seriesVisibility={session.seriesVisibility}
                  activeFilters={session.sqlResultFilters}
                  hidePicker
                  onConfigurationChange={setTrendVisualization}
                  onSeriesVisibilityChange={onSeriesVisibilityChange}
                  onAddFilter={onAddResultFilter}
                  onRemoveFilter={onRemoveResultFilter}
                  onClearFilters={onClearResultFilters}
                  onReconnect={() => void reconnectActiveProfile()}
                />
              ) : trendError ? (
                <div className={styles.empty}>
                  Log volume unavailable: {trendError}
                </div>
              ) : trend?.resultKind === 'metrics' ? (
                <GenericResultExplorer
                  mode="sql"
                  dimensionControls="result"
                  externalSeriesColumns={EMPTY_LOKI_EXTERNAL_SERIES_COLUMNS}
                  hasRun
                  result={trend}
                  resultRevision={session.resultRevision}
                  running={session.running}
                  error={session.queryError}
                  isResultStale={session.isResultStale}
                  reconnecting={connectionStatus === 'reconnecting'}
                  configuration={trendVisualization}
                  seriesVisibility={session.seriesVisibility}
                  activeFilters={session.sqlResultFilters}
                  hidePicker
                  onConfigurationChange={setTrendVisualization}
                  onSeriesVisibilityChange={onSeriesVisibilityChange}
                  onAddFilter={onAddResultFilter}
                  onRemoveFilter={onRemoveResultFilter}
                  onClearFilters={onClearResultFilters}
                  onReconnect={() => void reconnectActiveProfile()}
                  onTemporalRangeSelected={selectRange}
                />
              ) : (
                <div className={styles.empty}>Loading log volume…</div>
              )}
            </div>
          </>
        ) : result?.resultKind === 'metrics' ? (
          <GenericResultExplorer
            mode="sql"
            dimensionControls="result"
            externalSeriesColumns={EMPTY_LOKI_EXTERNAL_SERIES_COLUMNS}
            hasRun
            result={session.result}
            resultRevision={session.resultRevision}
            running={session.running}
            error={session.queryError}
            isResultStale={session.isResultStale}
            reconnecting={connectionStatus === 'reconnecting'}
            configuration={session.sqlVisualization}
            seriesVisibility={session.seriesVisibility}
            activeFilters={session.sqlResultFilters}
            onConfigurationChange={onMetricVisualizationChange}
            onSeriesVisibilityChange={onSeriesVisibilityChange}
            onAddFilter={onAddResultFilter}
            onRemoveFilter={onRemoveResultFilter}
            onClearFilters={onClearResultFilters}
            onReconnect={() => void reconnectActiveProfile()}
          />
        ) : (
          !loading && (
            <div className={styles.empty}>
              Run a LogQL investigation to see results.
            </div>
          )
        )}
      </section>
    </main>
  )
}
