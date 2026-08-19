import type { QueryResult } from '../shared/types.ts'
import type { TempoQueryContext, TempoQueryRequest } from '../shared/tempo.ts'
import { ProgressiveGcxTempoTransport } from './gcx-tempo-progressive-transport.ts'
import {
  normalizeTempoSearch,
  type TempoService,
  type TempoTransport
} from './gcx-tempo-transport.ts'
import { runGcxCommand, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { applyTempoSearchStatuses, ensureTempoSearchStatusSelection } from './tempo-search-status.ts'

const TRACE_ID = /^[0-9a-f]{32}$/i
const PROVIDER_TIME_PRECISION_MS = 1_000
const MAX_SAMPLE_SIZE = 10_000
const STATUS_CONCURRENCY = 4

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString()
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error('gcx returned malformed JSON for traces query. Update gcx and try again.') }
}

function rangeBounds(request: TempoQueryRequest): { startMs: number; endMs: number } {
  const startMs = new Date(request.start).getTime()
  const endMs = new Date(request.end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('Tempo trace search requires valid start and end times.')
  if (endMs <= startMs) throw new Error('Tempo trace search end time must be after its start time.')
  return { startMs, endMs }
}

function providerRangeBounds(startMs: number, endMs: number): { startMs: number; endMs: number } {
  const providerStartMs = Math.floor(startMs / PROVIDER_TIME_PRECISION_MS) * PROVIDER_TIME_PRECISION_MS
  let providerEndMs = Math.ceil(endMs / PROVIDER_TIME_PRECISION_MS) * PROVIDER_TIME_PRECISION_MS
  if (providerEndMs <= providerStartMs) providerEndMs = providerStartMs + PROVIDER_TIME_PRECISION_MS
  return { startMs: providerStartMs, endMs: providerEndMs }
}

function rangeLabel(request: TempoQueryRequest): string {
  const format = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('.000Z', 'Z')
  }
  return `${format(request.start)} → ${format(request.end)}`
}

function sampleSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) throw new Error('Tempo trace sample size must be a positive integer.')
  if (value > MAX_SAMPLE_SIZE) throw new Error(`Tempo trace sample size cannot exceed ${MAX_SAMPLE_SIZE}.`)
  return value
}

function canonicalTraceId(value: unknown): string | null {
  const traceId = text(value).trim().toLowerCase()
  if (!/^[0-9a-f]{1,32}$/.test(traceId)) return null
  return traceId.padStart(32, '0')
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
 * Adds an intentionally bounded trace-search mode in front of the exhaustive Tempo
 * transport. Tempo selection searches do not support the sampling hints available to
 * TraceQL metrics queries, so a sample is a single whole-range search with a finite
 * result budget. Choosing no sampleSize preserves the exhaustive adaptive paginator.
 */
export class SamplingGcxTempoTransport implements TempoTransport {
  private readonly exhaustive: ProgressiveGcxTempoTransport
  private readonly context?: string
  private readonly datasourceUid?: string
  private readonly run: GcxCommandRunner

  constructor(
    context?: string,
    run: GcxCommandRunner = runGcxCommand,
    datasourceUid?: string
  ) {
    this.context = context
    this.datasourceUid = datasourceUid
    this.run = run
    this.exhaustive = new ProgressiveGcxTempoTransport(context, run, datasourceUid)
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

  private async enrichStatuses(result: QueryResult): Promise<QueryResult> {
    const rows = await mapConcurrent(result.rows, STATUS_CONCURRENCY, async (row) => {
      if (text(row.status).toLowerCase() !== 'unknown') return row
      const traceId = canonicalTraceId(row.traceId)
      if (!traceId) return row
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
    if (request?.sampleSize === undefined) return this.exhaustive.search(query, request)

    const limit = sampleSize(request.sampleSize)
    const started = Date.now()
    const exactBounds = rangeBounds(request)
    const providerBounds = providerRangeBounds(exactBounds.startMs, exactBounds.endMs)
    const providerExpression = ensureTempoSearchStatusSelection(query)
    const args = [
      'traces', 'query', providerExpression,
      ...this.commonArgs(),
      '--from', iso(providerBounds.startMs),
      '--to', iso(providerBounds.endMs),
      '--limit', String(limit),
      '-o', 'json'
    ]
    const response = await this.run(args)
    const raw = parseJson(response.stdout)
    const normalized = applyTempoSearchStatuses(
      normalizeTempoSearch(raw, 0, `${iso(providerBounds.startMs)} → ${iso(providerBounds.endMs)}`),
      raw
    )
    const rows = normalized.rows
      .filter((row) => {
        const startTimeMs = number(row.startTimeMs)
        return startTimeMs >= exactBounds.startMs && startTimeMs <= exactBounds.endMs
      })
      .sort((left, right) => number(right.startTimeMs) - number(left.startTimeMs) || text(left.traceId).localeCompare(text(right.traceId)))
    const durationMs = Date.now() - started
    let result: QueryResult = {
      ...normalized,
      rows,
      rowCount: rows.length,
      durationMs,
      notice: `Tempo search · ${rangeLabel(request)} · sample up to ${limit} traces · ${rows.length} returned · 1 query`,
      execution: { provider: 'tempo', durationMs, rowCount: rows.length }
    }

    const context = request as TempoQueryContext
    if (context.onProgress) {
      try {
        context.onProgress({
          provider: 'tempo',
          coveredMs: 0,
          totalMs: exactBounds.endMs - exactBounds.startMs,
          completedChunks: 1,
          pendingChunks: 0,
          queriesCompleted: 1,
          tracesFound: rows.length,
          rows
        })
      } catch { /* progress reporting must never fail the query */ }
    }

    if (request.includeStatus) {
      result = await this.enrichStatuses(result)
      const enrichedDurationMs = Date.now() - started
      result = {
        ...result,
        durationMs: enrichedDurationMs,
        execution: { provider: 'tempo', durationMs: enrichedDurationMs, rowCount: result.rows.length }
      }
    }

    return result
  }

  get(traceId: string): Promise<QueryResult> { return this.exhaustive.get(traceId) }
  probe(): Promise<void> { return this.exhaustive.probe() }
  services(): Promise<TempoService[]> { return this.exhaustive.services() }
}
