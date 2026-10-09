import type { DisplayUnit } from '@lib/displayUnit'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import ReactECharts from 'echarts-for-react'
import type EChartsReact from 'echarts-for-react'
import { api } from '@lib/api'
import { AI_LIMITS, isAiConfigured, type AiAnomalyAnalysis } from '@shared/ai'
import { buildChartPresentationOptions } from '@lib/chartPresentation'
import {
  chartSeriesResultFilters,
  timeBucketRange,
  type ChartPointContext,
} from '@lib/chartPointFilters'
import {
  chartTimeSelectionRange,
  effectiveChartTimeDomain,
  expandChartTimeDomainToValues,
  isTemporalChartValues,
} from '@lib/chartRangeSelection'
import {
  createResultFilter,
  createResultRangeFilter,
  filterQueryResult,
  type ResultFilter,
} from '@lib/resultFilters'
import {
  decodeBuilderSeriesTuple,
  deriveEffectiveVisualization,
  numericColumns,
  pivotRowsForChart,
  reconcileHierarchyDimensions,
  visualizationConfigurationsEqual,
  type ValueAxisScale,
  type VisualizationConfiguration,
} from '@lib/resultVisualization'
import { ResultsTable } from './ResultsTable'
import {
  ChartFilterPopover,
  type ChartFilterAction,
} from './filters/ChartFilterPopover'
import { ResultFilterBar } from './filters/ResultFilterBar'
import {
  captureChartPng,
  chartCapturePixelRatio,
  copyChartPng,
  exportChartPng,
  isChartActionDisabled,
} from '@lib/chartImage'
import { notifyChartCopyResult } from '@lib/chartCopyNotification'
import {
  ChartReadinessController,
  createChartRevision,
  type ChartRevision,
} from '@lib/chartReadiness'
import {
  isolateSeries,
  reconcileSeriesVisibility,
  showAllSeries,
  toggleSeries,
} from '@lib/chartVisibility'
import { prepareLogScaleSeries } from '@lib/chartAxisScale'
import { ChartEventBridgeLifecycle } from '@lib/chartEventBridgeLifecycle'
import {
  ChartAnimationPolicy,
  createChartFingerprint,
  semanticChartCounts,
} from '@lib/chartSemantic'
import {
  ChartApplicationController,
  type AppliedChart,
  type ChartRevisionOrigin,
} from '@lib/chartApplication'
import { QUERY_LOADING_DELAY_MS } from '@lib/loadingIndicator'
import {
  chartActionsReady,
  shouldKeepChartMounted,
} from '@lib/chartQueryLifecycle'
import {
  Combobox,
  MultiCombobox,
  type ComboboxOption,
} from '@components/ui/combobox'
import type { ColumnMeta, QueryResult } from '@shared/types'
import { sampleChartSeries } from '@lib/chartAnomalySampling'
import {
  resolveAiAnomalies,
  type SubmittedAnomalySeries,
} from '@lib/chartAnomalyMapping'
import { AiAnomalyDetailsPopover } from './AiAnomalyDetailsPopover'
import {
  buildHierarchy,
  hierarchyCardinalities,
  suggestHierarchyDimensions,
} from '@lib/chartHierarchy'
import { ChartPicker } from './ChartPicker'
import styles from './ResultExplorer.module.css'
import { chartLegendEntries } from '@lib/chartLegend'
import {
  ChartLegend,
  ChartLegendResizer,
  DEFAULT_CHART_LEGEND_WIDTH,
  MAX_CHART_LEGEND_WIDTH,
  MIN_CHART_LEGEND_WIDTH,
} from './ChartLegend'

const CHART_LEGEND_WIDTH_STORAGE_KEY = 'datakoala.chartLegendWidth'

function readChartLegendWidth() {
  try {
    const stored = Number(localStorage.getItem(CHART_LEGEND_WIDTH_STORAGE_KEY))
    return Number.isFinite(stored) && stored >= MIN_CHART_LEGEND_WIDTH
      ? Math.min(MAX_CHART_LEGEND_WIDTH, stored)
      : DEFAULT_CHART_LEGEND_WIDTH
  } catch {
    return DEFAULT_CHART_LEGEND_WIDTH
  }
}

const valueScaleOptions: ComboboxOption[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
]

function resultColumnToComboboxOption(column: ColumnMeta): ComboboxOption {
  return {
    value: column.name,
    label: column.name,
    subtitle: column.dataTypeName,
    keywords: [column.name, column.dataTypeName],
  }
}

export interface GenericResultExplorerProps {
  mode: 'sql' | 'builder'
  dimensionControls?: 'result' | 'external'
  hasRun?: boolean
  result: QueryResult | null
  resultRevision: number
  running: boolean
  error: string | null
  errorAction?: ReactNode
  isResultStale: boolean
  reconnecting?: boolean
  configuration: VisualizationConfiguration
  seriesVisibility: Record<string, boolean>
  activeFilters: ResultFilter[]
  externalSeriesColumns?: string[]
  timeBucket?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
  chartTimeDomain?: { min: number; max: number } | null
  hidePicker?: boolean
  onConfigurationChange: (configuration: VisualizationConfiguration) => void
  onSeriesVisibilityChange: (visibility: Record<string, boolean>) => void
  onAddFilter: (filter: ResultFilter) => void
  onRemoveFilter: (id: string) => void
  onClearFilters: () => void
  onToggleFilterExecution?: (id: string) => void
  canPromoteTableFilter?: (filter: ResultFilter) => boolean
  canPromoteChartFilter?: (filter: ResultFilter) => boolean
  canDemoteFilter?: (filter: ResultFilter) => {
    allowed: boolean
    reason?: string
  }
  onReconnect?: () => void
  onTemporalRangeSelected?: (range: { startMs: number; endMs: number }) => void
}
export function GenericResultExplorer({
  mode,
  dimensionControls = 'result',
  hasRun = true,
  result,
  resultRevision,
  running,
  error,
  errorAction,
  isResultStale,
  reconnecting = false,
  configuration,
  seriesVisibility,
  activeFilters,
  externalSeriesColumns = [],
  timeBucket,
  chartTimeDomain = null,
  hidePicker = false,
  onConfigurationChange,
  onSeriesVisibilityChange,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  onToggleFilterExecution,
  canPromoteTableFilter,
  canPromoteChartFilter,
  canDemoteFilter,
  onReconnect,
  onTemporalRangeSelected,
}: GenericResultExplorerProps) {
  const updateSeriesVisibility = useCallback(
    (
      next:
        | Record<string, boolean>
        | ((current: Record<string, boolean>) => Record<string, boolean>),
    ) => {
      onSeriesVisibilityChange(
        typeof next === 'function' ? next(seriesVisibility) : next,
      )
    },
    [seriesVisibility, onSeriesVisibilityChange],
  )
  const [showRunning, setShowRunning] = useState(false)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AiAnomalyAnalysis | null>(null)
  const [aiSubmittedSamples, setAiSubmittedSamples] = useState<
    SubmittedAnomalySeries[] | null
  >(null)
  const [aiAnomaliesVisible, setAiAnomaliesVisible] = useState(false)
  const [aiAnalysisError, setAiAnalysisError] = useState('')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const aiContextRevision = useRef(0)
  const aiRequestId = useRef<string | null>(null)
  const [chartLegendWidth, setChartLegendWidth] = useState(readChartLegendWidth)
  const chartCanvasRef = useRef<HTMLDivElement | null>(null)
  const hoveredSeriesIdentity = useRef<string | undefined>(undefined)
  const chartEvents = useRef<ChartEventBridgeLifecycle | null>(null)
  if (!chartEvents.current)
    chartEvents.current = new ChartEventBridgeLifecycle(() => {
      hoveredSeriesIdentity.current = undefined
    })
  const ref = useRef<EChartsReact | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)
  const chartRevisionRef = useRef<ChartRevision | null>(null)
  const applications = useRef(
    new ChartApplicationController<Record<string, unknown>>(),
  )
  const applicationFrame = useRef<number | null>(null)
  const [appliedChart, setAppliedChart] = useState<AppliedChart<
    Record<string, unknown>
  > | null>(null)
  const previousResultRevision = useRef(resultRevision)
  const previousView = useRef(configuration.view)
  const previousVisibility = useRef(seriesVisibility)
  const [pointMenu, setPointMenu] = useState<{
    context: ChartPointContext
    position: { x: number; y: number }
  } | null>(null)
  const [renderedRevision, setRenderedRevision] =
    useState<ChartRevision | null>(null)
  const [capturing, setCapturing] = useState<'copy' | 'export' | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readiness = useRef(new ChartReadinessController())
  const animationPolicy = useRef(new ChartAnimationPolicy())

  useEffect(() => {
    try {
      localStorage.setItem(
        CHART_LEGEND_WIDTH_STORAGE_KEY,
        String(chartLegendWidth),
      )
    } catch {
      // The live width remains usable when browser storage is unavailable.
    }
  }, [chartLegendWidth])

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
      chartEvents.current?.detach()
      if (applicationFrame.current !== null)
        cancelAnimationFrame(applicationFrame.current)
    },
    [],
  )

  useEffect(() => {
    let active = true
    const refresh = () => {
      const getSettings = api?.ai?.settings?.get
      if (!getSettings) {
        setAiConfigured(false)
        return
      }
      void getSettings()
        .then((result) => {
          if (!active) return
          setAiConfigured(result.ok && isAiConfigured(result.value))
        })
        .catch(() => {
          if (active) setAiConfigured(false)
        })
    }
    refresh()
    window.addEventListener('datakoala:ai-settings-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('datakoala:ai-settings-changed', refresh)
    }
  }, [])

  const cancelAiRequest = useCallback(() => {
    const requestId = aiRequestId.current
    if (!requestId) return
    aiRequestId.current = null
    if (api?.ai?.cancel) void api.ai.cancel(requestId)
  }, [])

  useEffect(() => {
    if (!running) {
      setShowRunning(false)
      return
    }
    const timer = window.setTimeout(
      () => setShowRunning(true),
      QUERY_LOADING_DELAY_MS,
    )
    return () => window.clearTimeout(timer)
  }, [running])

  useEffect(() => {
    if (aiConfigured || !aiRequestId.current) return
    aiContextRevision.current += 1
    cancelAiRequest()
    setAiAnalyzing(false)
    setAiAnalysis(null)
    setAiSubmittedSamples(null)
    setAiAnomaliesVisible(false)
  }, [aiConfigured, cancelAiRequest])

  const effectiveConfiguration = useMemo(
    () =>
      result
        ? deriveEffectiveVisualization(
            result,
            configuration,
            dimensionControls === 'external' && mode === 'builder'
              ? 'builder'
              : 'result',
            externalSeriesColumns,
          )
        : configuration,
    [result, configuration, mode, dimensionControls, externalSeriesColumns],
  )
  const aiContextKey = JSON.stringify({
    resultRevision,
    rowCount: result?.rowCount,
    view: effectiveConfiguration.view,
    xColumn: effectiveConfiguration.xColumn,
    valueColumn: effectiveConfiguration.valueColumn,
    seriesColumn: effectiveConfiguration.seriesColumn,
    seriesColumns: effectiveConfiguration.seriesColumns,
    activeFilters,
    chartTimeDomain,
    timeBucket,
  })
  useEffect(() => {
    aiContextRevision.current += 1
    cancelAiRequest()
    setAiAnalyzing(false)
    setAiAnalysis(null)
    setAiSubmittedSamples(null)
    setAiAnomaliesVisible(false)
    setAiAnalysisError('')
  }, [result, aiContextKey, cancelAiRequest])
  useEffect(() => () => cancelAiRequest(), [cancelAiRequest])

  useEffect(() => {
    if (
      dimensionControls === 'result' &&
      result &&
      !visualizationConfigurationsEqual(effectiveConfiguration, configuration)
    ) {
      onConfigurationChange(effectiveConfiguration)
    }
  }, [
    result,
    effectiveConfiguration,
    configuration,
    dimensionControls,
    onConfigurationChange,
  ])

  const filteredResult = useMemo(
    () => (result ? filterQueryResult(result, activeFilters) : null),
    [result, activeFilters],
  )
  const numeric = useMemo(
    () => (filteredResult ? numericColumns(filteredResult) : []),
    [filteredResult],
  )
  const xAxisOptions = useMemo<ComboboxOption[]>(
    () => (result ? result.columns.map(resultColumnToComboboxOption) : []),
    [result],
  )
  const yAxisOptions = useMemo<ComboboxOption[]>(
    () =>
      result
        ? result.columns
            .filter((column) => numeric.includes(column.name))
            .map(resultColumnToComboboxOption)
        : [],
    [result, numeric],
  )
  const seriesOptions = useMemo<ComboboxOption[]>(
    () =>
      result
        ? result.columns
            .filter(
              (column) =>
                column.name !== effectiveConfiguration.xColumn &&
                column.name !== effectiveConfiguration.valueColumn,
            )
            .map(resultColumnToComboboxOption)
        : [],
    [
      result,
      effectiveConfiguration.xColumn,
      effectiveConfiguration.valueColumn,
    ],
  )
  const selectedSeriesValues = useMemo(
    () =>
      effectiveConfiguration.seriesColumns?.length
        ? effectiveConfiguration.seriesColumns
        : effectiveConfiguration.seriesColumn
          ? [effectiveConfiguration.seriesColumn]
          : [],
    [effectiveConfiguration.seriesColumn, effectiveConfiguration.seriesColumns],
  )
  const availableHierarchyDimensions = useMemo(
    () =>
      dimensionControls === 'external' && mode === 'builder'
        ? externalSeriesColumns
        : selectedSeriesValues,
    [dimensionControls, mode, externalSeriesColumns, selectedSeriesValues],
  )
  const hierarchyDimensions = useMemo(
    () =>
      reconcileHierarchyDimensions(
        effectiveConfiguration.hierarchyDimensions,
        availableHierarchyDimensions,
      ),
    [effectiveConfiguration.hierarchyDimensions, availableHierarchyDimensions],
  )
  const hierarchyStats = useMemo(
    () =>
      hierarchyCardinalities(filteredResult?.rows ?? [], hierarchyDimensions),
    [filteredResult, hierarchyDimensions],
  )
  const suggestedHierarchyDimensions = useMemo(
    () =>
      suggestHierarchyDimensions(
        filteredResult?.rows ?? [],
        hierarchyDimensions,
      ),
    [filteredResult, hierarchyDimensions],
  )
  const hierarchy = useMemo(
    () =>
      buildHierarchy({
        rows: filteredResult?.rows ?? [],
        dimensions: hierarchyDimensions,
        valueColumn: effectiveConfiguration.valueColumn,
        aggregation: effectiveConfiguration.aggregation,
      }),
    [
      filteredResult,
      hierarchyDimensions,
      effectiveConfiguration.valueColumn,
      effectiveConfiguration.aggregation,
    ],
  )
  const chart = useMemo(
    () =>
      filteredResult
        ? pivotRowsForChart(filteredResult, effectiveConfiguration)
        : null,
    [filteredResult, effectiveConfiguration],
  )
  const resolvedAiAnomalies = useMemo(
    () =>
      aiAnalysis && aiSubmittedSamples && chart
        ? resolveAiAnomalies(
            aiAnalysis,
            aiSubmittedSamples,
            chart.series,
            chart.xValues,
            seriesVisibility,
          )
        : [],
    [aiAnalysis, aiSubmittedSamples, chart, seriesVisibility],
  )
  const temporalRangeSelectionEnabled = Boolean(
    chart?.renderable &&
    effectiveConfiguration.xColumn &&
    isTemporalChartValues(chart.xValues),
  )
  const filteredTimeDomain = useMemo(
    () =>
      effectiveChartTimeDomain(
        chartTimeDomain,
        activeFilters,
        effectiveConfiguration.xColumn,
      ),
    [chartTimeDomain, activeFilters, effectiveConfiguration.xColumn],
  )
  const effectiveTimeDomain = useMemo(
    () =>
      isResultStale
        ? filteredTimeDomain
        : expandChartTimeDomainToValues(
            filteredTimeDomain,
            chart?.xValues ?? [],
          ),
    [filteredTimeDomain, chart, isResultStale],
  )
  const activeBuilderTimeBucket =
    mode === 'builder' && effectiveConfiguration.xColumn === 'time_bucket'
      ? timeBucket
      : undefined
  const seriesIdentities = useMemo(
    () => chart?.series.map((series) => series.name) ?? [],
    [chart],
  )
  const legendEntries = useMemo(
    () => chartLegendEntries(seriesIdentities),
    [seriesIdentities],
  )
  useEffect(() => {
    const next = reconcileSeriesVisibility(seriesVisibility, seriesIdentities)
    if (next !== seriesVisibility) onSeriesVisibilityChange(next)
  }, [seriesIdentities, seriesVisibility, onSeriesVisibilityChange])
  const logPresentation = useMemo(
    () =>
      effectiveConfiguration.valueAxisScale === 'log'
        ? prepareLogScaleSeries(chart?.series ?? [], seriesVisibility)
        : null,
    [chart, seriesVisibility, effectiveConfiguration.valueAxisScale],
  )
  const update = (patch: Partial<VisualizationConfiguration>) => {
    onConfigurationChange({ ...configuration, ...patch })
  }
  const updateSeries = (values: string[]) =>
    update(
      values.length > 1
        ? { seriesColumn: null, seriesColumns: values }
        : { seriesColumn: values[0] ?? null, seriesColumns: [] },
    )
  const hierarchical =
    effectiveConfiguration.view === 'treemap' ||
    effectiveConfiguration.view === 'sunburst'
  const chartReady = hierarchical
    ? Boolean(hierarchyDimensions.length && effectiveConfiguration.valueColumn)
    : Boolean(
        effectiveConfiguration.xColumn && effectiveConfiguration.valueColumn,
      )
  const option = useMemo(
    () =>
      (hierarchical || chart?.renderable) && chartReady
        ? buildChartPresentationOptions({
            labels: chart?.labels ?? [],
            series: chart?.series ?? [],
            view: effectiveConfiguration.view,
            hasSeriesColumn: Boolean(
              effectiveConfiguration.seriesColumn ||
              effectiveConfiguration.seriesColumns?.length,
            ),
            mode,
            timeBucket: activeBuilderTimeBucket,
            timeDomain: effectiveTimeDomain ?? undefined,
            valueAxisScale: effectiveConfiguration.valueAxisScale,
            displayUnit: effectiveConfiguration.displayUnit,
            visibility: seriesVisibility,
            hoveredSeriesIdentity: () => hoveredSeriesIdentity.current,
            rangeSelectionEnabled:
              temporalRangeSelectionEnabled && !hierarchical,
            hierarchy,
            aiAnomalies: resolvedAiAnomalies,
            showAiAnomalies: aiAnomaliesVisible,
          })
        : null,
    [
      chart,
      chartReady,
      effectiveConfiguration,
      seriesVisibility,
      mode,
      activeBuilderTimeBucket,
      effectiveTimeDomain,
      temporalRangeSelectionEnabled,
      hierarchy,
      hierarchical,
      resolvedAiAnomalies,
      aiAnomaliesVisible,
    ],
  )
  const setHierarchyDimensions = (dimensions: string[]) =>
    update({ hierarchyDimensions: dimensions })
  const chooseView = (view: typeof effectiveConfiguration.view) => {
    const enteringHierarchy = view === 'treemap' || view === 'sunburst'
    const savedHierarchy = reconcileHierarchyDimensions(
      configuration.hierarchyDimensions,
      availableHierarchyDimensions,
    )
    const hierarchyOrder = configuration.hierarchyDimensions?.length
      ? savedHierarchy
      : suggestedHierarchyDimensions
    update({
      view,
      ...(enteringHierarchy ? { hierarchyDimensions: hierarchyOrder } : {}),
    })
  }
  const moveHierarchyDimension = (index: number, offset: number) => {
    const next = [...hierarchyDimensions]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setHierarchyDimensions(next)
  }
  const chartFingerprint = useMemo(
    () =>
      `${resultRevision}:${createChartFingerprint(chart, effectiveConfiguration, seriesVisibility)}:${mode}:${activeBuilderTimeBucket ?? ''}:domain=${effectiveTimeDomain ? `${effectiveTimeDomain.min}-${effectiveTimeDomain.max}` : ''}:requested=${configuration.view}/${configuration.xColumn ?? ''}/${configuration.valueColumn ?? ''}/${configuration.aggregation}/${configuration.seriesColumn ?? ''}/${configuration.seriesColumns?.join(',') ?? ''}:hierarchy=${hierarchical ? JSON.stringify(hierarchy) : ''}`,
    [
      resultRevision,
      chart,
      effectiveConfiguration,
      configuration,
      seriesVisibility,
      mode,
      activeBuilderTimeBucket,
      effectiveTimeDomain,
      hierarchy,
      hierarchical,
    ],
  )
  const renderedOption = useMemo(
    () =>
      option
        ? {
            ...option,
            // Deterministic real-renderer captures should never sample ECharts mid-transition.
            // smokeMode is exposed only by the controlled Electron preview/smoke process.
            animation: window.datakoala?.smokeMode
              ? false
              : animationPolicy.current.shouldAnimate(chartFingerprint),
          }
        : null,
    [chartFingerprint, option],
  )
  const chartRevision = useMemo(createChartRevision, [chartFingerprint])
  useEffect(() => {
    if (!renderedOption) return
    const origin: ChartRevisionOrigin =
      resultRevision !== previousResultRevision.current
        ? 'query-result'
        : effectiveConfiguration.view !== previousView.current
          ? 'view'
          : seriesVisibility !== previousVisibility.current
            ? 'series-visibility'
            : 'configuration'
    previousResultRevision.current = resultRevision
    previousView.current = effectiveConfiguration.view
    previousVisibility.current = seriesVisibility
    const supersedes =
      applications.current.getPending()?.fingerprint ??
      applications.current.getApplied()?.fingerprint
    applications.current.request({
      revision: chartRevision,
      fingerprint: chartFingerprint,
      option: renderedOption,
      origin,
    })
    if (import.meta.env.DEV)
      console.debug('[chart-application] candidate', {
        fingerprint: chartFingerprint,
        origin,
        supersedes,
      })
    if (applicationFrame.current !== null)
      cancelAnimationFrame(applicationFrame.current)
    applicationFrame.current = requestAnimationFrame(() => {
      applicationFrame.current = null
      const applied = applications.current.applyPending()
      if (!applied) return
      chartRevisionRef.current = applied.revision
      readiness.current.commitRevision(applied.revision)
      if (import.meta.env.DEV)
        console.debug('[chart-application] apply', {
          token: applied.token,
          fingerprint: applied.fingerprint,
          animation: applied.option.animation,
        })
      setAppliedChart(applied)
    })
  }, [
    chartRevision,
    chartFingerprint,
    renderedOption,
    resultRevision,
    effectiveConfiguration.view,
    seriesVisibility,
  ])
  const hasRenderableChart = Boolean(
    appliedChart && result?.rows.length && filteredResult?.rows.length,
  )
  const setChartRef = useCallback(
    (instance: EChartsReact | null) => {
      ref.current = instance
      const echarts = instance?.getEchartsInstance() ?? null
      chartEvents.current?.attach(echarts)
      if (echarts && chartRevisionRef.current)
        readiness.current.commitRevision(chartRevisionRef.current)
      if (echarts && temporalRangeSelectionEnabled) {
        echarts.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'brush',
          brushOption: { brushType: 'lineX', brushMode: 'single' },
        })
      }
    },
    [temporalRangeSelectionEnabled],
  )
  useEffect(() => {
    const plot = plotRef.current
    if (!plot || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const echarts = ref.current?.getEchartsInstance()
      if (echarts && !echarts.isDisposed?.()) echarts.resize()
    })
    observer.observe(plot)
    return () => observer.disconnect()
  }, [appliedChart])
  useEffect(() => {
    if (ref.current && appliedChart)
      readiness.current.commitRevision(appliedChart.revision)
    const echarts = ref.current?.getEchartsInstance()
    if (!echarts) return
    if (temporalRangeSelectionEnabled) {
      echarts.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: 'lineX', brushMode: 'single' },
      })
    } else {
      echarts.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: false },
      })
      echarts.dispatchAction({ type: 'brush', areas: [] })
    }
  }, [appliedChart, temporalRangeSelectionEnabled])
  const chartRendered = chartActionsReady(
    Boolean(appliedChart && renderedRevision === appliedChart.revision),
    running,
    error,
  )
  const semanticCounts = semanticChartCounts(appliedChart?.option ?? null)
  const semanticConfiguration = JSON.stringify({
    view: configuration.view,
    x: configuration.xColumn,
    y: configuration.valueColumn,
    series: configuration.seriesColumns?.length
      ? configuration.seriesColumns
      : configuration.seriesColumn
        ? [configuration.seriesColumn]
        : [],
    aggregation: configuration.aggregation,
    resultRevision,
  })
  const image = async (revision: ChartRevision) => {
    const instance = ref.current?.getEchartsInstance()
    if (!instance) throw new Error('Chart is not available')
    const png = await captureChartPng(
      instance,
      chartCapturePixelRatio(window.devicePixelRatio),
      hierarchical ? [] : legendEntries,
      seriesVisibility,
    )
    if (!readiness.current.isCurrentRevision(revision))
      throw new Error('Chart changed while capturing')
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
      notifyChartCopyResult(ok)
      if (!ok) console.error('[chart] Clipboard image write was rejected')
    } catch (error) {
      console.error('[chart] Could not copy chart', error)
      notifyChartCopyResult(false)
    } finally {
      setCapturing(null)
    }
  }
  const exportPng = async () => {
    if (!chartRendered || capturing || !appliedChart) return
    const revision = appliedChart.revision
    setCapturing('export')
    try {
      const outcome = await exportChartPng(
        () => image(revision),
        api.export.saveBinary,
      )
      if (outcome === 'saved') feedback('Chart exported')
    } catch (error) {
      console.error('[chart] Could not export chart', error)
      feedback('Could not export chart')
    } finally {
      setCapturing(null)
    }
  }
  const dismissPointMenu = useCallback(() => setPointMenu(null), [])
  const onBrushEnd = (params: {
    areas?: Array<{ coordRange?: unknown[] }>
  }) => {
    if (
      !temporalRangeSelectionEnabled ||
      !chart?.renderable ||
      !effectiveConfiguration.xColumn
    )
      return
    const range = chartTimeSelectionRange(
      params.areas?.[0]?.coordRange ?? [],
      chart.xValues,
      activeBuilderTimeBucket,
    )
    if (!range) return
    if (onTemporalRangeSelected)
      onTemporalRangeSelected({
        startMs: Date.parse(String(range.startInclusive)),
        endMs: Date.parse(String(range.endExclusive)),
      })
    else
      onAddFilter(
        createResultRangeFilter(
          effectiveConfiguration.xColumn,
          range.startInclusive,
          range.endExclusive,
        ),
      )
    const instance = ref.current?.getEchartsInstance()
    instance?.dispatchAction({ type: 'brush', areas: [] })
    instance?.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' },
    })
  }
  const onChartClick = (params: {
    componentType?: string
    dataIndex?: number
    seriesIndex?: number
    event?: { event?: MouseEvent; offsetX?: number; offsetY?: number }
    data?: unknown
  }) => {
    if (
      (params.data as { aiAnomalyOverlay?: unknown } | undefined)
        ?.aiAnomalyOverlay === true ||
      params.componentType !== 'series' ||
      !chart?.renderable ||
      !effectiveConfiguration.xColumn ||
      params.dataIndex == null ||
      params.seriesIndex == null
    )
      return
    const xValue = chart.xValues[params.dataIndex]
    const seriesValue = chart.seriesValues[params.seriesIndex] ?? null
    const tuple = decodeBuilderSeriesTuple(seriesValue)
    const directSeriesColumn =
      effectiveConfiguration.seriesColumn &&
      effectiveConfiguration.seriesColumn !== 'series'
        ? effectiveConfiguration.seriesColumn
        : null
    const seriesFilters =
      tuple?.map(({ column, value }) => ({ column, value })) ??
      (directSeriesColumn
        ? [{ column: directSeriesColumn, value: seriesValue }]
        : undefined)
    const native = params.event?.event
    const bounds = ref.current
      ?.getEchartsInstance()
      .getDom()
      .getBoundingClientRect()
    setPointMenu({
      context: {
        xColumn: effectiveConfiguration.xColumn,
        xValue,
        seriesColumn:
          effectiveConfiguration.seriesColumn ??
          (effectiveConfiguration.seriesColumns?.length ? 'series' : null),
        seriesValue,
        seriesFilters,
        timeBucket: activeBuilderTimeBucket,
      },
      position: {
        x:
          native?.clientX ?? (bounds?.left ?? 0) + (params.event?.offsetX ?? 0),
        y: native?.clientY ?? (bounds?.top ?? 0) + (params.event?.offsetY ?? 0),
      },
    })
  }
  const applyPointAction = (action: ChartFilterAction) => {
    if (!pointMenu) return
    const { context } = pointMenu
    if (
      action === 'includeSeries' ||
      action === 'excludeSeries' ||
      action === 'includeSeriesAndX'
    ) {
      const include = action !== 'excludeSeries'
      for (const filter of chartSeriesResultFilters(context, include))
        onAddFilter(filter)
    }
    if (
      action === 'includeX' ||
      action === 'excludeX' ||
      action === 'includeSeriesAndX'
    ) {
      const exclude = action === 'excludeX'
      if (context.timeBucket) {
        const range = timeBucketRange(context.xValue, context.timeBucket)
        if (range)
          onAddFilter(
            createResultRangeFilter(
              context.xColumn,
              range.startInclusive,
              range.endExclusive,
              exclude,
            ),
          )
      } else {
        const operator: 'equals' | 'notEquals' | 'isNull' | 'isNotNull' =
          context.xValue == null
            ? exclude
              ? 'isNotNull'
              : 'isNull'
            : exclude
              ? 'notEquals'
              : 'equals'
        onAddFilter(
          createResultFilter(context.xColumn, operator, context.xValue),
        )
      }
    }
    dismissPointMenu()
  }
  const onSeriesMouseOver = (params: {
    componentType?: string
    seriesName?: string
  }) => {
    if (params.componentType === 'series' && params.seriesName)
      hoveredSeriesIdentity.current = params.seriesName
  }
  const onChartMouseOver = (params: {
    componentType?: string
    seriesName?: string
    data?: unknown
  }) => {
    const data = params.data as
      { aiAnomalyOverlay?: unknown; sourceSeriesName?: unknown } | undefined
    if (
      data?.aiAnomalyOverlay === true &&
      typeof data.sourceSeriesName === 'string'
    ) {
      hoveredSeriesIdentity.current = data.sourceSeriesName
      return
    }
    onSeriesMouseOver(params)
  }
  const onSeriesMouseOut = (params: {
    componentType?: string
    seriesName?: string
    data?: unknown
  }) => {
    const data = params.data as
      { aiAnomalyOverlay?: unknown; sourceSeriesName?: unknown } | undefined
    const seriesIdentity =
      data?.aiAnomalyOverlay === true &&
      typeof data.sourceSeriesName === 'string'
        ? data.sourceSeriesName
        : params.seriesName
    if (
      seriesIdentity === hoveredSeriesIdentity.current &&
      params.componentType === 'series'
    )
      hoveredSeriesIdentity.current = undefined
  }
  const onChartFinished = () => {
    if (
      !appliedChart ||
      !hasRenderableChart ||
      !readiness.current.finishRevision(appliedChart.revision) ||
      !applications.current.finish(appliedChart.token)
    ) {
      if (import.meta.env.DEV)
        console.debug('[chart-application] ignored stale finished event', {
          token: appliedChart?.token,
        })
      return
    }
    animationPolicy.current.commit(appliedChart.fingerprint)
    setRenderedRevision(appliedChart.revision)
    if (import.meta.env.DEV)
      console.debug('[chart-application] finished', {
        token: appliedChart.token,
        fingerprint: appliedChart.fingerprint,
      })
  }
  const analyzeChartWithAi = async () => {
    if (
      !chart ||
      !effectiveConfiguration.xColumn ||
      !effectiveConfiguration.valueColumn ||
      !api?.ai?.analyzeAnomalies ||
      isResultStale
    )
      return
    const requestRevision = aiContextRevision.current
    const submitted = chart.series
      .flatMap((item, chartSeriesIndex) => {
        if (seriesVisibility[item.name] === false) return []
        const sample = sampleChartSeries(item.name, item.data, chart.xValues)
        return sample.points.length >= AI_LIMITS.anomalyMinimumPointsPerSeries
          ? [{ chartSeriesIndex, sample }]
          : []
      })
      .slice(0, AI_LIMITS.anomalySeries)
    if (!submitted.length) {
      setAiAnalysis(null)
      setAiSubmittedSamples(null)
      setAiAnomaliesVisible(false)
      setAiAnalysisError(
        'AI analysis needs at least three numeric points in a visible series.',
      )
      return
    }

    const requestId = crypto.randomUUID()
    aiRequestId.current = requestId
    setAiAnalyzing(true)
    setAiAnalysis(null)
    setAiSubmittedSamples(null)
    setAiAnomaliesVisible(false)
    setAiAnalysisError('')
    try {
      const response = await api.ai.analyzeAnomalies({
        requestId,
        chart: {
          chartType: effectiveConfiguration.view,
          xColumn: effectiveConfiguration.xColumn,
          valueColumn: effectiveConfiguration.valueColumn,
          series: submitted.map(({ sample }) => ({
            ...sample,
            points: sample.points.map(({ x, y }) => ({ x, y })),
          })),
        },
      })
      if (
        aiRequestId.current !== requestId ||
        aiContextRevision.current !== requestRevision
      )
        return
      if (response.ok) {
        setAiAnalysis(response.value)
        setAiSubmittedSamples(submitted)
        setAiAnomaliesVisible(true)
      } else {
        setAiAnalysis(null)
        setAiSubmittedSamples(null)
        setAiAnalysisError(response.message)
      }
    } catch {
      if (
        aiRequestId.current === requestId &&
        aiContextRevision.current === requestRevision
      )
        setAiAnalysisError(
          'AI analysis failed. Check your connection and try again.',
        )
    } finally {
      if (aiRequestId.current === requestId) {
        aiRequestId.current = null
        setAiAnalyzing(false)
      }
    }
  }

  const hiddenSeries = seriesIdentities.filter(
    (identity) => seriesVisibility[identity] === false,
  )
  const showChart = shouldKeepChartMounted(
    effectiveConfiguration.view,
    Boolean(result),
  )

  if (!hasRun)
    return (
      <div className={styles.explorer} data-result-explorer>
        <div className={styles.pane}>
          <div className={styles.empty} data-result-empty>
            {mode === 'builder'
              ? 'Select a table and X axis, then run the query to explore the grouped result.'
              : 'Run a query to view its results.'}
          </div>
        </div>
      </div>
    )
  return (
    <div className={styles.explorer} data-result-explorer>
      {result && isResultStale && (
        <div className={styles.staleBanner} role="status">
          <span>
            <strong>Disconnected</strong> — showing results from the last
            successful query.
          </span>
          <button
            className="btn ghost"
            onClick={() => void onReconnect?.()}
            disabled={reconnecting || !onReconnect}
          >
            {reconnecting ? 'Reconnecting…' : 'Reconnect'}
          </button>
        </div>
      )}
      {result && !hidePicker && (
        <ChartPicker
          value={effectiveConfiguration.view}
          onChange={chooseView}
        />
      )}
      {effectiveConfiguration.view !== 'table' &&
        result &&
        dimensionControls === 'result' && (
          <div className={styles.visualizationControls}>
            <div className={styles.visualizationControl}>
              <Combobox
                label="X axis"
                value={effectiveConfiguration.xColumn ?? ''}
                options={xAxisOptions}
                onChange={(value) => update({ xColumn: value || null })}
                placeholder="Choose…"
                searchable
                emptyMessage="No matching columns"
              />
            </div>
            <div className={styles.visualizationControl}>
              <Combobox
                label="Y axis"
                value={effectiveConfiguration.valueColumn ?? ''}
                options={yAxisOptions}
                onChange={(value) => update({ valueColumn: value || null })}
                placeholder={numeric.length ? 'Choose…' : 'No numeric column'}
                searchable
                emptyMessage="No matching numeric columns"
              />
            </div>
            <div className={styles.visualizationControl}>
              <MultiCombobox
                label="Series"
                values={selectedSeriesValues}
                options={seriesOptions}
                onChange={updateSeries}
                placeholder="No breakdown"
                searchable
                showChips
                emptyMessage="No matching columns"
              />
            </div>
          </div>
        )}
      {hierarchical && result && (
        <div className={styles.hierarchyOrder} aria-label="Hierarchy order">
          <div>
            <strong>Hierarchy</strong>
            <small> Inner → outer · lowest cardinality recommended</small>
          </div>
          <div className={styles.hierarchyLevels}>
            {hierarchyStats.map(({ column, distinctCount }, index) => (
              <div className={styles.hierarchyLevel} key={column}>
                <span>
                  <b>{index + 1}</b> {column}{' '}
                  <small>{distinctCount} values</small>
                </span>
                <button
                  type="button"
                  aria-label={`Move ${column} inward`}
                  title="Move inward"
                  disabled={index === 0}
                  onClick={() => moveHierarchyDimension(index, -1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label={`Move ${column} outward`}
                  title="Move outward"
                  disabled={index === hierarchyStats.length - 1}
                  onClick={() => moveHierarchyDimension(index, 1)}
                >
                  →
                </button>
              </div>
            ))}
          </div>
          {hierarchyDimensions.join('\0') !==
            suggestedHierarchyDimensions.join('\0') && (
            <button
              className="btn ghost"
              type="button"
              onClick={() =>
                setHierarchyDimensions(suggestedHierarchyDimensions)
              }
            >
              Use suggested order
            </button>
          )}
        </div>
      )}
      {!showChart || !result ? (
        <ResultsTable
          mode={mode}
          rawResult={result}
          filteredResult={filteredResult}
          activeFilters={activeFilters}
          resultRevision={resultRevision}
          running={running}
          error={error}
          errorAction={errorAction}
          onAddFilter={onAddFilter}
          onRemoveFilter={onRemoveFilter}
          onClearFilters={onClearFilters}
          onToggleFilterExecution={onToggleFilterExecution}
          canPromoteFilter={canPromoteTableFilter}
          canDemoteFilter={canDemoteFilter}
        />
      ) : (
        <div className={styles.chart} data-result-chart>
          <div className={styles.chartActions}>
            <span className={styles.stats}>
              {activeFilters.length
                ? `${filteredResult?.rowCount ?? 0} of ${result.rowCount}`
                : result.rowCount}{' '}
              rows · {result.columns.length} cols · {result.durationMs} ms
            </span>
            <div className={styles.spacer} />
            {!hierarchical &&
              seriesIdentities.length > 1 &&
              hiddenSeries.length > 0 && (
                <button
                  className="btn ghost"
                  onClick={() =>
                    updateSeriesVisibility(showAllSeries(seriesIdentities))
                  }
                >
                  Show all
                </button>
              )}
            <div className={styles.axisScale}>
              <Combobox
                label="Unit"
                mode="inline"
                value={effectiveConfiguration.displayUnit?.family ?? 'number'}
                options={[
                  { value: 'number', label: 'Number' },
                  { value: 'time', label: 'Time' },
                ]}
                onChange={(value) =>
                  update({
                    displayUnit:
                      value === 'time'
                        ? { family: 'time', unit: 'ms' }
                        : { family: 'number' },
                  })
                }
              />
            </div>
            {effectiveConfiguration.displayUnit?.family === 'time' && (
              <div className={styles.axisScale}>
                <Combobox
                  label="Input time unit"
                  mode="inline"
                  value={effectiveConfiguration.displayUnit.unit}
                  options={['ms', 's', 'min', 'h'].map((unit) => ({
                    value: unit,
                    label: unit,
                  }))}
                  onChange={(value) =>
                    update({
                      displayUnit: {
                        family: 'time',
                        unit: value as Extract<
                          DisplayUnit,
                          { family: 'time' }
                        >['unit'],
                      },
                    })
                  }
                />
              </div>
            )}
            {!hierarchical && (
              <div className={styles.axisScale}>
                <Combobox
                  label="Value axis scale"
                  mode="inline"
                  value={effectiveConfiguration.valueAxisScale ?? 'linear'}
                  options={valueScaleOptions}
                  onChange={(value) =>
                    update({ valueAxisScale: value as ValueAxisScale })
                  }
                />
              </div>
            )}
            {aiConfigured &&
              effectiveConfiguration.view === 'line' &&
              chart?.renderable &&
              !hierarchical && (
                <button
                  className="btn ghost"
                  disabled={aiAnalyzing || isResultStale}
                  title="Up to 8 series and 256 sampled points per series, with full-series summary statistics."
                  onClick={() => void analyzeChartWithAi()}
                >
                  {aiAnalyzing ? 'Analyzing with AI…' : 'Analyze with AI'}
                </button>
              )}
            {aiAnalysis && aiAnalysis.anomalies.length > 0 && (
              <button
                className="btn ghost"
                type="button"
                aria-pressed={aiAnomaliesVisible}
                title="Show or hide the AI-identified anomaly markers and tooltip explanations."
                onClick={() => setAiAnomaliesVisible((visible) => !visible)}
              >
                Show anomalies
              </button>
            )}
            {aiAnalysis && aiSubmittedSamples && (
              <AiAnomalyDetailsPopover
                analysis={aiAnalysis}
                anomalies={resolvedAiAnomalies}
                samples={aiSubmittedSamples.map(({ sample }) => sample)}
                valueAxisScale={
                  effectiveConfiguration.valueAxisScale ?? 'linear'
                }
              />
            )}
            <button
              className="btn ghost"
              disabled={isChartActionDisabled(
                chartRendered,
                capturing !== null,
              )}
              onClick={copyChart}
            >
              {capturing === 'copy' ? 'Copying…' : 'Copy chart'}
            </button>
            <button
              className="btn ghost"
              disabled={isChartActionDisabled(
                chartRendered,
                capturing !== null,
              )}
              onClick={exportPng}
            >
              {capturing === 'export' ? 'Exporting…' : 'Export PNG'}
            </button>
          </div>
          {aiAnalysisError && (
            <div className={styles.aiAnomalyError} role="alert">
              {aiAnalysisError}
            </div>
          )}
          <ResultFilterBar
            filters={activeFilters}
            onRemove={onRemoveFilter}
            onClear={onClearFilters}
            onToggleExecution={onToggleFilterExecution}
            canPromote={canPromoteChartFilter}
            canDemote={canDemoteFilter}
          />
          {error && (
            <div className={styles.error}>
              <div className={styles.errorMessage} role="alert">
                {error}
              </div>
              {errorAction && (
                <div className={styles.errorAction}>{errorAction}</div>
              )}
            </div>
          )}
          {effectiveConfiguration.valueAxisScale === 'log' &&
            (logPresentation?.omittedCount ?? 0) > 0 && (
              <div className={styles.warning} role="status">
                Log scale: {logPresentation!.omittedCount} zero or negative{' '}
                {logPresentation!.omittedCount === 1
                  ? 'point is'
                  : 'points are'}{' '}
                not plotted.
              </div>
            )}
          {!numeric.length && filteredResult?.rows.length ? (
            <div className={styles.empty} data-result-empty>
              This result does not contain a numeric column that can be used as
              a Y axis.
            </div>
          ) : !chartReady ? (
            <div className={styles.empty} data-result-empty>
              {hierarchical
                ? 'Choose at least one Series dimension and a Y axis to render this hierarchy.'
                : 'Choose an X axis and Y axis column to render a chart.'}
            </div>
          ) : result.rows.length === 0 ? (
            <div className={styles.empty} data-result-empty>
              Query returned no rows.
            </div>
          ) : filteredResult?.rows.length === 0 ? (
            <div className={styles.empty} data-result-empty>
              No rows match the active filters.
            </div>
          ) : !hierarchical && chart && !chart.renderable ? (
            <div className={styles.empty} data-result-empty role="alert">
              {chart.rejectionReason === 'too-many-series'
                ? 'Too many series to chart: more than 100.'
                : 'This chart would contain more than 100,000 points.'}
              <br />
              {activeBuilderTimeBucket
                ? 'Filter the result, narrow the time range, increase the bucket size, or choose another Series dimension.'
                : 'Filter the result, reduce Series cardinality, or choose another X axis.'}
            </div>
          ) : !appliedChart ? (
            <div className={styles.chartCanvas} data-result-chart-canvas />
          ) : (
            <>
              <div
                ref={chartCanvasRef}
                className={styles.chartCanvas}
                style={
                  {
                    '--chart-legend-width': `${chartLegendWidth}px`,
                  } as CSSProperties
                }
                data-result-chart-canvas
                data-visual-type={effectiveConfiguration.view}
                data-visual-finished={chartRendered}
                data-visual-series={semanticCounts.series}
                data-visual-items={semanticCounts.items}
                data-visual-fingerprint={appliedChart.fingerprint}
                data-visual-expected-fingerprint={chartFingerprint}
                data-visual-config={semanticConfiguration}
              >
                <div className={styles.plot} ref={plotRef}>
                  <ReactECharts
                    ref={setChartRef}
                    option={appliedChart?.option}
                    onChartReady={onChartFinished}
                    theme="dark"
                    notMerge
                    onEvents={{
                      click: hierarchical ? () => {} : onChartClick,
                      brushEnd: onBrushEnd,
                      mouseover: onChartMouseOver,
                      mouseout: onSeriesMouseOut,
                      finished: onChartFinished,
                    }}
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                {!hierarchical && (
                  <>
                    {legendEntries.length > 1 && (
                      <ChartLegendResizer
                        width={chartLegendWidth}
                        containerRef={chartCanvasRef}
                        onWidthChange={setChartLegendWidth}
                      />
                    )}
                    <ChartLegend
                      series={legendEntries}
                      visibility={seriesVisibility}
                      onToggle={(identity) =>
                        updateSeriesVisibility(
                          reconcileSeriesVisibility(
                            toggleSeries(seriesVisibility, identity),
                            seriesIdentities,
                          ),
                        )
                      }
                      onIsolate={(identity) =>
                        updateSeriesVisibility(
                          isolateSeries(
                            seriesVisibility,
                            seriesIdentities,
                            identity,
                          ),
                        )
                      }
                    />
                  </>
                )}
                {showRunning && (
                  <div className={styles.runningOverlay} role="status">
                    Running…
                  </div>
                )}
              </div>
              {chart?.warning && (
                <div className={styles.warning} role="status">
                  {chart.warning} Consider filtering the result or reducing
                  chart cardinality.
                </div>
              )}
            </>
          )}
          {copyFeedback && (
            <div className="toast" role="status">
              {copyFeedback}
            </div>
          )}
          {pointMenu && (
            <ChartFilterPopover
              context={pointMenu.context}
              position={pointMenu.position}
              onAction={applyPointAction}
              onDismiss={dismissPointMenu}
            />
          )}
        </div>
      )}
    </div>
  )
}
