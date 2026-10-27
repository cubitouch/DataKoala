import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { api } from '@lib/api'
import { useStore } from '@store/useStore'
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
interface Resource {
  result: QueryResult | null
  contextKey: string
  owner: unknown
  state: AnalysisState
  requestId: string | null
  alive: boolean
  listeners: Set<() => void>
  source?: {
    tabId: string
    profileId: string | null
    queryContextId: string | undefined
    result: QueryResult | null
    resultRevision: number
    generation: number | undefined
  }
}
// Runtime only: no AI payload enters workspace/profile serialization.
const tabResources = new Map<string, Resource>()
const emit = (resource: Resource) => {
  for (const listener of resource.listeners) listener()
}
const update = (resource: Resource, state: AnalysisState) => {
  resource.state = state
  emit(resource)
}
function cancelRequest(resource: Resource) {
  const id = resource.requestId
  resource.requestId = null
  if (id && api?.ai?.cancel) void api.ai.cancel(id)
}
function retire(resource: Resource) {
  resource.alive = false
  cancelRequest(resource)
  update(resource, emptyState)
}
function sourceIsCurrent(resource: Resource) {
  const source = resource.source
  if (!source) return resource.alive
  const state = useStore.getState(),
    tab = state.tabs.find((item) => item.id === source.tabId)
  return Boolean(
    tab &&
    tab.connectionProfileId === source.profileId &&
    tab.queryContextId === source.queryContextId &&
    tab.result === source.result &&
    tab.resultRevision === source.resultRevision &&
    (!source.profileId ||
      state.connectionStateByProfileId[source.profileId]?.generation ===
        source.generation),
  )
}
// Closing/resetting/rebinding/replacing inactive owners also retires their work.
useStore.subscribe(() => {
  for (const [key, resource] of tabResources)
    if (!sourceIsCurrent(resource)) {
      tabResources.delete(key)
      retire(resource)
    }
})

/** Tab-owned runtime analysis; standalone consumers retain component lifetime. */
export function useChartAnomalyAnalysis({
  result,
  owner,
  ownerTabId,
  ownerScope = 'result',
  contextKey,
  configured,
  settingsReady = true,
  chart,
  configuration,
  seriesVisibility,
  isResultStale,
}: {
  result: QueryResult | null
  owner: unknown
  ownerTabId?: string
  ownerScope?: string
  contextKey: string
  configured: boolean
  settingsReady?: boolean
  chart: PivotedResult | null
  configuration: VisualizationConfiguration
  seriesVisibility: Record<string, boolean>
  isResultStale: boolean
}) {
  const key = ownerTabId ? JSON.stringify([ownerTabId, ownerScope]) : null
  const contextOwner = ownerTabId ?? owner
  const resource = useMemo(() => {
    const previous = key ? tabResources.get(key) : undefined
    if (
      previous?.alive &&
      previous.result === result &&
      previous.contextKey === contextKey &&
      sourceIsCurrent(previous)
    )
      return previous
    const store = useStore.getState(),
      tab = ownerTabId
        ? store.tabs.find((item) => item.id === ownerTabId)
        : undefined
    return {
      result,
      contextKey,
      owner: contextOwner,
      state: emptyState,
      requestId: null,
      alive: true,
      listeners: new Set(),
      ...(tab
        ? {
            source: {
              tabId: tab.id,
              profileId: tab.connectionProfileId,
              queryContextId: tab.queryContextId,
              result: tab.result,
              resultRevision: tab.resultRevision,
              generation: tab.connectionProfileId
                ? store.connectionStateByProfileId[tab.connectionProfileId]
                    ?.generation
                : undefined,
            },
          }
        : {}),
    } as Resource
  }, [key, result, contextKey, contextOwner, ownerTabId])
  const activeResource = useRef<Resource | null>(null)
  const state = useSyncExternalStore(
    (listener) => {
      resource.listeners.add(listener)
      return () => {
        resource.listeners.delete(listener)
      }
    },
    () => resource.state,
  )
  useLayoutEffect(() => {
    activeResource.current = resource
    resource.alive = true
    if (key) {
      const previous = tabResources.get(key)
      if (previous && previous !== resource) retire(previous)
      tabResources.set(key, resource)
    }
    return () => {
      activeResource.current = null
      if (!key) retire(resource)
    }
  }, [key, resource])
  useLayoutEffect(() => {
    if (configured || !settingsReady || !resource.requestId) return
    cancelRequest(resource)
    update(resource, emptyState)
  }, [configured, settingsReady, resource])
  const analyze = async () => {
    if (
      activeResource.current !== resource ||
      !resource.alive ||
      !sourceIsCurrent(resource) ||
      !configured ||
      !chart ||
      !configuration.xColumn ||
      !configuration.valueColumn ||
      !api?.ai?.analyzeAnomalies ||
      isResultStale
    )
      return
    cancelRequest(resource)
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
      update(resource, {
        ...emptyState,
        error:
          'AI analysis needs at least three numeric points in a visible series.',
      })
      return
    }
    const id = crypto.randomUUID()
    resource.requestId = id
    const current = () =>
      resource.alive && resource.requestId === id && sourceIsCurrent(resource)
    update(resource, { ...emptyState, analyzing: true })
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
      update(resource, {
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
        update(resource, {
          ...emptyState,
          error: 'AI analysis failed. Check your connection and try again.',
        })
    } finally {
      if (current()) resource.requestId = null
    }
  }
  const setAnomaliesVisible = (change: (visible: boolean) => boolean) => {
    if (activeResource.current !== resource || !resource.alive) return
    update(resource, {
      ...resource.state,
      anomaliesVisible: change(resource.state.anomaliesVisible),
    })
  }
  const cancel = () => {
    if (activeResource.current !== resource) return
    cancelRequest(resource)
    update(resource, emptyState)
  }
  return { ...state, analyze, cancel, setAnomaliesVisible }
}
