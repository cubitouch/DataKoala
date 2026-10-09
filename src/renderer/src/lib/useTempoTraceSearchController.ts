import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueryResult } from '@shared/types'
import type { TempoSearchProgress } from '@shared/tempo'
import { api } from './api'
import type { BuilderTimeRange } from './builderTimeRange'
import { prometheusRangeBounds } from './prometheusTimeRange'
import type { TraceSampleSize } from './traceBuilder'
import {
  canonicalTraceId,
  traceResultStatus,
  type TraceRow,
} from './traceViewer'
import { selectSession, useStore } from '@store/useStore'
import { isTabConnectionCurrent } from './tabConnection'

interface SearchRequest {
  query: string
  sampleSize: TraceSampleSize
  range: BuilderTimeRange
}

interface ControllerOptions {
  connectionId: string
  onSearchStart?: () => void
  onError: (message: string) => void
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function isSpanResult(result: QueryResult): boolean {
  return result.columns.some((column) => column.name === 'spanId')
}

function searchRowsFromResult(result: QueryResult | null): TraceRow[] {
  if (
    !result ||
    isSpanResult(result) ||
    !result.columns.some((column) => column.name === 'traceId')
  )
    return []
  return result.rows as TraceRow[]
}

function mergeSearchRows(
  existing: TraceRow[],
  incoming: TraceRow[],
): TraceRow[] {
  const merged = new Map(existing.map((row) => [text(row.traceId), row]))
  for (const row of incoming) {
    const traceId = text(row.traceId)
    if (!traceId) continue
    const previous = merged.get(traceId)
    const previousStatus = previous ? traceResultStatus(previous) : 'unknown'
    const nextStatus = traceResultStatus(row)
    merged.set(
      traceId,
      previous && previousStatus !== 'unknown' && nextStatus === 'unknown'
        ? { ...row, status: previous.status }
        : row,
    )
  }
  return [...merged.values()].sort((left, right) => {
    const byTime = Number(right.startTimeMs) - Number(left.startTimeMs)
    return byTime || text(left.traceId).localeCompare(text(right.traceId))
  })
}

function tempoPerf(event: string, fields: Record<string, unknown>): void {
  if (api.tempoPerformanceEnabled)
    console.info(`[tempo-perf] ${JSON.stringify({ event, ...fields })}`)
}

export function useTempoTraceSearchController({
  connectionId,
  onSearchStart,
  onError,
}: ControllerOptions) {
  const tabId = useStore((state) => state.activeTabId)
  const initialStoredResult =
    selectSession(useStore.getState(), tabId)?.result ?? null
  const [searchRows, setSearchRows] = useState<TraceRow[]>(() =>
    searchRowsFromResult(initialStoredResult),
  )
  const [searchNotice, setSearchNotice] = useState(
    () => initialStoredResult?.notice ?? '',
  )
  const [searchProgress, setSearchProgress] =
    useState<TempoSearchProgress | null>(null)
  const [searching, setSearching] = useState(false)
  const requestRevisions = useRef(new Map<string, number>())

  useEffect(() => {
    const storedResult =
      selectSession(useStore.getState(), tabId)?.result ?? null
    setSearchRows(searchRowsFromResult(storedResult))
    setSearchNotice(storedResult?.notice ?? '')
    setSearchProgress(null)
    setSearching(false)
  }, [tabId])

  const resetSearch = useCallback(() => {
    setSearchRows([])
    setSearchNotice('')
    setSearchProgress(null)
    setSearching(false)
  }, [])

  const updateSearchRowStatus = useCallback(
    (traceId: string, status: string) => {
      setSearchRows((current) =>
        current.map((row) =>
          canonicalTraceId(row.traceId) === traceId ? { ...row, status } : row,
        ),
      )
    },
    [],
  )

  const runSearch = useCallback(
    async ({ query, sampleSize, range: selectedRange }: SearchRequest) => {
      const request = query.trim()
      if (!request) return
      if (
        selectedRange.recurringWindows?.some(
          (window) => window.from || window.to,
        )
      ) {
        onError(
          'Recurring daily windows are not supported for Tempo trace searches yet. Choose a continuous range.',
        )
        return
      }
      let range: { start: string; end: string }
      try {
        range = prometheusRangeBounds(selectedRange)
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : String(reason))
        return
      }

      const sampled = sampleSize !== 'all'
      const requestTabId = tabId
      const requestGeneration =
        useStore.getState().connectionStateByProfileId[connectionId]?.generation
      if (requestGeneration === undefined) return
      if (
        !isTabConnectionCurrent(requestTabId, connectionId, requestGeneration)
      )
        return
      const requestRevision =
        (requestRevisions.current.get(requestTabId) ?? 0) + 1
      requestRevisions.current.set(requestTabId, requestRevision)
      const isCurrentRequest = () =>
        requestRevisions.current.get(requestTabId) === requestRevision &&
        isTabConnectionCurrent(requestTabId, connectionId, requestGeneration)
      const isVisibleRequest = () =>
        isCurrentRequest() && useStore.getState().activeTabId === requestTabId
      const perfStarted = performance.now()
      let firstUsefulResult = false
      onSearchStart?.()
      useStore.getState().startQuery(requestTabId)
      if (useStore.getState().activeTabId === requestTabId) {
        setSearching(true)
        setSearchRows([])
        setSearchProgress(null)
        setSearchNotice(
          sampled
            ? `Fetching a quick sample of up to ${sampleSize} traces across the selected period…`
            : 'Fetching the complete selected period…',
        )
      }
      try {
        const result = await api.query.run(
          connectionId,
          request,
          [],
          {
            start: range.start,
            end: range.end,
            ...(sampled ? { sampleSize: Number(sampleSize) } : {}),
          },
          (progress, requestId) => {
            if (!firstUsefulResult && progress.rows.length > 0) {
              firstUsefulResult = true
              tempoPerf('search.first-result-renderer', {
                requestId,
                elapsedMs: performance.now() - perfStarted,
                rowsInBatch: progress.rows.length,
                tracesFound: progress.tracesFound,
                sampleSize,
              })
            }
            if (isVisibleRequest()) {
              setSearchProgress(progress)
              setSearchRows((current) =>
                mergeSearchRows(current, progress.rows),
              )
            }
          },
        )
        if (isSpanResult(result))
          throw new Error(
            'TraceQL search returned a trace instead of search results.',
          )
        if (isCurrentRequest()) {
          useStore.getState().completeQuery(result, null, requestTabId)
          if (isVisibleRequest()) {
            setSearchRows(result.rows)
            setSearchNotice(result.notice ?? '')
            setSearchProgress(null)
          }
        }
        tempoPerf('search.final-renderer', {
          requestId: result.execution?.requestId,
          elapsedMs: performance.now() - perfStarted,
          rowCount: result.rows.length,
          sampleSize,
        })
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : String(reason)
        if (isCurrentRequest()) {
          useStore.getState().completeQuery(null, message, requestTabId)
          if (isVisibleRequest()) {
            setSearchNotice(
              sampled
                ? 'Sample search stopped before Tempo returned its bounded result set.'
                : 'Search stopped before the selected period was fully covered; partial results found so far are shown.',
            )
            setSearchProgress(null)
            onError(message)
          }
        }
      } finally {
        if (isVisibleRequest()) setSearching(false)
      }
    },
    [connectionId, onError, onSearchStart, tabId],
  )

  return {
    searchRows,
    searchNotice,
    searchProgress,
    searching,
    runSearch,
    resetSearch,
    updateSearchRowStatus,
  }
}
