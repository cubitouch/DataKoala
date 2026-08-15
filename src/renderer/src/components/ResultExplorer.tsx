import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type EChartsReact from 'echarts-for-react'
import { api } from '../lib/api'
import { buildChartPresentationOptions } from '../lib/chartPresentation'
import { chartSeriesResultFilters, timeBucketRange, type ChartPointContext } from '../lib/chartPointFilters'
import { chartTimeSelectionRange, isTemporalChartValues } from '../lib/chartRangeSelection'
import { createResultFilter, createResultRangeFilter, filterQueryResult, resultFilterDemotion } from '../lib/resultFilters'
import { isBuilderFilterPromotable } from '../lib/builderSql'
import { decodeBuilderSeriesTuple, deriveEffectiveVisualization, numericColumns, pivotRowsForChart, reconcileHierarchyDimensions, visualizationConfigurationsEqual, type ValueAxisScale } from '../lib/resultVisualization'
import { selectActiveSession, selectSession, useStore, type QueryMode } from '../store/useStore'
import { ResultsTable } from './ResultsTable'
import { ChartFilterPopover, type ChartFilterAction } from './result-filters/ChartFilterPopover'
import { ResultFilterBar } from './result-filters/ResultFilterBar'
import { captureChartPng, chartCapturePixelRatio, copyChartPng, exportChartPng, isChartActionDisabled } from '../lib/chartImage'
import { ChartReadinessController, createChartRevision, type ChartRevision } from '../lib/chartReadiness'
import { isolateSeries, reconcileSeriesVisibility, showAllSeries } from '../lib/chartVisibility'
import { prepareLogScaleSeries } from '../lib/chartAxisScale'
import { hasLegendModifier, LegendModifierBridge } from '../lib/legendModifierBridge'
import { ChartEventBridgeLifecycle } from '../lib/chartEventBridgeLifecycle'
import { ChartAnimationPolicy, createChartFingerprint } from '../lib/chartSemantic'
import { ChartApplicationController, type AppliedChart, type ChartRevisionOrigin } from '../lib/chartApplication'
import { QUERY_LOADING_DELAY_MS } from '../lib/loadingIndicator'
import { chartActionsReady, shouldKeepChartMounted } from '../lib/chartQueryLifecycle'
import { Combobox, MultiCombobox, type ComboboxOption } from './ui/combobox'
import type { ColumnMeta } from '@shared/types'
import { chartAnomalyEligibility, DEFAULT_ANOMALY_OPTIONS, detectChartAnomalies } from '../lib/chartAnomalies'
import { buildHierarchy, hierarchyCardinalities, suggestHierarchyDimensions } from '../lib/chartHierarchy'
import { ChartPicker } from './ChartPicker'

const valueScaleOptions: ComboboxOption[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' }
]

function resultColumnToComboboxOption(column: ColumnMeta): ComboboxOption {
  return { value: column.name, label: column.name, subtitle: column.dataTypeName, keywords: [column.name, column.dataTypeName] }
}

export function ResultExplorer({ mode, hasRun = true }: { mode: QueryMode; hasRun?: boolean }) {
  const tabId = useStore((state) => state.activeTabId)
  const isResultStale = useStore((state) => selectActiveSession(state).isResultStale)
  const connectionStatus = useStore((state) => state.connectionStatus)
  const reconnect = useStore((state) => state.reconnectActiveProfile)
  const result = useStore((state) => selectActiveSession(state).result)
  const resultRevision = useStore((state) => selectActiveSession(state).resultRevision)
  const running = useStore((state) => selectActiveSession(state).running)
  const error = useStore((state) => selectActiveSession(state).queryError)
  const configuration = useStore((state) => {
    const session = selectActiveSession(state)
    return mode === 'sql' ? session.sqlVisualization : session.builderVisualization
  })
  const setVisualization = useStore((state) => state.setVisualization)
  const builderSeries = useStore((state) => selectActiveSession(state).builder.seriesColumns)
  const builder = useStore((state) => selectActiveSession(state).builder)
  const activeFilters = useStore((state) => {
    const session = selectActiveSession(state)
    return mode === 'sql' ? session.sqlResultFilters : session.builderResultFilters
  })
  const addResultFilter = useStore((state) => state.addResultFilter)
  const removeResultFilter = useStore((state) => state.removeResultFilter)
  const clearResultFilters = useStore((state) => state.clearResultFilters)
  const setResultFilterExecution = useStore((state) => state.setResultFilterExecution)
  const seriesVisibility = useStore((state) => selectActiveSession(state).seriesVisibility)
  const setSessionSeriesVisibility = useStore((state) => state.setSeriesVisibility)
  const updateSeriesVisibility = useCallback((next: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => {
    const current = selectSession(useStore.getState(), tabId)?.seriesVisibility ?? {}
    setSessionSeriesVisibility(typeof next === 'function' ? next(current) : next, tabId)
  }, [tabId, setSessionSeriesVisibility])
  const [showRunning, setShowRunning] = useState(false)
  const hoveredSeriesIdentity = useRef<string | undefined>()
  const legendModifiers = useRef(new LegendModifierBridge())
  const chartEvents = useRef<ChartEventBridgeLifecycle | null>(null)
  if (!chartEvents.current) chartEvents.current = new ChartEventBridgeLifecycle(legendModifiers.current, () => { hoveredSeriesIdentity.current = undefined })
  const ref = useRef<EChartsReact | null>(null)
  const chartRevisionRef = useRef<ChartRevision | null>(null)
  const applications = useRef(new ChartApplicationController<Record<string, unknown>>())
  const applicationFrame = useRef<number | null>(null)
  const [appliedChart, setAppliedChart] = useState<AppliedChart<Record<string, unknown>> | null>(null)
  const previousResultRevision = useRef(resultRevision)
  const previousView = useRef(configuration.view)
  const previousVisibility = useRef(seriesVisibility)
  const [pointMenu, setPointMenu] = useState<{ context: ChartPointContext; position: { x: number; y: number } } | null>(null)
  const [renderedRevision, setRenderedRevision] = useState<ChartRevision | null>(null)
  const [capturing, setCapturing] = useState<'copy' | 'export' | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readiness = useRef(new ChartReadinessController())
  const animationPolicy = useRef(new ChartAnimationPolicy())

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    chartEvents.current?.detach()
    if (applicationFrame.current !== null) cancelAnimationFrame(applicationFrame.current)
  }, [])

  useEffect(() => {
    if (!running) { setShowRunning(false); return }
    const timer = window.setTimeout(() => setShowRunning(true), QUERY_LOADING_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [running])

  const effectiveConfiguration = useMemo(
    () => result ? deriveEffectiveVisualization(result, configuration, mode, builderSeries) : configuration,
    [result, configuration, mode, builderSeries]
  )
  useEffect(() => {
    if (mode === 'sql' && result && !visualizationConfigurationsEqual(effectiveConfiguration, configuration)) setVisualization(mode, effectiveConfiguration, tabId)
  }, [result, effectiveConfiguration, configuration, mode, setVisualization, tabId])

  const filteredResult = useMemo(() => result ? filterQueryResult(result, activeFilters) : null, [result, activeFilters])
  const numeric = useMemo(() => filteredResult ? numericColumns(filteredResult) : [], [filteredResult])
  const xAxisOptions = useMemo<ComboboxOption[]>(() => result ? result.columns.map(resultColumnToComboboxOption) : [], [result])
  const yAxisOptions = useMemo<ComboboxOption[]>(() => result ? result.columns.filter((column) => numeric.includes(column.name)).map(resultColumnToComboboxOption) : [], [result, numeric])
  const seriesOptions = useMemo<ComboboxOption[]>(() => result ? result.columns.filter((column) => column.name !== effectiveConfiguration.xColumn && column.name !== effectiveConfiguration.valueColumn).map(resultColumnToComboboxOption) : [], [result, effectiveConfiguration.xColumn, effectiveConfiguration.valueColumn])
  const sqlSeriesValues = useMemo(() => effectiveConfiguration.seriesColumns?.length
    ? effectiveConfiguration.seriesColumns
    : effectiveConfiguration.seriesColumn ? [effectiveConfiguration.seriesColumn] : [], [effectiveConfiguration.seriesColumn, effectiveConfiguration.seriesColumns])
  const availableHierarchyDimensions = mode === 'builder' ? builderSeries : sqlSeriesValues
  const hierarchyDimensions = reconcileHierarchyDimensions(effectiveConfiguration.hierarchyDimensions, availableHierarchyDimensions)
  const hierarchyStats = useMemo(() => hierarchyCardinalities(filteredResult?.rows ?? [], hierarchyDimensions), [filteredResult, hierarchyDimensions.join('\0')])
  const suggestedHierarchyDimensions = useMemo(() => suggestHierarchyDimensions(filteredResult?.rows ?? [], hierarchyDimensions), [filteredResult, hierarchyDimensions.join('\0')])
  const hierarchy = useMemo(() => buildHierarchy({ rows: filteredResult?.rows ?? [], dimensions: hierarchyDimensions, valueColumn: effectiveConfiguration.valueColumn, aggregation: effectiveConfiguration.aggregation }), [filteredResult, hierarchyDimensions.join('\0'), effectiveConfiguration.valueColumn, effectiveConfiguration.aggregation])
  const chart = useMemo(() => filteredResult ? pivotRowsForChart(filteredResult, effectiveConfiguration) : null, [filteredResult, effectiveConfiguration])
  const anomalyEligibility = useMemo(() => chartAnomalyEligibility(chart, effectiveConfiguration.view, filteredResult?.columns.find((column) => column.name === effectiveConfiguration.xColumn)), [chart, effectiveConfiguration.view, effectiveConfiguration.xColumn, filteredResult])
  const anomalies = useMemo(() => effectiveConfiguration.anomalyDetectionEnabled && anomalyEligibility.available && chart
    ? detectChartAnomalies(chart.series, DEFAULT_ANOMALY_OPTIONS) : [], [chart, effectiveConfiguration.anomalyDetectionEnabled, anomalyEligibility.available])
  const temporalRangeSelectionEnabled = Boolean(chart?.renderable && effectiveConfiguration.xColumn && isTemporalChartValues(chart.xValues))
  const activeBuilderTimeBucket = mode === 'builder' && effectiveConfiguration.xColumn === 'time_bucket' ? builder.timeBucket : undefined
  const seriesIdentities = chart?.series.map((series) => series.name) ?? []
  useEffect(() => updateSeriesVisibility((previous) => reconcileSeriesVisibility(previous, seriesIdentities)), [seriesIdentities.join('\0'), updateSeriesVisibility])
  const logPresentation = useMemo(() => effectiveConfiguration.valueAxisScale === 'log' ? prepareLogScaleSeries(chart?.series ?? [], seriesVisibility) : null, [chart, seriesVisibility, effectiveConfiguration.valueAxisScale])
  const update = (patch: Parameters<typeof setVisualization>[1]) => setVisualization(mode, patch, tabId)
  const updateSqlSeries = (values: string[]) => update(values.length > 1
    ? { seriesColumn: null, seriesColumns: values }
    : { seriesColumn: values[0] ?? null, seriesColumns: [] })
  const hierarchical = effectiveConfiguration.view === 'treemap' || effectiveConfiguration.view === 'sunburst'
  const chartReady = hierarchical
    ? Boolean(hierarchyDimensions.length && effectiveConfiguration.valueColumn)
    : Boolean(effectiveConfiguration.xColumn && effectiveConfiguration.valueColumn)
  const option = useMemo(() => (hierarchical || chart?.renderable) && chartReady ? buildChartPresentationOptions({
    labels: chart?.labels ?? [], series: chart?.series ?? [], view: effectiveConfiguration.view,
    hasSeriesColumn: Boolean(effectiveConfiguration.seriesColumn || effectiveConfiguration.seriesColumns?.length), mode,
    timeBucket: activeBuilderTimeBucket,
    valueAxisScale: effectiveConfiguration.valueAxisScale, visibility: seriesVisibility,
    hoveredSeriesIdentity: () => hoveredSeriesIdentity.current,
    anomalies,
    rangeSelectionEnabled: temporalRangeSelectionEnabled && !hierarchical,
    hierarchy
  }) : null, [chart, chartReady, effectiveConfiguration, seriesVisibility, mode, activeBuilderTimeBucket, temporalRangeSelectionEnabled, anomalies, hierarchy, hierarchical])
  const setHierarchyDimensions = (dimensions: string[]) => update({ hierarchyDimensions: dimensions })
  const chooseView = (view: typeof effectiveConfiguration.view) => {
    const enteringHierarchy = view === 'treemap' || view === 'sunburst'
    const savedHierarchy = reconcileHierarchyDimensions(configuration.hierarchyDimensions, availableHierarchyDimensions)
    const hierarchyOrder = configuration.hierarchyDimensions?.length ? savedHierarchy : suggestedHierarchyDimensions
    update({ view, ...(enteringHierarchy ? { hierarchyDimensions: hierarchyOrder } : {}) })
  }
  const moveHierarchyDimension = (index: number, offset: number) => {
    const next = [...hierarchyDimensions]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setHierarchyDimensions(next)
  }
  const chartFingerprint = useMemo(
    () => `${resultRevision}:${createChartFingerprint(chart, effectiveConfiguration, seriesVisibility)}:${mode}:${activeBuilderTimeBucket ?? ''}:hierarchy=${hierarchical ? JSON.stringify(hierarchy) : ''}:anomalies=${anomalies.map((item) => `${item.seriesName}:${item.dataIndex}`).join(',')}`,
    [resultRevision, chart, effectiveConfiguration, seriesVisibility, mode, activeBuilderTimeBucket, hierarchy, hierarchical, anomalies]
  )
  const renderedOption = useMemo(() => option ? {
    ...option,
    // Deterministic real-renderer captures should never sample ECharts mid-transition.
    // smokeMode is exposed only by the controlled Electron preview/smoke process.
    animation: window.datakoala?.smokeMode ? false : animationPolicy.current.shouldAnimate(chartFingerprint)
  } : null, [chartFingerprint])
  const chartRevision = useMemo(createChartRevision, [chartFingerprint])
  useEffect(() => {
    if (!renderedOption) return
    const origin: ChartRevisionOrigin = resultRevision !== previousResultRevision.current ? 'query-result'
      : effectiveConfiguration.view !== previousView.current ? 'view'
        : seriesVisibility !== previousVisibility.current ? 'series-visibility' : 'configuration'
    previousResultRevision.current = resultRevision; previousView.current = effectiveConfiguration.view; previousVisibility.current = seriesVisibility
    const supersedes = applications.current.getPending()?.fingerprint ?? applications.current.getApplied()?.fingerprint
    applications.current.request({ revision: chartRevision, fingerprint: chartFingerprint, option: renderedOption, origin })
    if (import.meta.env.DEV) console.debug('[chart-application] candidate', { fingerprint: chartFingerprint, origin, supersedes })
    if (applicationFrame.current !== null) cancelAnimationFrame(applicationFrame.current)
    applicationFrame.current = requestAnimationFrame(() => {
      applicationFrame.current = null
      const applied = applications.current.applyPending()
      if (!applied) return
      chartRevisionRef.current = applied.revision
      readiness.current.commitRevision(applied.revision)
      if (import.meta.env.DEV) console.debug('[chart-application] apply', { token: applied.token, fingerprint: applied.fingerprint, animation: applied.option.animation })
      setAppliedChart(applied)
    })
  }, [chartRevision, chartFingerprint, renderedOption, resultRevision, effectiveConfiguration.view, seriesVisibility])
  const hasRenderableChart = Boolean(appliedChart && result?.rows.length && filteredResult?.rows.length)
  const setChartRef = useCallback((instance: EChartsReact | null) => {
    ref.current = instance
    const echarts = instance?.getEchartsInstance() ?? null
    chartEvents.current?.attach(echarts)
    if (echarts && chartRevisionRef.current) readiness.current.commitRevision(chartRevisionRef.current)
    if (echarts && temporalRangeSelectionEnabled) {
      echarts.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
    }
  }, [temporalRangeSelectionEnabled])
  useEffect(() => {
    if (ref.current && appliedChart) readiness.current.commitRevision(appliedChart.revision)
    const echarts = ref.current?.getEchartsInstance()
    if (!echarts) return
    if (temporalRangeSelectionEnabled) {
      echarts.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
    } else {
      echarts.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } })
      echarts.dispatchAction({ type: 'brush', areas: [] })
    }
  }, [appliedChart, temporalRangeSelectionEnabled])
  const chartRendered = chartActionsReady(Boolean(appliedChart && renderedRevision === appliedChart.revision), running, error)
  const image = async (revision: ChartRevision) => {
    const instance = ref.current?.getEchartsInstance()
    if (!instance) throw new Error('Chart is not available')
    const png = await captureChartPng(instance, chartCapturePixelRatio(window.devicePixelRatio))
    if (!readiness.current.isCurrentRevision(revision)) throw new Error('Chart changed while capturing')
    return png
  }
  const feedback = (message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setCopyFeedback(message)
    feedbackTimer.current = setTimeout(() => setCopyFeedback(null), 1800)
  }
  const copyChart = async () => {
    if (!chartRendered || capturing || !appliedChart) return
    const revision = appliedChart.revision
    setCapturing('copy')
    try {
      const ok = await copyChartPng(await image(revision), api.clipboardImage)
      feedback(ok ? 'Chart copied' : 'Could not copy chart')
      if (!ok) console.error('[chart] Clipboard image write was rejected')
    } catch (error) {
      console.error('[chart] Could not copy chart', error)
      feedback('Could not copy chart')
    } finally { setCapturing(null) }
  }
  const exportPng = async () => {
    if (!chartRendered || capturing || !appliedChart) return
    const revision = appliedChart.revision
    setCapturing('export')
    try {
      const outcome = await exportChartPng(() => image(revision), api.export.saveBinary)
      if (outcome === 'saved') feedback('Chart exported')
    } catch (error) {
      console.error('[chart] Could not export chart', error)
      feedback('Could not export chart')
    } finally { setCapturing(null) }
  }
  const dismissPointMenu = useCallback(() => setPointMenu(null), [])
  const onBrushEnd = (params: { areas?: Array<{ coordRange?: unknown[] }> }) => {
    if (!temporalRangeSelectionEnabled || !chart?.renderable || !effectiveConfiguration.xColumn) return
    const range = chartTimeSelectionRange(params.areas?.[0]?.coordRange ?? [], chart.xValues, activeBuilderTimeBucket)
    if (!range) return
    addResultFilter(mode, createResultRangeFilter(effectiveConfiguration.xColumn, range.startInclusive, range.endExclusive), tabId)
    const instance = ref.current?.getEchartsInstance()
    instance?.dispatchAction({ type: 'brush', areas: [] })
    instance?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
  }
  const onChartClick = (params: { componentType?: string; dataIndex?: number; seriesIndex?: number; event?: { event?: MouseEvent; offsetX?: number; offsetY?: number } }) => {
    if (params.componentType !== 'series' || !chart?.renderable || !effectiveConfiguration.xColumn || params.dataIndex == null || params.seriesIndex == null) return
    const xValue = chart.xValues[params.dataIndex]
    const seriesValue = chart.seriesValues[params.seriesIndex] ?? null
    const tuple = decodeBuilderSeriesTuple(seriesValue)
    const directSeriesColumn = effectiveConfiguration.seriesColumn && effectiveConfiguration.seriesColumn !== 'series' ? effectiveConfiguration.seriesColumn : null
    const seriesFilters = tuple?.map(({ column, value }) => ({ column, value })) ?? (directSeriesColumn ? [{ column: directSeriesColumn, value: seriesValue }] : undefined)
    const native = params.event?.event
    const bounds = ref.current?.getEchartsInstance().getDom().getBoundingClientRect()
    setPointMenu({
      context: {
        xColumn: effectiveConfiguration.xColumn,
        xValue,
        seriesColumn: effectiveConfiguration.seriesColumn ?? (effectiveConfiguration.seriesColumns?.length ? 'series' : null),
        seriesValue,
        seriesFilters,
        timeBucket: activeBuilderTimeBucket
      },
      position: {
        x: native?.clientX ?? (bounds?.left ?? 0) + (params.event?.offsetX ?? 0),
        y: native?.clientY ?? (bounds?.top ?? 0) + (params.event?.offsetY ?? 0)
      }
    })
  }
  const applyPointAction = (action: ChartFilterAction) => {
    if (!pointMenu) return
    const { context } = pointMenu
    if (action === 'includeSeries' || action === 'excludeSeries' || action === 'includeSeriesAndX') {
      const include = action !== 'excludeSeries'
      for (const filter of chartSeriesResultFilters(context, include)) addResultFilter(mode, filter, tabId)
    }
    if (action === 'includeX' || action === 'excludeX' || action === 'includeSeriesAndX') {
      const exclude = action === 'excludeX'
      if (context.timeBucket) {
        const range = timeBucketRange(context.xValue, context.timeBucket)
        if (range) addResultFilter(mode, createResultRangeFilter(context.xColumn, range.startInclusive, range.endExclusive, exclude), tabId)
      } else {
        const operator: 'equals' | 'notEquals' | 'isNull' | 'isNotNull' = context.xValue == null ? (exclude ? 'isNotNull' : 'isNull') : (exclude ? 'notEquals' : 'equals')
        addResultFilter(mode, createResultFilter(context.xColumn, operator, context.xValue), tabId)
      }
    }
    dismissPointMenu()
  }
  const onLegendChange = (params: { name?: string; selected?: Record<string, boolean> }) => {
    if (!params.name) return
    if (hasLegendModifier(legendModifiers.current.consume())) updateSeriesVisibility((current) => isolateSeries(current, seriesIdentities, params.name!))
    else if (params.selected) updateSeriesVisibility(reconcileSeriesVisibility(params.selected, seriesIdentities))
  }
  const onSeriesMouseOver = (params: { componentType?: string; seriesName?: string }) => {
    if (params.componentType === 'series' && params.seriesName) hoveredSeriesIdentity.current = params.seriesName
  }
  const onSeriesMouseOut = (params: { componentType?: string; seriesName?: string }) => {
    if (params.componentType === 'series' && params.seriesName === hoveredSeriesIdentity.current) hoveredSeriesIdentity.current = undefined
  }
  const onChartFinished = () => {
    if (!appliedChart || !hasRenderableChart || !readiness.current.finishRevision(appliedChart.revision) || !applications.current.finish(appliedChart.token)) {
      if (import.meta.env.DEV) console.debug('[chart-application] ignored stale finished event', { token: appliedChart?.token })
      return
    }
    animationPolicy.current.commit(appliedChart.fingerprint)
    setRenderedRevision(appliedChart.revision)
    if (import.meta.env.DEV) console.debug('[chart-application] finished', { token: appliedChart.token, fingerprint: appliedChart.fingerprint })
  }
  const hiddenSeries = seriesIdentities.filter((identity) => seriesVisibility[identity] === false)
  const showChart = shouldKeepChartMounted(effectiveConfiguration.view, Boolean(result))

  if (!hasRun) return <div className="result-explorer"><div className="result-pane"><div className="chart-empty">{mode === 'builder' ? 'Select a table and X axis, then run the query to explore the grouped result.' : 'Run a query to view its results.'}</div></div></div>
  return <div className="result-explorer">
    {result && isResultStale && <div className="stale-result-banner" role="status">
      <span><strong>Disconnected</strong> — showing results from the last successful query.</span>
      <button className="btn ghost" onClick={() => void reconnect()} disabled={connectionStatus === 'reconnecting'}>
        {connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Reconnect'}
      </button>
    </div>}
    {result && <ChartPicker value={effectiveConfiguration.view} onChange={chooseView}/>}
    {effectiveConfiguration.view !== 'table' && result && mode === 'sql' && <div className="visualization-controls">
      <div className="visualization-control"><span>X axis</span><Combobox label="X axis" value={effectiveConfiguration.xColumn ?? ''} options={xAxisOptions} onChange={(value) => update({ xColumn: value || null })} placeholder="Choose…" searchable emptyMessage="No matching columns" /></div>
      <div className="visualization-control"><span>Y axis</span><Combobox label="Y axis" value={effectiveConfiguration.valueColumn ?? ''} options={yAxisOptions} onChange={(value) => update({ valueColumn: value || null })} placeholder={numeric.length ? 'Choose…' : 'No numeric column'} searchable emptyMessage="No matching numeric columns" /></div>
      <div className="visualization-control"><span>Series <span>(optional, multiple)</span></span><MultiCombobox label="Series columns" values={sqlSeriesValues} options={seriesOptions} onChange={updateSqlSeries} placeholder="No breakdown" searchable showChips emptyMessage="No matching columns" /></div>
    </div>}
    {hierarchical && result && <div className="hierarchy-order" aria-label="Hierarchy order">
      <div><strong>Hierarchy</strong><small> Inner → outer · lowest cardinality recommended</small></div>
      <div className="hierarchy-levels">{hierarchyStats.map(({ column, distinctCount }, index) => <div className="hierarchy-level" key={column}><span><b>{index + 1}</b> {column} <small>{distinctCount} values</small></span><button type="button" aria-label={`Move ${column} inward`} title="Move inward" disabled={index === 0} onClick={() => moveHierarchyDimension(index, -1)}>←</button><button type="button" aria-label={`Move ${column} outward`} title="Move outward" disabled={index === hierarchyStats.length - 1} onClick={() => moveHierarchyDimension(index, 1)}>→</button></div>)}</div>
      {hierarchyDimensions.join('\0') !== suggestedHierarchyDimensions.join('\0') && <button className="btn ghost" type="button" onClick={() => setHierarchyDimensions(suggestedHierarchyDimensions)}>Use suggested order</button>}
    </div>}
    {!showChart || !result ? <ResultsTable mode={mode} rawResult={result} filteredResult={filteredResult} activeFilters={activeFilters} resultRevision={resultRevision}/> : <div className="result-chart">
      <div className="result-chart-actions"><span className="stats">{activeFilters.length ? `${filteredResult?.rowCount ?? 0} of ${result.rowCount}` : result.rowCount} rows · {result.columns.length} cols · {result.durationMs} ms</span><div className="spacer"/>{!hierarchical && seriesIdentities.length > 1 && hiddenSeries.length > 0 && <button className="btn ghost" onClick={() => updateSeriesVisibility(showAllSeries(seriesIdentities))}>Show all</button>}{!hierarchical && <div className="axis-scale"><span>Value scale</span><Combobox label="Value axis scale" value={effectiveConfiguration.valueAxisScale ?? 'linear'} options={valueScaleOptions} onChange={(value) => update({ valueAxisScale: value as ValueAxisScale })} /></div>}{!hierarchical && <button className="btn ghost" aria-pressed={Boolean(effectiveConfiguration.anomalyDetectionEnabled)} disabled={!anomalyEligibility.available} title={anomalyEligibility.available ? 'Uses the previous 12 valid points in each Series. Detection uses linear values, including on Log scale.' : anomalyEligibility.reason} onClick={() => update({ anomalyDetectionEnabled: !effectiveConfiguration.anomalyDetectionEnabled })}>Highlight anomalies</button>}<button className="btn ghost" disabled={isChartActionDisabled(chartRendered, capturing !== null)} onClick={copyChart}>{capturing === 'copy' ? 'Copying…' : 'Copy chart'}</button><button className="btn ghost" disabled={isChartActionDisabled(chartRendered, capturing !== null)} onClick={exportPng}>{capturing === 'export' ? 'Exporting…' : 'Export PNG'}</button></div>
      {effectiveConfiguration.anomalyDetectionEnabled && anomalyEligibility.available && <div className="anomaly-status" role="status">{anomalies.length ? `${anomalies.length} ${anomalies.length === 1 ? 'anomaly' : 'anomalies'} detected across ${new Set(anomalies.map((item) => item.seriesName)).size} ${new Set(anomalies.map((item) => item.seriesName)).size === 1 ? 'series' : 'series'}.` : 'No anomalies detected with the current settings.'}</div>}
      <ResultFilterBar filters={activeFilters} onRemove={(id) => removeResultFilter(mode, id, tabId)} onClear={() => clearResultFilters(mode, tabId)} onToggleExecution={mode === 'builder' ? (id) => { const filter = activeFilters.find((item) => item.id === id); if (filter) setResultFilterExecution(mode, id, filter.execution === 'query' ? 'client' : 'query', tabId) } : undefined} canPromote={mode === 'builder' ? (filter) => isBuilderFilterPromotable(filter, { ...builder, xColumn: configuration.xColumn }) : undefined} canDemote={mode === 'builder' ? (filter) => resultFilterDemotion(filter, result?.columns.map((column) => column.name) ?? []) : undefined}/>
      {error && <div className="err-banner" role="alert">{error}</div>}
      {effectiveConfiguration.valueAxisScale === 'log' && (logPresentation?.omittedCount ?? 0) > 0 && <div className="chart-warning" role="status">Log scale: {logPresentation!.omittedCount} zero or negative {logPresentation!.omittedCount === 1 ? 'point is' : 'points are'} not plotted.</div>}
      {!numeric.length && filteredResult?.rows.length ? <div className="chart-empty">This result does not contain a numeric column that can be used as a Y axis.</div> : !chartReady ? <div className="chart-empty">{hierarchical ? 'Choose at least one Series dimension and a Y axis to render this hierarchy.' : 'Choose an X axis and Y axis column to render a chart.'}</div> : result.rows.length === 0 ? <div className="chart-empty">Query returned no rows.</div> : filteredResult?.rows.length === 0 ? <div className="chart-empty">No rows match the active filters.</div> : !hierarchical && chart && !chart.renderable ? <div className="chart-empty" role="alert">{chart.rejectionReason === 'too-many-series' ? 'Too many series to chart: more than 100.' : 'This chart would contain more than 100,000 points.'}<br/>{activeBuilderTimeBucket ? 'Filter the result, narrow the time range, increase the bucket size, or choose another Series dimension.' : 'Filter the result, reduce Series cardinality, or choose another X axis.'}</div> : !appliedChart ? <div className="result-chart-canvas"/> : <><div className="result-chart-canvas"><ReactECharts ref={setChartRef} option={appliedChart?.option} theme="dark" notMerge onEvents={{ click: hierarchical ? () => {} : onChartClick, brushEnd: onBrushEnd, legendselectchanged: onLegendChange, mouseover: onSeriesMouseOver, mouseout: onSeriesMouseOut, finished: onChartFinished }} style={{ height: '100%', width: '100%' }}/>{showRunning && <div className="chart-running-overlay" role="status">Running…</div>}</div>{chart?.warning && <div className="chart-warning" role="status">{chart.warning} Consider filtering the result or reducing chart cardinality.</div>}</>}
      {copyFeedback && <div className="toast" role="status">{copyFeedback}</div>}
      {pointMenu && <ChartFilterPopover context={pointMenu.context} position={pointMenu.position} onAction={applyPointAction} onDismiss={dismissPointMenu}/>}
    </div>}
  </div>
}
