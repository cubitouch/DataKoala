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
const DEFAULT_SEARCH_LIMIT = 20
const STATUS_CONCURRENCY = 4

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error('gcx returned malformed JSON for traces query. Update gcx and try again.') }
}

function normalizedLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SEARCH_LIMIT
  if (!Number.isFinite(value) || value <= 0) throw new Error('Tempo trace search limit must be a positive number.')
  return Math.floor(value)
}

function rangeArgs(request?: TempoQueryRequest): string[] {
  return request ? ['--from', request.start, '--to', request.end] : ['--since', '1h']
}

function rangeLabel(request?: TempoQueryRequest): string {
  if (!request) return 'last 1h'
  const format = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('.000Z', 'Z')
  }
  return `${format(request.start)} → ${format(request.end)}`
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
 * Adds progressive search-window semantics on top of the ordinary gcx Tempo transport.
 * gcx/Tempo expose a result limit but no cursor/offset, so requesting the next page means
 * growing the upstream window (20 → 40 → 60...) and de-duplicating in the renderer.
 * Existing trace IDs can be supplied to skipStatusTraceIds so status enrichment only
 * fetches newly exposed candidates instead of turning every page into an N+1 replay.
 */
export class ProgressiveGcxTempoTransport implements TempoTransport {
  private readonly base: GcxTempoTransport
  private readonly context?: string
  private readonly datasourceUid?: string
  private readonly run: GcxCommandRunner

  constructor(context?: string, run: GcxCommandRunner = runGcxCommand, datasourceUid?: string) {
    this.context = context
    this.datasourceUid = datasourceUid
    this.run = run
    this.base = new GcxTempoTransport(context, run, datasourceUid)
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

  async search(expression: string, request?: TempoQueryRequest): Promise<QueryResult> {
    const limit = normalizedLimit(request?.limit)
    const started = Date.now()
    const args = [
      'traces', 'query', expression,
      ...this.commonArgs(),
      ...rangeArgs(request),
      '--limit', String(limit),
      '-o', 'json'
    ]
    const response = await this.run(args)
    const durationMs = Date.now() - started
    let result = normalizeTempoSearch(parseJson(response.stdout), durationMs, rangeLabel(request))
    result = {
      ...result,
      notice: `Tempo search · ${rangeLabel(request)} · showing up to ${limit} traces`
    }

    if (!request?.includeStatus) return result

    const skipped = new Set(request.skipStatusTraceIds ?? [])
    const rows = await mapConcurrent(result.rows, STATUS_CONCURRENCY, async (row) => {
      const traceId = text(row.traceId)
      if (skipped.has(traceId) || text(row.status) !== 'unknown' || !TRACE_ID.test(traceId)) return row
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

  get(traceId: string): Promise<QueryResult> { return this.base.get(traceId) }
  probe(): Promise<void> { return this.base.probe() }
  services(): Promise<TempoService[]> { return this.base.services() }
}
