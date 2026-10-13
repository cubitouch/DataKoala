import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '@lib/api'
import { AI_LIMITS, type AiAnomalyAnalysis } from '@shared/ai'
import type { QueryResult } from '@shared/types'
import type {
  PivotedResult,
  VisualizationConfiguration,
} from '@lib/resultVisualization'
import { sampleChartSeries } from '@lib/chartAnomalySampling'
import type { SubmittedAnomalySeries } from '@lib/chartAnomalyMapping'

interface AnalysisState {
  analysis: AiAnomalyAnalysis | null
  submittedSamples: SubmittedAnomalySeries[] | null
  anomaliesVisible: boolean
  analyzing: boolean
  error: string
}
const emptyState: AnalysisState = {
  analysis: null,
  submittedSamples: null,
  anomaliesVisible: false,
  analyzing: false,
  error: '',
}

/** Component-owned analysis, independent of durable session query operations. */
export function useChartAnomalyAnalysis({
  result,
  owner,
  contextKey,
  configured,
  chart,
  configuration,
  seriesVisibility,
  isResultStale,
}: {
  result: QueryResult | null
  /** Existing tab-bound callback identity, supplied by the owning workspace. */
  owner: unknown
  /** Data/revision identity; excludes series visibility and axis presentation. */
  contextKey: string
  configured: boolean
  chart: PivotedResult | null
  configuration: VisualizationConfiguration
  seriesVisibility: Record<string, boolean>
  isResultStale: boolean
}) {
  const context = useMemo(
    () => ({ result, contextKey, owner }),
    [result, contextKey, owner],
  )
  const activeContext = useRef<typeof context | null>(null)
  const requestId = useRef<string | null>(null)
  const [state, setState] = useState({ context, ...emptyState })

  const cancel = useCallback(() => {
    const id = requestId.current
    requestId.current = null
    if (id && api?.ai?.cancel) void api.ai.cancel(id)
  }, [])

  // Invalidate at commit, before promise completions can target the new data.
  // Tagging state also prevents old annotations appearing in the new render.
  useLayoutEffect(() => {
    activeContext.current = context
    setState({ context, ...emptyState })
    return () => {
      activeContext.current = null
      cancel()
    }
  }, [context, cancel])

  useLayoutEffect(() => {
    if (configured || !requestId.current) return
    cancel()
    setState({ context, ...emptyState })
  }, [configured, context, cancel])

  const analyze = async () => {
    if (
      activeContext.current !== context ||
      !configured ||
      !chart ||
      !configuration.xColumn ||
      !configuration.valueColumn ||
      !api?.ai?.analyzeAnomalies ||
      isResultStale
    )
      return
    // A replacement invalidates the prior request even if sampling now fails.
    cancel()
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
      setState({
        context,
        ...emptyState,
        error:
          'AI analysis needs at least three numeric points in a visible series.',
      })
      return
    }
    const id = crypto.randomUUID()
    requestId.current = id
    const current = () =>
      requestId.current === id && activeContext.current === context
    setState({ context, ...emptyState, analyzing: true })
    try {
      const response = await api.ai.analyzeAnomalies({
        requestId: id,
        chart: {
          chartType: configuration.view,
          xColumn: configuration.xColumn,
          valueColumn: configuration.valueColumn,
          series: submitted.map(({ sample }) => ({
            ...sample,
            points: sample.points.map(({ x, y }) => ({ x, y })),
          })),
        },
      })
      if (!current()) return
      setState({
        context,
        ...emptyState,
        ...(response.ok
          ? {
              analysis: response.value,
              submittedSamples: submitted,
              anomaliesVisible: true,
            }
          : { error: response.message }),
      })
    } catch {
      if (current())
        setState({
          context,
          ...emptyState,
          error: 'AI analysis failed. Check your connection and try again.',
        })
    } finally {
      // Stale completion cannot clear a newer request's loading state.
      if (current()) requestId.current = null
    }
  }
  const setAnomaliesVisible = (update: (visible: boolean) => boolean) => {
    if (activeContext.current !== context) return
    setState((previous) => ({
      ...previous,
      anomaliesVisible: update(previous.anomaliesVisible),
    }))
  }
  const visibleState = state.context === context ? state : emptyState
  return {
    analysis: visibleState.analysis,
    submittedSamples: visibleState.submittedSamples,
    anomaliesVisible: visibleState.anomaliesVisible,
    analyzing: visibleState.analyzing,
    error: visibleState.error,
    analyze,
    setAnomaliesVisible,
  }
}
