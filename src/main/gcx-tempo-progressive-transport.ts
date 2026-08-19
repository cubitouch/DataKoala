import type { QueryResult } from '../shared/types.ts'
import type { TempoQueryRequest } from '../shared/tempo.ts'
import {
  GcxTempoTransport,
  normalizeTempoSearch,
  type TempoService,
  type TempoTransport
} from './gcx-tempo-transport.ts'
import { runGcxCommand, type GcxCommandRunner } from './gcx-prometheus-transport.ts'

const TRACE_ID = /^[0-9a-f]{32}$/i
const DEFAULT_SEARCH_LIMIT = 100
const PROVIDER_TIME_PRECISION_MS = 1_000
const DEFAULT_MIN_SLICE_MS = PROVIDER_TIME_PRECISION_MS
const DEFAULT_MAX_DENSE_LIMIT = 10_000
const STATUS_CONCURRENCY = 4

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

function mergeRows(target: Map<string, Record<string, unknown>>, incoming: Record<string, unknown>[]) {
  for (const row of incoming) {
    const traceId = text(row.traceId)
    if (!traceId) continue
    const previous = target.get(traceId)
    target.set(traceId, previous && statusResolved(previous) && !statusResolved(row)
      ? { ...row, status: previous.status }
      : row)
  }
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= values.length) return
      output[index] = await mapper(values[index])
    }
  })
  await Promise.all(workers)
  return output
}

/**
 * Exhausts a ranged Tempo search despite gcx/Tempo exposing a result limit rather than
 * a cursor. A saturated time window is bisected on whole-second boundaries until each
 * slice is below the limit. If a one-second slice is still saturated, the slice limit
 * grows geometrically. This lets DataKoala prove that the selected period has been
 * covered instead of presenting an arbitrary top-N as though it were complete.
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
    return TRACE_ID.test(query) ? this.get(query) : this.search(query, request)
  }

  private async searchWindow(expression: string, window: SearchWindow): Promise<QueryResult> {
    if (window.endMs - window.startMs < PROVIDER_TIME_PRECISION_MS) {
      throw new Error('Tempo search pagination produced a range smaller than the provider time precision.')
    }
    const args = [
      'traces', 'query', expression,
      ...this.commonArgs(),
      '--from', iso(window.startMs),
      '--to', iso(window.endMs),
      '--limit', String(window.limit),
      '-o', 'json'
    ]
    const response = await this.run(args)
    return normalizeTempoSearch(parseJson(response.stdout), 0, `${iso(window.startMs)} → ${iso(window.endMs)}`)
  }

  private async enrichSearchStatuses(result: QueryResult): Promise<QueryResult> {
    const rows = await mapConcurrent(result.rows, STATUS_CONCURRENCY, async (row) => {
      const traceId = text(row.traceId)
      if (text(row.status) !== 'unknown' || !TRACE_ID.test(traceId)) return row
      try {
        const trace = await this.get(traceId)
        const hasError = trace.rows.some((span) => text(span.status).toUpperCase().includes('ERROR'))
        return { ...row, status: hasError ? 'error' : 'ok' }
      } catch {
        return row
      }
    })
    return { ...result, rows }
  }

  async search(expression: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const query = expression.trim()
    if (!query) throw new Error('Enter a TraceQL query.')
    if (!request) return this.base.search(query)

    const started = Date.now()
    const exactBounds = rangeBounds(request)
    const providerBounds = providerRangeBounds(exactBounds.startMs, exactBounds.endMs)
    const pending: SearchWindow[] = [{ ...providerBounds, limit: this.pageLimit }]
    const rowsByTraceId = new Map<string, Record<string, unknown>>()
    let columns: QueryResult['columns'] = []
    let queryCount = 0

    while (pending.length > 0) {
      const window = pending.pop()!
      const page = await this.searchWindow(query, window)
      queryCount += 1
      if (columns.length === 0) columns = page.columns
      mergeRows(rowsByTraceId, page.rows)

      if (page.rows.length < window.limit) continue

      const durationMs = window.endMs - window.startMs
      const midpoint = providerMidpoint(window)
      if (durationMs > this.minSliceMs && midpoint > window.startMs && midpoint < window.endMs) {
        // Tempo range endpoints may be inclusive. Deliberately overlap at the midpoint
        // and de-duplicate by trace ID so there can be no boundary gap.
        pending.push(
          { startMs: midpoint, endMs: window.endMs, limit: this.pageLimit },
          { startMs: window.startMs, endMs: midpoint, limit: this.pageLimit }
        )
        continue
      }

      if (window.limit < this.maxDenseLimit) {
        pending.push({
          ...window,
          limit: Math.min(window.limit * 2, this.maxDenseLimit)
        })
        continue
      }

      throw new Error(
        `Tempo returned at least ${window.limit} matching traces inside a ${Math.max(1, Math.ceil(durationMs))}ms window. ` +
        'DataKoala cannot guarantee complete-period results at the provider limit; narrow the TraceQL query or time range.'
      )
    }

    const rows = [...rowsByTraceId.values()]
      .filter((row) => {
        const startTimeMs = number(row.startTimeMs)
        return startTimeMs >= exactBounds.startMs && startTimeMs <= exactBounds.endMs
      })
      .sort((left, right) => {
        const byTime = number(right.startTimeMs) - number(left.startTimeMs)
        return byTime || text(left.traceId).localeCompare(text(right.traceId))
      })
    const durationMs = Date.now() - started
    let result: QueryResult = {
      columns,
      rows,
      rowCount: rows.length,
      durationMs,
      notice: `Tempo search · ${rangeLabel(request)} · complete period · ${rows.length} traces · ${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`,
      execution: { provider: 'tempo', durationMs, rowCount: rows.length }
    }

    if (request.includeStatus) {
      result = await this.enrichSearchStatuses(result)
      const enrichedDurationMs = Date.now() - started
      result = {
        ...result,
        durationMs: enrichedDurationMs,
        execution: { provider: 'tempo', durationMs: enrichedDurationMs, rowCount: result.rows.length }
      }
    }

    return result
  }

  get(traceId: string): Promise<QueryResult> { return this.base.get(traceId) }
  probe(): Promise<void> { return this.base.probe() }
  services(): Promise<TempoService[]> { return this.base.services() }
}
