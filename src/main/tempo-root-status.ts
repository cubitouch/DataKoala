import type { QueryResult } from '../shared/types.ts'
import type { TempoQueryRequest } from '../shared/tempo.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'
import type { TempoPerformanceCollector } from './tempo-performance.ts'

export type TempoRootStatus = 'ok' | 'error' | 'unknown'

export interface TempoRootStatusProgress {
  rows: Record<string, unknown>[]
  checked: number
  total: number
  queriesCompleted: number
}

export interface TempoRootStatusOptions {
  context?: string
  datasourceUid?: string
  batchSize?: number
  onProgress?: (progress: TempoRootStatusProgress) => void
  performance?: TempoPerformanceCollector
}

interface RootStatusTarget {
  canonicalTraceId: string
  providerTraceId: string
}

const DEFAULT_BATCH_SIZE = 100
const PROVIDER_TIME_PRECISION_MS = 1_000

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function canonicalTraceId(value: unknown): string | null {
  const traceId = text(value).trim().toLowerCase()
  if (!/^[0-9a-f]{1,32}$/.test(traceId)) return null
  return traceId.padStart(32, '0')
}

function traceRows(raw: unknown): Record<string, unknown>[] {
  const payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  const traces = isRecord(payload) && Array.isArray(payload.traces)
    ? payload.traces
    : Array.isArray(payload) ? payload : []
  return traces.filter(isRecord)
}

function traceIdsFromSearch(raw: unknown): Set<string> {
  const traceIds = new Set<string>()
  for (const trace of traceRows(raw)) {
    const traceId = canonicalTraceId(trace.traceID ?? trace.traceId ?? trace.trace_id)
    if (traceId) traceIds.add(traceId)
  }
  return traceIds
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error('gcx returned malformed JSON while resolving Tempo root statuses.') }
}

function providerRange(request: TempoQueryRequest): { start: string; end: string } {
  const exactStart = new Date(request.start).getTime()
  const exactEnd = new Date(request.end).getTime()
  if (!Number.isFinite(exactStart) || !Number.isFinite(exactEnd) || exactEnd <= exactStart) {
    throw new Error('Tempo root status lookup requires a valid search time range.')
  }
  const startMs = Math.floor(exactStart / PROVIDER_TIME_PRECISION_MS) * PROVIDER_TIME_PRECISION_MS
  let endMs = Math.ceil(exactEnd / PROVIDER_TIME_PRECISION_MS) * PROVIDER_TIME_PRECISION_MS
  if (endMs <= startMs) endMs = startMs + PROVIDER_TIME_PRECISION_MS
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }
}

function batches<T>(values: T[], size: number): T[][] {
  const output: T[][] = []
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size))
  return output
}

function commonArgs(options: TempoRootStatusOptions): string[] {
  return [
    ...(options.context ? ['--context', options.context] : []),
    ...(options.datasourceUid ? ['--datasource', options.datasourceUid] : [])
  ]
}

function rootStatusQuery(traceIds: string[], status: 'error' | 'ok'): string {
  // Tempo can return the correct root span for `select(span:status)` while omitting
  // the selected intrinsic from search metadata. Classify by membership instead:
  // the RHS is restricted to a status and !>> removes every matching descendant,
  // leaving only roots whose own status has that value.
  const traceIdRegex = traceIds.join('|')
  const allSpans = `{ trace:id =~ ${JSON.stringify(traceIdRegex)} }`
  const statusSpans = `{ trace:id =~ ${JSON.stringify(traceIdRegex)} && span:status = ${status} }`
  return `${allSpans} !>> ${statusSpans}`
}

export async function enrichTempoRootStatuses(
  result: QueryResult,
  request: TempoQueryRequest,
  run: GcxCommandRunner,
  options: TempoRootStatusOptions = {}
): Promise<{ result: QueryResult; queriesCompleted: number; checked: number }> {
  const rowsById = new Map<string, Record<string, unknown>>()
  const targets: RootStatusTarget[] = []
  for (const row of result.rows) {
    const providerTraceId = text(row.traceId).trim().toLowerCase()
    const canonical = canonicalTraceId(providerTraceId)
    if (!canonical) continue
    rowsById.set(canonical, row)
    targets.push({ canonicalTraceId: canonical, providerTraceId })
  }
  if (!targets.length) {
    return { result, queriesCompleted: 0, checked: 0 }
  }

  const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE)))
  const range = providerRange(request)
  let checked = 0
  let queriesCompleted = 0


  for (const targetBatch of batches(targets, batchSize)) {
    const batchNumber = Math.floor(checked / batchSize) + 1
    const statuses = new Map<string, TempoRootStatus>()

    const resolveStatus = async (status: 'error' | 'ok', candidates: RootStatusTarget[]) => {
      if (!candidates.length) return
      const queryNumber = queriesCompleted + 1
      try {
        const args = [
          'traces', 'query', rootStatusQuery(candidates.map((target) => target.providerTraceId), status),
          ...commonArgs(options),
          '--from', range.start,
          '--to', range.end,
          '--limit', String(candidates.length),
          '-o', 'json'
        ]
        const gcxStarted = options.performance?.now() ?? 0
        const response = await run(args)
        const gcxWallMs = options.performance ? options.performance.now() - gcxStarted : 0
        const parseStarted = options.performance?.now()
        const parsed = parseJson(response.stdout)
        if (parseStarted !== undefined) options.performance?.recordParse(options.performance.now() - parseStarted)
        options.performance?.recordGcx({ phase: `root-status.${status}`, gcxWallMs, stdout: response.stdout, raw: parsed })
        const normalizeStarted = options.performance?.now()
        const matchedIds = traceIdsFromSearch(parsed)
        for (const traceId of matchedIds) statuses.set(traceId, status)
        if (normalizeStarted !== undefined) options.performance?.recordNormalize(options.performance.now() - normalizeStarted)
      } catch (reason) {
        console.warn('[tempo-status] root predicate failed', {
          batch: batchNumber,
          query: queryNumber,
          status,
          targets: candidates.length,
          error: reason instanceof Error ? reason.message : String(reason)
        })
      } finally {
        queriesCompleted += 1
      }
    }

    await resolveStatus('error', targetBatch)
    const unresolved = targetBatch.filter((target) => !statuses.has(target.canonicalTraceId))
    await resolveStatus('ok', unresolved)
    checked += targetBatch.length

    const changed: Record<string, unknown>[] = []
    for (const target of targetBatch) {
      const row = rowsById.get(target.canonicalTraceId)
      if (!row) continue
      const rootStatus = statuses.get(target.canonicalTraceId) ?? 'unknown'
      const next = rootStatus === 'unknown' ? row : { ...row, status: rootStatus }
      rowsById.set(target.canonicalTraceId, next)
      changed.push(next)
    }
    try {
      options.onProgress?.({ rows: changed, checked, total: targets.length, queriesCompleted })
    } catch (reason) {
      console.warn('[tempo-status] progress callback failed', {
        batch: batchNumber,
        error: reason instanceof Error ? reason.message : String(reason)
      })
    }
  }

  const rows = targets
    .map((target) => rowsById.get(target.canonicalTraceId))
    .filter((row): row is Record<string, unknown> => !!row)
  return {
    result: { ...result, rows, rowCount: rows.length },
    queriesCompleted,
    checked
  }
}
