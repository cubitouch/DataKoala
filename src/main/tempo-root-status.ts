import type { QueryResult } from '../shared/types.ts'
import type { TempoQueryRequest } from '../shared/tempo.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'

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

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function canonicalTraceId(value: unknown): string | null {
  const traceId = text(value).trim().toLowerCase()
  if (!/^[0-9a-f]{1,32}$/.test(traceId)) return null
  return traceId.padStart(32, '0')
}

function statusValue(value: unknown): TempoRootStatus {
  if (isRecord(value) && 'code' in value) return statusValue(value.code)
  if (typeof value === 'number') {
    if (value === 2) return 'error'
    if (value === 1) return 'ok'
    return 'unknown'
  }
  const normalized = text(value).trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (normalized === '2' || normalized.includes('error') || normalized === 'failed' || normalized === 'failure') return 'error'
  if (normalized === '1' || normalized.includes('status_code_ok') || normalized === 'ok' || normalized === 'success') return 'ok'
  return 'unknown'
}

function decodeValue(value: unknown): unknown {
  if (!isRecord(value)) return value
  for (const key of ['stringValue', 'boolValue', 'intValue', 'doubleValue']) {
    if (key in value) return value[key]
  }
  if ('value' in value) return decodeValue(value.value)
  return value
}

function attributes(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (!Array.isArray(value)) return {}
  const result: Record<string, unknown> = {}
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') continue
    result[item.key] = decodeValue(item.value)
  }
  return result
}

function spanStatus(span: Record<string, unknown>): TempoRootStatus {
  const direct = statusValue(span.status ?? span.statusCode ?? span.status_code)
  if (direct !== 'unknown') return direct
  const values = attributes(span.attributes ?? span.tags)
  for (const key of ['span:status', 'status', 'span.status']) {
    const status = statusValue(values[key])
    if (status !== 'unknown') return status
  }
  return 'unknown'
}

function traceRows(raw: unknown): Record<string, unknown>[] {
  const payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  const traces = isRecord(payload) && Array.isArray(payload.traces)
    ? payload.traces
    : Array.isArray(payload) ? payload : []
  return traces.filter(isRecord)
}

function matchingSpans(trace: Record<string, unknown>): Record<string, unknown>[] {
  const spanSets = trace.spanSets ?? trace.spanSet
  const sets = Array.isArray(spanSets) ? spanSets : spanSets ? [spanSets] : []
  const spans: Record<string, unknown>[] = []
  for (const set of sets) {
    if (!isRecord(set) || !Array.isArray(set.spans)) continue
    spans.push(...set.spans.filter(isRecord))
  }
  return spans.sort((left, right) => {
    // Epoch nanoseconds exceed JavaScript's safe-integer precision, but Number still
    // preserves their ordering at the scale needed here. Root queries should normally
    // return a single span; this is only a deterministic fallback for provider variants.
    const leftNano = number(left.startTimeUnixNano ?? left.startTimeUnixNanos)
    const rightNano = number(right.startTimeUnixNano ?? right.startTimeUnixNanos)
    if (leftNano || rightNano) return leftNano - rightNano
    return number(left.startTimeMs) - number(right.startTimeMs)
  })
}

export function parseTempoRootStatuses(raw: unknown): Map<string, TempoRootStatus> {
  const statuses = new Map<string, TempoRootStatus>()
  for (const trace of traceRows(raw)) {
    const traceId = canonicalTraceId(trace.traceID ?? trace.traceId ?? trace.trace_id)
    if (!traceId) continue
    const root = matchingSpans(trace)[0]
    statuses.set(traceId, root ? spanStatus(root) : 'unknown')
  }
  return statuses
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

function rootQuery(traceIds: string[]): string {
  // Structural operators return matches from the right-hand side. With the same
  // trace-id set on both sides, "not descendant" selects the root span(s) of those
  // exact traces. Use the IDs exactly as Tempo returned them: Tempo search summaries
  // may omit leading zero padding, while direct trace retrieval needs the canonical
  // 32-character form. Querying only the padded form can therefore miss every root.
  const traceIdRegex = traceIds.join('|')
  const selector = `{ trace:id =~ ${JSON.stringify(traceIdRegex)} }`
  return `${selector} !>> ${selector} | select(span:status)`
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
  if (!targets.length) return { result, queriesCompleted: 0, checked: 0 }

  const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE)))
  const range = providerRange(request)
  let checked = 0
  let queriesCompleted = 0

  for (const targetBatch of batches(targets, batchSize)) {
    let statuses = new Map<string, TempoRootStatus>()
    try {
      const args = [
        'traces', 'query', rootQuery(targetBatch.map((target) => target.providerTraceId)),
        ...commonArgs(options),
        '--from', range.start,
        '--to', range.end,
        '--limit', String(targetBatch.length),
        '-o', 'json'
      ]
      const response = await run(args)
      statuses = parseTempoRootStatuses(parseJson(response.stdout))
    } catch {
      // Status enrichment is supplementary: a root-status failure must not discard valid
      // trace search results. Leave those points Unknown and let direct trace open retry.
    }
    queriesCompleted += 1
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
    } catch { /* progress reporting must never fail the query */ }
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
