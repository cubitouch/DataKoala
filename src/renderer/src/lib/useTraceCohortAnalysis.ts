import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import {
  aggregateTraceCohort,
  selectTraceRowsForCohort,
  summarizeTraceForCohort,
  tempoTraceLookupRequest,
  type TraceCohortAnalysisProgress,
  type TraceCohortTraceSummary,
} from './traceCohort'
import { canonicalTraceId, type TraceRow } from './traceViewer'
import { isTabConnectionCurrent } from './tabConnection'
import { useStore } from '@store/useStore'

const DEFAULT_COHORT_SAMPLE = 100
const MAX_COHORT_SAMPLE = 250
const COHORT_FETCH_CONCURRENCY = 4
const PROGRESS_BATCH_SIZE = 4

interface CohortState extends TraceCohortAnalysisProgress {
  sourceKey: string
  summaries: Map<string, TraceCohortTraceSummary>
}

interface CohortSelection {
  rows: TraceRow[]
  sourceKey: string
}

const initialState = (): CohortState => ({
  status: 'idle',
  sourceKey: '',
  summaries: new Map(),
  completed: 0,
  total: 0,
  failed: 0,
})

function rowKey(row: TraceRow): string {
  return `${canonicalTraceId(row.traceId) ?? ''}:${Number(row.startTimeMs) || 0}:${Number(row.durationMs) || 0}`
}

function sourceKey(rows: TraceRow[], limit: number): string {
  return `${limit}|${rows.map(rowKey).join(',')}`
}

function selectRowsAndKey(rows: TraceRow[], limit: number): CohortSelection {
  const selected = selectTraceRowsForCohort(rows, limit)
  return { rows: selected, sourceKey: sourceKey(selected, limit) }
}

function isSpanResult(columns: Array<{ name: string }>): boolean {
  return columns.some((column) => column.name === 'spanId')
}

export function useTraceCohortAnalysis(
  connectionId: string,
  searchRows: TraceRow[],
  tabId: string,
  connectionGeneration: number,
) {
  const [sampleLimit, setSampleLimit] = useState(DEFAULT_COHORT_SAMPLE)
  const [state, setState] = useState<CohortState>(initialState)
  const generation = useRef(0)
  // Only compact full-trace summaries are cached, scoped to this search/session.
  const cache = useRef(new Map<string, TraceCohortTraceSummary>())
  const currentSelection = useMemo(
    () => selectRowsAndKey(searchRows, sampleLimit),
    [searchRows, sampleLimit],
  )
  const scopeKey = sourceKey(searchRows, 0)
  const contextKey = `${connectionId}:${tabId}:${connectionGeneration}`
  const currentScope = useRef({ scopeKey, contextKey })
  currentScope.current = { scopeKey, contextKey }
  const cacheContext = useRef(contextKey)
  const traces = useMemo(
    () =>
      cacheContext.current === contextKey
        ? currentSelection.rows
            .map((row) => state.summaries.get(rowKey(row)))
            .filter((trace): trace is TraceCohortTraceSummary => Boolean(trace))
        : [],
    [contextKey, currentSelection, state.summaries],
  )
  const aggregate = useMemo(() => aggregateTraceCohort(traces), [traces])
  const currentRun =
    state.sourceKey === currentSelection.sourceKey &&
    cacheContext.current === contextKey
  const failed = currentRun ? state.failed : 0
  const progress: TraceCohortAnalysisProgress = {
    status: currentRun
      ? state.status
      : traces.length === currentSelection.rows.length && traces.length > 0
        ? 'ready'
        : traces.length
          ? 'partial'
          : 'idle',
    completed: traces.length + failed,
    total: currentSelection.rows.length,
    failed,
  }

  const reset = useCallback(() => {
    generation.current += 1
    cache.current.clear()
    setState(initialState())
  }, [])

  useEffect(() => {
    cacheContext.current = contextKey
    reset()
  }, [contextKey, reset])
  // A changed interval cancels old work, but never starts new detail requests.
  useEffect(() => {
    generation.current += 1
    setState({ ...initialState(), summaries: new Map(cache.current) })
  }, [scopeKey])
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )

  const run = useCallback(
    async (requestedLimit = sampleLimit) => {
      const limit = Math.max(
        1,
        Math.min(MAX_COHORT_SAMPLE, Math.floor(requestedLimit)),
      )
      const selection =
        limit === sampleLimit
          ? currentSelection
          : selectRowsAndKey(searchRows, limit)
      const rows = selection.rows
      const key = selection.sourceKey
      const runGeneration = ++generation.current
      const isCurrentConnection = () =>
        currentScope.current.scopeKey === scopeKey &&
        currentScope.current.contextKey === contextKey &&
        isTabConnectionCurrent(tabId, connectionId, connectionGeneration) &&
        useStore.getState().activeTabId === tabId
      const started = performance.now()
      let nextIndex = 0
      let completed = 0
      let failed = 0
      let publishedCompleted = 0
      const traces = rows
        .map((row) => cache.current.get(rowKey(row)))
        .filter((trace): trace is TraceCohortTraceSummary => Boolean(trace))
      const pendingRows = rows.filter((row) => !cache.current.has(rowKey(row)))
      completed = traces.length

      if (!rows.length) {
        setState({
          ...initialState(),
          sourceKey: key,
          summaries: new Map(cache.current),
        })
        return
      }

      setState({
        status: 'loading',
        sourceKey: key,
        summaries: new Map(cache.current),
        completed,
        total: rows.length,
        failed: 0,
      })

      const publish = (force = false) => {
        if (runGeneration !== generation.current || !isCurrentConnection())
          return
        if (
          !force &&
          completed < rows.length &&
          completed - publishedCompleted < PROGRESS_BATCH_SIZE
        )
          return
        publishedCompleted = completed
        setState({
          status: 'loading',
          sourceKey: key,
          summaries: new Map(cache.current),
          completed,
          total: rows.length,
          failed,
        })
      }

      const worker = async () => {
        while (runGeneration === generation.current) {
          const index = nextIndex++
          if (index >= pendingRows.length) return
          const row = pendingRows[index]
          const traceId = canonicalTraceId(row.traceId)
          if (!traceId) {
            failed += 1
            completed += 1
            publish()
            continue
          }
          try {
            const result = await api.query.run(
              connectionId,
              traceId,
              [],
              tempoTraceLookupRequest(row),
              undefined,
              true,
            )
            if (!isSpanResult(result.columns))
              throw new Error(
                'Tempo returned search results instead of a trace.',
              )
            if (runGeneration !== generation.current || !isCurrentConnection())
              return
            const summary = summarizeTraceForCohort(result.rows, row)
            cache.current.set(rowKey(row), summary)
            traces.push(summary)
          } catch {
            if (runGeneration !== generation.current || !isCurrentConnection())
              return
            failed += 1
          }
          completed += 1
          publish()
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(COHORT_FETCH_CONCURRENCY, pendingRows.length) },
          worker,
        ),
      )
      if (runGeneration !== generation.current || !isCurrentConnection()) return
      publish(true)
      const status =
        traces.length === 0 ? 'error' : failed > 0 ? 'partial' : 'ready'
      setState({
        status,
        sourceKey: key,
        summaries: new Map(cache.current),
        completed,
        total: rows.length,
        failed,
      })
      if (api.tempoPerformanceEnabled)
        console.info(
          `[tempo-perf] ${JSON.stringify({
            event: 'cohort.analysis.completed',
            elapsedMs: performance.now() - started,
            searchResults: searchRows.length,
            requested: rows.length,
            completed,
            failed,
            tracesAnalyzed: traces.length,
            serviceCount: aggregateTraceCohort(traces).nodes.length,
            edgeCount: aggregateTraceCohort(traces).edges.length,
          })}`,
        )
    },
    [
      connectionGeneration,
      connectionId,
      contextKey,
      scopeKey,
      currentSelection,
      sampleLimit,
      searchRows,
      tabId,
    ],
  )

  const ensureStarted = useCallback(() => {
    if (
      (traces.length === currentSelection.rows.length ||
        state.sourceKey === currentSelection.sourceKey) &&
      state.status !== 'idle' &&
      state.status !== 'error'
    )
      return
    void run(sampleLimit)
  }, [
    currentSelection,
    traces.length,
    run,
    sampleLimit,
    state.sourceKey,
    state.status,
  ])

  const retry = useCallback(() => {
    void run(sampleLimit)
  }, [run, sampleLimit])

  const changeSampleLimit = useCallback(
    (limit: number) => {
      const next = Math.max(1, Math.min(MAX_COHORT_SAMPLE, Math.floor(limit)))
      setSampleLimit(next)
      void run(next)
    },
    [run],
  )

  const stop = useCallback(() => {
    generation.current += 1
    setState((current) => ({
      ...current,
      status: currentSelection.rows.some((row) =>
        cache.current.has(rowKey(row)),
      )
        ? 'partial'
        : 'idle',
      summaries: new Map(cache.current),
    }))
  }, [currentSelection])

  return {
    sampleLimit,
    progress,
    traces,
    aggregate,
    reset,
    ensureStarted,
    retry,
    changeSampleLimit,
    stop,
  }
}
