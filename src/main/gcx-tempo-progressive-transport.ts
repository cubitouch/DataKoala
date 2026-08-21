import type { QueryResult } from '../shared/types.ts'
import type {
  TempoQueryContext,
  TempoQueryRequest,
  TempoSearchProgress,
  TempoSearchProgressListener
} from '../shared/tempo.ts'
import {
  GcxTempoTransport,
  normalizeTempoSearch,
  type TempoService,
  type TempoTransport
} from './gcx-tempo-transport.ts'
import { runGcxCommand, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { applyTempoSearchStatuses, ensureTempoSearchStatusSelection } from './tempo-search-status.ts'
import { enrichTempoRootStatuses } from './tempo-root-status.ts'
import { createTempoPerformance, type TempoPerformanceCollector } from './tempo-performance.ts'

const TRACE_ID = /^[0-9a-f]{32}$/i
const DEFAULT_SEARCH_LIMIT = 100
const PROVIDER_TIME_PRECISION_MS = 1_000
const DEFAULT_MIN_SLICE_MS = PROVIDER_TIME_PRECISION_MS
const DEFAULT_MAX_DENSE_LIMIT = 10_000

export interface ProgressiveTempoSearchOptions {
  pageLimit?: number
  minSliceMs?: number
  maxDenseLimit?: number
}

interface SearchWindow {
  startMs: number
  endMs: number
  limit: number
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error('gcx returned malformed JSON for traces query. Update gcx and try again.') }
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`)
  return Math.floor(value)
}

function rangeLabel(request?: TempoQueryRequest): string {
  if (!request) return 'last 1h'
  const format = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('.000Z', 'Z')
  }
  return `${format(request.start)} → ${format(request.end)}`
}

function rangeBounds(request: TempoQueryRequest): { startMs: number; endMs: number } {
  const startMs = new Date(request.start).getTime()
  const endMs = new Date(request.end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('Tempo trace search requires valid start and end times.')
  if (endMs <= startMs) throw new Error('Tempo trace search end time must be after its start time.')
  return { startMs, endMs }
}

/**
 * Tempo's search API ultimately consumes Unix epoch seconds. gcx accepts RFC3339 input,
 * but sub-second endpoints can therefore collapse to the same second and be rejected as
 * start >= end. Expand the provider query to whole-second boundaries, then filter the
 * merged summaries back to the user's exact requested range.
 */
function providerRangeBounds(startMs: number, endMs: number): { startMs: number; endMs: number } {
  const providerStartMs = Math.floor(startMs / PROVIDER_TIME_PRECISION_MS) * PROVIDER_TIME_PRECISION_MS
  let providerEndMs = Math.ceil(endMs / PROVIDER_TIME_PRECISION_MS) * PROVIDER_TIME_PRECISION_MS
  if (providerEndMs <= providerStartMs) providerEndMs = providerStartMs + PROVIDER_TIME_PRECISION_MS
  return { startMs: providerStartMs, endMs: providerEndMs }
}

function providerMidpoint(window: SearchWindow): number {
  const midpoint = Math.floor(
    ((window.startMs + window.endMs) / 2) / PROVIDER_TIME_PRECISION_MS
  ) * PROVIDER_TIME_PRECISION_MS
  return midpoint
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString()
}

function statusResolved(row: Record<string, unknown>): boolean {
  const status = text(row.status).toLowerCase()
  return status !== '' && status !== 'unknown'
}

function mergeRows(target: Map<string, Record<string, unknown>>, incoming: Record<string, unknown>[]): Record<string, unknown>[] {
  const changed: Record<string, unknown>[] = []
  for (const row of incoming) {
    const traceId = text(row.traceId)
    if (!traceId) continue
    const previous = target.get(traceId)
    const next = previous && statusResolved(previous) && !statusResolved(row)
      ? { ...row, status: previous.status }
      : row
    target.set(traceId, next)
    changed.push(next)
  }
  return changed
}

function exactWindowDuration(window: SearchWindow, exactBounds: { startMs: number; endMs: number }): number {
  const startMs = Math.max(window.startMs, exactBounds.startMs)
  const endMs = Math.min(window.endMs, exactBounds.endMs)
  return Math.max(0, endMs - startMs)
}

function rowsInsideExactRange(rows: Record<string, unknown>[], exactBounds: { startMs: number; endMs: number }): Record<string, unknown>[] {
  return rows.filter((row) => {
    const startTimeMs = number(row.startTimeMs)
    return startTimeMs >= exactBounds.startMs && startTimeMs <= exactBounds.endMs
  })
}

function emitProgress(listener: TempoSearchProgressListener | undefined, progress: TempoSearchProgress): void {
  if (!listener) return
  try { listener(progress) } catch { /* progress reporting must never fail the query */ }
}

/**
 * Exhausts a ranged Tempo search despite gcx/Tempo exposing a result limit rather than
 * a cursor. A saturated time window is bisected on whole-second boundaries until each
 * slice is below the limit. If a one-second slice is still saturated, the slice limit
 * grows geometrically. This lets DataKoala prove that the selected period has been
 * covered instead of presenting an arbitrary top-N as though it were complete.
 *
 * Every provider response also publishes genuine trace summaries immediately. Coverage
 * only advances for unsaturated chunks, so the renderer can distinguish “traces found”
 * from “period proven complete” while the adaptive chunk tree is still growing.
 */
export class ProgressiveGcxTempoTransport implements TempoTransport {
  private readonly base: GcxTempoTransport
  private readonly context?: string
  private readonly datasourceUid?: string
  private readonly run: GcxCommandRunner
  private readonly pageLimit: number
  private readonly minSliceMs: number
  private readonly maxDenseLimit: number

  constructor(
    context?: string,
    run: GcxCommandRunner = runGcxCommand,
    datasourceUid?: string,
    options: ProgressiveTempoSearchOptions = {}
  ) {
    this.context = context
    this.datasourceUid = datasourceUid
    this.run = run
    this.base = new GcxTempoTransport(context, run, datasourceUid)
    this.pageLimit = positiveInteger(options.pageLimit, DEFAULT_SEARCH_LIMIT, 'Tempo search page limit')
    this.minSliceMs = Math.max(
      PROVIDER_TIME_PRECISION_MS,
      positiveInteger(options.minSliceMs, DEFAULT_MIN_SLICE_MS, 'Tempo minimum search slice')
    )
    this.maxDenseLimit = positiveInteger(options.maxDenseLimit, DEFAULT_MAX_DENSE_LIMIT, 'Tempo dense-window search limit')
    if (this.maxDenseLimit < this.pageLimit) throw new Error('Tempo dense-window search limit must be at least the page limit.')
  }

  private commonArgs(): string[] {
    return [
      ...(this.context ? ['--context', this.context] : []),
      ...(this.datasourceUid ? ['--datasource', this.datasourceUid] : [])
    ]
  }

  async query(value: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const query = value.trim()
    if (!query) throw new Error('Enter a TraceQL query or trace ID.')
    return TRACE_ID.test(query) ? this.get(query, request) : this.search(query, request)
  }

  private async searchWindow(expression: string, window: SearchWindow, perf?: TempoPerformanceCollector): Promise<QueryResult> {
    if (window.endMs - window.startMs < PROVIDER_TIME_PRECISION_MS) {
      throw new Error('Tempo search pagination produced a range smaller than the provider time precision.')
    }
    const providerExpression = ensureTempoSearchStatusSelection(expression)
    const args = [
      'traces', 'query', providerExpression,
      ...this.commonArgs(),
      '--from', iso(window.startMs),
      '--to', iso(window.endMs),
      '--limit', String(window.limit),
      '-o', 'json'
    ]
    const gcxStarted = perf?.now() ?? 0
    const response = await this.run(args)
    const gcxWallMs = perf ? perf.now() - gcxStarted : 0
    const parseStarted = perf?.now()
    const raw = parseJson(response.stdout)
    if (parseStarted !== undefined) perf?.recordParse(perf.now() - parseStarted)
    perf?.recordGcx({ phase: 'traces.query', gcxWallMs, stdout: response.stdout, raw })
    const normalizeStarted = perf?.now()
    const result = applyTempoSearchStatuses(
      normalizeTempoSearch(raw, 0, `${iso(window.startMs)} → ${iso(window.endMs)}`),
      raw
    )
    if (normalizeStarted !== undefined) perf?.recordNormalize(perf.now() - normalizeStarted)
    return result
  }

  async search(expression: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const query = expression.trim()
    if (!query) throw new Error('Enter a TraceQL query.')
    if (!request) return this.base.search(query)

    const context = request as TempoQueryContext
    const perf = context.performance ?? createTempoPerformance(request.diagnosticRequestId, 'search.exhaustive')
    const started = Date.now()
    const exactBounds = rangeBounds(request)
    const providerBounds = providerRangeBounds(exactBounds.startMs, exactBounds.endMs)
    const pending: SearchWindow[] = [{ ...providerBounds, limit: this.pageLimit }]
    const rowsByTraceId = new Map<string, Record<string, unknown>>()
    const totalMs = exactBounds.endMs - exactBounds.startMs
    let coveredMs = 0
    let completedChunks = 0
    let columns: QueryResult['columns'] = []
    let queryCount = 0

    while (pending.length > 0) {
      const window = pending.pop()!
      const page = await this.searchWindow(query, window, perf)
      queryCount += 1
      if (columns.length === 0) columns = page.columns
      const changedRows = mergeRows(rowsByTraceId, rowsInsideExactRange(page.rows, exactBounds))
      let fatalError: Error | undefined

      if (page.rows.length < window.limit) {
        completedChunks += 1
        coveredMs += exactWindowDuration(window, exactBounds)
      } else {
        const durationMs = window.endMs - window.startMs
        const midpoint = providerMidpoint(window)
        if (durationMs > this.minSliceMs && midpoint > window.startMs && midpoint < window.endMs) {
          // Tempo range endpoints may be inclusive. Deliberately overlap at the midpoint
          // and de-duplicate by trace ID so there can be no boundary gap.
          pending.push(
            { startMs: midpoint, endMs: window.endMs, limit: this.pageLimit },
            { startMs: window.startMs, endMs: midpoint, limit: this.pageLimit }
          )
        } else if (window.limit < this.maxDenseLimit) {
          pending.push({
            ...window,
            limit: Math.min(window.limit * 2, this.maxDenseLimit)
          })
        } else {
          fatalError = new Error(
            `Tempo returned at least ${window.limit} matching traces inside a ${Math.max(1, Math.ceil(durationMs))}ms window. ` +
            'DataKoala cannot guarantee complete-period results at the provider limit; narrow the TraceQL query or time range.'
          )
        }
      }

      emitProgress(context.onProgress, {
        provider: 'tempo',
        coveredMs: Math.min(totalMs, coveredMs),
        totalMs,
        completedChunks,
        pendingChunks: pending.length,
        queriesCompleted: queryCount,
        tracesFound: rowsByTraceId.size,
        rows: changedRows
      })

      if (fatalError) throw fatalError
    }

    const rows = [...rowsByTraceId.values()].sort((left, right) => {
      const byTime = number(right.startTimeMs) - number(left.startTimeMs)
      return byTime || text(left.traceId).localeCompare(text(right.traceId))
    })
    const durationMs = Date.now() - started
    let result: QueryResult = {
      columns,
      rows,
      rowCount: rows.length,
      durationMs,
      notice: `Tempo search · ${rangeLabel(request)} · complete period · ${rows.length} traces · ${queryCount} search ${queryCount === 1 ? 'query' : 'queries'}`,
      execution: { provider: 'tempo', durationMs, rowCount: rows.length, ...(perf ? { requestId: perf.requestId } : {}) }
    }

    // Root-span status is part of the normal viewer result now. Batched TraceQL root
    // queries keep this practical even for All mode; callers can explicitly opt out.
    if (request.includeStatus !== false && rows.length > 0) {
      const enrichmentStarted = perf?.now()
      const enrichment = await enrichTempoRootStatuses(result, request, this.run, {
        context: this.context,
        datasourceUid: this.datasourceUid,
        performance: perf,
        onProgress: (progress) => {
          emitProgress(context.onProgress, {
            provider: 'tempo',
            coveredMs: totalMs,
            totalMs,
            completedChunks,
            pendingChunks: 0,
            queriesCompleted: queryCount + progress.queriesCompleted,
            tracesFound: rows.length,
            rows: progress.rows
          })
        }
      })
      if (enrichmentStarted !== undefined) perf?.recordRootStatus(perf.now() - enrichmentStarted, enrichment.queriesCompleted)
      result = enrichment.result
      const enrichedDurationMs = Date.now() - started
      result = {
        ...result,
        durationMs: enrichedDurationMs,
        notice: `${result.notice} · ${enrichment.queriesCompleted} root-status ${enrichment.queriesCompleted === 1 ? 'query' : 'queries'}`,
        execution: { provider: 'tempo', durationMs: enrichedDurationMs, rowCount: result.rows.length, ...(perf ? { requestId: perf.requestId } : {}) }
      }
    }

    perf?.complete({ rowCount: result.rows.length, completedChunks })
    return result
  }

  get(traceId: string, request?: TempoQueryRequest): Promise<QueryResult> { return this.base.get(traceId, request) }
  probe(): Promise<void> { return this.base.probe() }
  services(): Promise<TempoService[]> { return this.base.services() }
}
