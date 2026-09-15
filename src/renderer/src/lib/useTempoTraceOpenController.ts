import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueryResult } from '@shared/types'
import { api } from './api'
import { tempoTraceLookupRequest } from './traceCohort'
import { canonicalTraceId, openedTraceStatus, type TraceRow } from './traceViewer'

interface OpenTraceRequest {
  candidate: string
  searchRows: TraceRow[]
}

interface ControllerOptions {
  connectionId: string
  onError: (message: string) => void
  onOpenStart?: (traceId: string) => void
  onTraceOpened?: () => void
  onTraceStatusResolved?: (traceId: string, status: string) => void
}

function isSpanResult(result: QueryResult): boolean {
  return result.columns.some((column) => column.name === 'spanId')
}

function tempoPerf(event: string, fields: Record<string, unknown>): void {
  if (api.tempoPerformanceEnabled) console.info(`[tempo-perf] ${JSON.stringify({ event, ...fields })}`)
}

export function useTempoTraceOpenController({
  connectionId,
  onError,
  onOpenStart,
  onTraceOpened,
  onTraceStatusResolved
}: ControllerOptions) {
  const [spans, setSpans] = useState<TraceRow[]>([])
  const [traceLoading, setTraceLoading] = useState(false)
  const traceRenderTiming = useRef<{ started: number; requestId?: string; spanCount: number } | null>(null)

  useEffect(() => {
    const timing = traceRenderTiming.current
    if (!timing || spans.length !== timing.spanCount) return
    const frame = requestAnimationFrame(() => {
      tempoPerf('trace.rendered', {
        requestId: timing.requestId,
        elapsedMs: performance.now() - timing.started,
        spanCount: timing.spanCount,
        milestone: 'animation-frame-after-commit'
      })
      traceRenderTiming.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [spans])

  const resetTrace = useCallback(() => {
    setSpans([])
    setTraceLoading(false)
    traceRenderTiming.current = null
  }, [])

  const openTrace = useCallback(async ({ candidate, searchRows }: OpenTraceRequest) => {
    const request = canonicalTraceId(candidate)
    if (!request) {
      onError('Trace ID must be a hexadecimal identifier up to 32 characters.')
      return
    }

    onOpenStart?.(request)
    setTraceLoading(true)
    const perfStarted = performance.now()
    const sourceRow = searchRows.find((row) => canonicalTraceId(row.traceId) === request)
    const openSource = sourceRow ? 'search-result' : 'direct-id'
    try {
      const result = await api.query.run(
        connectionId,
        request,
        [],
        sourceRow ? tempoTraceLookupRequest(sourceRow) : undefined,
        undefined,
        true
      )
      tempoPerf('trace.result-renderer', {
        requestId: result.execution?.requestId,
        elapsedMs: performance.now() - perfStarted,
        spanCount: result.rows.length,
        openSource
      })
      if (!isSpanResult(result)) throw new Error('Tempo returned search results instead of the requested trace.')

      traceRenderTiming.current = {
        started: perfStarted,
        requestId: result.execution?.requestId,
        spanCount: result.rows.length
      }
      setSpans(result.rows)
      onTraceOpened?.()
      const status = openedTraceStatus(result.rows)
      if (status !== 'unknown') onTraceStatusResolved?.(request, status)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setTraceLoading(false)
    }
  }, [connectionId, onError, onOpenStart, onTraceOpened, onTraceStatusResolved])

  return { spans, traceLoading, openTrace, resetTrace }
}
