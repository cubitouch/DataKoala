import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import {
  aggregateTraceCohort,
  selectTraceRowsForCohort,
  summarizeTraceForCohort,
  tempoTraceLookupRequest,
  type TraceCohortAnalysisProgress,
  type TraceCohortTraceSummary
} from './traceCohort'
import { canonicalTraceId, type TraceRow } from './traceViewer'

const DEFAULT_COHORT_SAMPLE = 100
const MAX_COHORT_SAMPLE = 250
const COHORT_FETCH_CONCURRENCY = 4
const PROGRESS_BATCH_SIZE = 4

interface CohortState extends TraceCohortAnalysisProgress {
  sourceKey: string
  traces: TraceCohortTraceSummary[]
}

interface CohortSelection {
  rows: TraceRow[]
  sourceKey: string
}

const initialState = (): CohortState => ({
  status: 'idle',
  sourceKey: '',
  completed: 0,
  total: 0,
  failed: 0,
  traces: []
})

function sourceKey(rows: TraceRow[], limit: number): string {
  return `${limit}|${rows.map((row) => `${canonicalTraceId(row.traceId) ?? ''}:${Number(row.startTimeMs) || 0}:${Number(row.durationMs) || 0}`).join(',')}`
}

function selectRowsAndKey(rows: TraceRow[], limit: number): CohortSelection {
  const selected = selectTraceRowsForCohort(rows, limit)
  return { rows: selected, sourceKey: sourceKey(selected, limit) }
}

function isSpanResult(columns: Array<{ name: string }>): boolean {
  return columns.some((column) => column.name === 'spanId')
}

export function useTraceCohortAnalysis(connectionId: string, searchRows: TraceRow[]) {
  const [sampleLimit, setSampleLimit] = useState(DEFAULT_COHORT_SAMPLE)
  const [state, setState] = useState<CohortState>(initialState)
  const generation = useRef(0)
  const aggregate = useMemo(() => aggregateTraceCohort(state.traces), [state.traces])
  const currentSelection = useMemo(() => selectRowsAndKey(searchRows, sampleLimit), [searchRows, sampleLimit])

  const reset = useCallback(() => {
    generation.current += 1
    setState(initialState())
  }, [])

  useEffect(() => reset(), [connectionId, reset])

  const run = useCallback(async (requestedLimit = sampleLimit) => {
    const limit = Math.max(1, Math.min(MAX_COHORT_SAMPLE, Math.floor(requestedLimit)))
    const selection = limit === sampleLimit ? currentSelection : selectRowsAndKey(searchRows, limit)
    const rows = selection.rows
    const key = selection.sourceKey
    const runGeneration = ++generation.current
    const started = performance.now()
    let nextIndex = 0
    let completed = 0
    let failed = 0
    let publishedCompleted = 0
    const traces: TraceCohortTraceSummary[] = []

    if (!rows.length) {
      setState({ ...initialState(), sourceKey: key })
      return
    }

    setState({ status: 'loading', sourceKey: key, completed: 0, total: rows.length, failed: 0, traces: [] })

    const publish = (force = false) => {
      if (runGeneration !== generation.current) return
      if (!force && completed < rows.length && completed - publishedCompleted < PROGRESS_BATCH_SIZE) return
      publishedCompleted = completed
      setState({ status: 'loading', sourceKey: key, completed, total: rows.length, failed, traces: [...traces] })
    }

    const worker = async () => {
      while (runGeneration === generation.current) {
        const index = nextIndex++
        if (index >= rows.length) return
        const row = rows[index]
        const traceId = canonicalTraceId(row.traceId)
        if (!traceId) {
          failed += 1
          completed += 1
          publish()
          continue
        }
        try {
          const result = await api.query.run(connectionId, traceId, [], tempoTraceLookupRequest(row), undefined, true)
          if (!isSpanResult(result.columns)) throw new Error('Tempo returned search results instead of a trace.')
          if (runGeneration !== generation.current) return
          traces.push(summarizeTraceForCohort(result.rows, row))
        } catch {
          if (runGeneration !== generation.current) return
          failed += 1
        }
        completed += 1
        publish()
      }
    }

    await Promise.all(Array.from({ length: Math.min(COHORT_FETCH_CONCURRENCY, rows.length) }, worker))
    if (runGeneration !== generation.current) return
    publish(true)
    const status = traces.length === 0 ? 'error' : failed > 0 ? 'partial' : 'ready'
    setState({ status, sourceKey: key, completed, total: rows.length, failed, traces: [...traces] })
    if (api.tempoPerformanceEnabled) console.info(`[tempo-perf] ${JSON.stringify({
      event: 'cohort.analysis.completed',
      elapsedMs: performance.now() - started,
      searchResults: searchRows.length,
      requested: rows.length,
      completed,
      failed,
      tracesAnalyzed: traces.length,
      serviceCount: aggregateTraceCohort(traces).nodes.length,
      edgeCount: aggregateTraceCohort(traces).edges.length
    })}`)
  }, [connectionId, currentSelection, sampleLimit, searchRows])

  const ensureStarted = useCallback(() => {
    if (state.sourceKey === currentSelection.sourceKey && state.status !== 'idle' && state.status !== 'error') return
    void run(sampleLimit)
  }, [currentSelection.sourceKey, run, sampleLimit, state.sourceKey, state.status])

  const retry = useCallback(() => { void run(sampleLimit) }, [run, sampleLimit])

  const changeSampleLimit = useCallback((limit: number) => {
    const next = Math.max(1, Math.min(MAX_COHORT_SAMPLE, Math.floor(limit)))
    setSampleLimit(next)
    void run(next)
  }, [run])

  const stop = useCallback(() => {
    generation.current += 1
    setState((current) => ({
      ...current,
      status: current.traces.length ? 'partial' : 'idle'
    }))
  }, [])

  return {
    sampleLimit,
    progress: { status: state.status, completed: state.completed, total: state.total, failed: state.failed } satisfies TraceCohortAnalysisProgress,
    traces: state.traces,
    aggregate,
    reset,
    ensureStarted,
    retry,
    changeSampleLimit,
    stop
  }
}
