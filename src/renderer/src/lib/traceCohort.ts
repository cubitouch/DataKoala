import type { TempoQueryRequest } from '@shared/tempo'
import { canonicalTraceId, traceResultStatus, traceSpanKind, type TraceRow } from './traceViewer.ts'

export type TraceCohortEdgeKind = 'sync' | 'async' | 'mixed'

export interface TraceCohortServiceSample {
  id: string
  label: string
  namespace?: string
  spanCount: number
  errorSpanCount: number
}

export interface TraceCohortAnalysisProgress {
  status: 'idle' | 'loading' | 'ready' | 'partial' | 'error'
  completed: number
  total: number
  failed: number
}

export interface TraceCohortEdgeSample {
  key: string
  source: string
  target: string
  sourceLabel: string
  targetLabel: string
  kind: TraceCohortEdgeKind
  durationMs: number
  callCount: number
  errorCount: number
}

export interface TraceCohortSpanReference {
  traceId: string
  spanId: string
  serviceId: string
  serviceLabel: string
  kind: string
}

export interface TraceCohortSpanLink {
  sourceTraceId: string
  sourceSpanId: string
  targetSpanId: string
  targetServiceId: string
  targetServiceLabel: string
  targetKind: string
  durationMs: number
  errorCount: number
}

export interface TraceCohortTraceSummary {
  traceId: string
  durationMs: number
  status: 'ok' | 'error' | 'unknown'
  rootServiceId: string
  rootServiceLabel: string
  services: TraceCohortServiceSample[]
  edges: TraceCohortEdgeSample[]
  /** Compact identity data used only to resolve OTel links across sampled traces. */
  spanRefs?: TraceCohortSpanReference[]
  /** Link references are resolved during cohort aggregation; raw span payloads are not retained. */
  links?: TraceCohortSpanLink[]
}

export interface TraceCohortNode {
  id: string
  label: string
  namespace?: string
  traceCount: number
  traceRate: number
  rootTraceCount: number
  spanCount: number
  errorTraceCount: number
  errorRate: number
  incidentImpact: number
}

export interface TraceCohortEdge {
  key: string
  source: string
  target: string
  sourceLabel: string
  targetLabel: string
  kind: TraceCohortEdgeKind
  traceCount: number
  traceRate: number
  callCount: number
  callsPerAffectedTrace: number
  errorCount: number
  errorTraceCount: number
  errorRate: number
  p50Ms: number
  p95Ms: number
  baselineMedianMs: number
  slowMedianMs: number
  slowDeltaMs: number
  baselineObservedTraceCount: number
  slowObservedTraceCount: number
  latencyComparisonAvailable: boolean
  baselinePresenceRate: number
  slowPresenceRate: number
  slowPresenceLift: number
  impact: number
  rank: number
  traceIds: string[]
  slowTraceIds: string[]
}

export interface TraceCohortAggregate {
  traceCount: number
  p50DurationMs: number
  p95DurationMs: number
  baselineThresholdMs: number
  slowThresholdMs: number
  baselineTraceCount: number
  slowTraceCount: number
  nodes: TraceCohortNode[]
  edges: TraceCohortEdge[]
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = clamp(fraction, 0, 1) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const progress = position - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * progress
}

function jsonArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
  } catch { return [] }
}

function normalizedTraceId(value: unknown, fallback = ''): string {
  const raw = text(value).trim()
  if (!raw) return fallback
  return canonicalTraceId(raw) ?? raw.toLowerCase()
}

function spanReferenceKey(traceId: unknown, spanId: unknown): string {
  const trace = normalizedTraceId(traceId)
  const span = text(spanId).trim().toLowerCase()
  return trace && span ? `${trace}:${span}` : ''
}

function serviceIdentity(row: TraceRow): { id: string; label: string; namespace?: string } | null {
  const label = text(row.service).trim()
  if (!label) return null
  const namespace = text(row.serviceNamespace).trim()
  return {
    id: namespace ? `${namespace}/${label}` : label,
    label,
    ...(namespace ? { namespace } : {})
  }
}

function isError(row: TraceRow): boolean {
  return traceResultStatus(row) === 'error' || text(row.status).toUpperCase().includes('ERROR')
}

function computedTraceDuration(rows: TraceRow[]): number {
  if (!rows.length) return 0
  const starts = rows.map((row) => number(row.startTimeMs)).filter(Number.isFinite)
  if (!starts.length) return 0
  const start = Math.min(...starts)
  const end = Math.max(...rows.map((row) => number(row.startTimeMs) + Math.max(0, number(row.durationMs))))
  return Math.max(0, end - start)
}

export function tempoTraceLookupRequest(row: TraceRow): TempoQueryRequest | undefined {
  const startTimeMs = number(row.startTimeMs)
  const durationMs = number(row.durationMs)
  if (!Number.isFinite(startTimeMs) || startTimeMs <= 0 || !Number.isFinite(durationMs) || durationMs < 0) return undefined
  const marginMs = clamp(Math.max(durationMs * 0.25, 5_000), 5_000, 60_000)
  const endTimeMs = startTimeMs + Math.max(1_000, durationMs)
  return {
    start: new Date(Math.max(0, startTimeMs - marginMs)).toISOString(),
    end: new Date(endTimeMs + marginMs).toISOString()
  }
}

export function selectTraceRowsForCohort(rows: TraceRow[], limit: number): TraceRow[] {
  const target = Math.max(0, Math.floor(limit))
  if (!target) return []
  const valid = rows.filter((row) => canonicalTraceId(row.traceId))
  if (valid.length <= target) return valid

  const sorted = [...valid].sort((left, right) => number(left.durationMs) - number(right.durationMs))
  const selected = new Map<string, TraceRow>()
  const add = (row: TraceRow | undefined) => {
    if (!row || selected.size >= target) return
    const id = canonicalTraceId(row.traceId)
    if (id) selected.set(id, row)
  }

  const errorBudget = Math.min(Math.max(1, Math.floor(target * 0.2)), target)
  valid
    .filter((row) => traceResultStatus(row) === 'error')
    .sort((left, right) => number(right.durationMs) - number(left.durationMs))
    .slice(0, errorBudget)
    .forEach(add)

  const remaining = target - selected.size
  if (remaining > 0) {
    const available = sorted.filter((row) => {
      const id = canonicalTraceId(row.traceId)
      return id ? !selected.has(id) : false
    })
    for (let index = 0; index < remaining; index += 1) {
      const fraction = remaining === 1 ? 1 : index / (remaining - 1)
      add(available[Math.round(fraction * (available.length - 1))])
    }
  }

  return [...selected.values()]
}

export function summarizeTraceForCohort(rows: TraceRow[], searchRow?: TraceRow): TraceCohortTraceSummary {
  const sorted = [...rows].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs))
  const byId = new Map<string, TraceRow>()
  for (const row of sorted) {
    const id = text(row.spanId)
    if (id) byId.set(id, row)
  }

  const root = sorted.find((row) => !text(row.parentSpanId) || !byId.has(text(row.parentSpanId))) ?? sorted[0]
  const rootIdentity = root ? serviceIdentity(root) : null
  const traceId = normalizedTraceId(searchRow?.traceId ?? root?.traceId ?? sorted[0]?.traceId)
  const services = new Map<string, TraceCohortServiceSample>()
  const edgeSamples = new Map<string, TraceCohortEdgeSample>()
  const spanRefs: TraceCohortSpanReference[] = []
  const links: TraceCohortSpanLink[] = []

  for (const row of sorted) {
    const identity = serviceIdentity(row)
    const spanId = text(row.spanId).trim()
    const spanTraceId = normalizedTraceId(row.traceId, traceId)
    const spanKind = traceSpanKind(row)
    if (identity) {
      const current = services.get(identity.id) ?? { ...identity, spanCount: 0, errorSpanCount: 0 }
      current.spanCount += 1
      if (isError(row)) current.errorSpanCount += 1
      services.set(identity.id, current)

      if (spanId && spanTraceId) {
        spanRefs.push({ traceId: spanTraceId, spanId, serviceId: identity.id, serviceLabel: identity.label, kind: spanKind })
        for (const link of jsonArray(row.links)) {
          const sourceSpanId = text(link.spanId ?? link.spanID).trim()
          if (!sourceSpanId) continue
          links.push({
            sourceTraceId: normalizedTraceId(link.traceId ?? link.traceID, spanTraceId),
            sourceSpanId,
            targetSpanId: spanId,
            targetServiceId: identity.id,
            targetServiceLabel: identity.label,
            targetKind: spanKind,
            durationMs: Math.max(0, number(row.durationMs)),
            errorCount: isError(row) ? 1 : 0
          })
        }
      }
    }

    const parentId = text(row.parentSpanId)
    const parent = parentId ? byId.get(parentId) : undefined
    if (!parent) continue
    const source = serviceIdentity(parent)
    const target = serviceIdentity(row)
    if (!source || !target || source.id === target.id) continue

    const parentKind = traceSpanKind(parent)
    const childKind = traceSpanKind(row)
    const kind: TraceCohortEdgeKind = [parentKind, childKind].some((value) => value === 'PRODUCER' || value === 'CONSUMER') ? 'async' : 'sync'
    const key = `${source.id}→${target.id}`
    const current = edgeSamples.get(key) ?? {
      key,
      source: source.id,
      target: target.id,
      sourceLabel: source.label,
      targetLabel: target.label,
      kind,
      durationMs: 0,
      callCount: 0,
      errorCount: 0
    }
    current.durationMs += Math.max(0, number(row.durationMs))
    current.callCount += 1
    if (isError(row)) current.errorCount += 1
    if (current.kind !== kind) current.kind = 'mixed'
    edgeSamples.set(key, current)
  }

  const status = searchRow ? traceResultStatus(searchRow) : sorted.some(isError) ? 'error' : 'unknown'
  const durationMs = Math.max(0, number(searchRow?.durationMs) || computedTraceDuration(sorted))
  return {
    traceId,
    durationMs,
    status,
    rootServiceId: rootIdentity?.id ?? (text(searchRow?.rootService) || 'unknown'),
    rootServiceLabel: rootIdentity?.label ?? (text(searchRow?.rootService) || 'unknown'),
    services: [...services.values()],
    edges: [...edgeSamples.values()],
    spanRefs,
    links
  }
}

export function aggregateTraceCohort(traces: TraceCohortTraceSummary[]): TraceCohortAggregate {
  if (!traces.length) {
    return {
      traceCount: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
      baselineThresholdMs: 0,
      slowThresholdMs: 0,
      baselineTraceCount: 0,
      slowTraceCount: 0,
      nodes: [],
      edges: []
    }
  }

  const ordered = [...traces].sort((left, right) => left.durationMs - right.durationMs)
  const durations = ordered.map((trace) => trace.durationMs)
  const baselineCount = Math.max(1, Math.floor(ordered.length * 0.5))
  const slowStart = Math.min(ordered.length - 1, Math.max(baselineCount, Math.floor(ordered.length * 0.8)))
  const baseline = ordered.slice(0, baselineCount)
  const slow = ordered.slice(slowStart)
  const slowIds = new Set(slow.map((trace) => trace.traceId))
  const p50DurationMs = percentile(durations, 0.5)
  const p95DurationMs = percentile(durations, 0.95)
  const spanReferences = new Map<string, TraceCohortSpanReference>()
  for (const trace of traces) {
    for (const spanRef of trace.spanRefs ?? []) {
      const key = spanReferenceKey(spanRef.traceId, spanRef.spanId)
      if (key) spanReferences.set(key, spanRef)
    }
  }

  const services = new Map<string, {
    id: string
    label: string
    namespace?: string
    traceIds: Set<string>
    rootTraceCount: number
    spanCount: number
    errorTraceIds: Set<string>
  }>()
  const edges = new Map<string, {
    sample: TraceCohortEdgeSample
    kinds: Set<TraceCohortEdgeSample['kind']>
    traceIds: Set<string>
    errorTraceIds: Set<string>
    durationByTrace: Map<string, number>
    calls: number
    errors: number
  }>()

  for (const trace of traces) {
    for (const service of trace.services) {
      const current = services.get(service.id) ?? {
        id: service.id,
        label: service.label,
        ...(service.namespace ? { namespace: service.namespace } : {}),
        traceIds: new Set<string>(),
        rootTraceCount: 0,
        spanCount: 0,
        errorTraceIds: new Set<string>()
      }
      current.traceIds.add(trace.traceId)
      if (trace.rootServiceId === service.id) current.rootTraceCount += 1
      current.spanCount += service.spanCount
      if (service.errorSpanCount > 0) current.errorTraceIds.add(trace.traceId)
      services.set(service.id, current)
    }

    const traceSamples = new Map(trace.edges.map((sample) => [sample.key, { ...sample }]))
    for (const link of trace.links ?? []) {
      const source = spanReferences.get(spanReferenceKey(link.sourceTraceId, link.sourceSpanId))
      if (!source || source.serviceId === link.targetServiceId) continue
      if (source.kind !== 'PRODUCER' && link.targetKind !== 'CONSUMER') continue
      const key = `${source.serviceId}→${link.targetServiceId}`
      const existing = traceSamples.get(key)
      if (existing) {
        if (existing.kind !== 'async') existing.kind = 'mixed'
        continue
      }
      traceSamples.set(key, {
        key,
        source: source.serviceId,
        target: link.targetServiceId,
        sourceLabel: source.serviceLabel,
        targetLabel: link.targetServiceLabel,
        kind: 'async',
        durationMs: link.durationMs,
        callCount: 1,
        errorCount: link.errorCount
      })
    }

    for (const sample of traceSamples.values()) {
      const current = edges.get(sample.key) ?? {
        sample,
        kinds: new Set<TraceCohortEdgeSample['kind']>(),
        traceIds: new Set<string>(),
        errorTraceIds: new Set<string>(),
        durationByTrace: new Map<string, number>(),
        calls: 0,
        errors: 0
      }
      current.kinds.add(sample.kind)
      current.traceIds.add(trace.traceId)
      if (sample.errorCount > 0) current.errorTraceIds.add(trace.traceId)
      current.durationByTrace.set(trace.traceId, sample.durationMs)
      current.calls += sample.callCount
      current.errors += sample.errorCount
      edges.set(sample.key, current)
    }
  }

  const edgeRows = [...edges.values()].map((entry) => {
    const durationsOnEdge = [...entry.durationByTrace.values()]
    const baselineDurations = baseline.flatMap((trace) => {
      const durationMs = entry.durationByTrace.get(trace.traceId)
      return durationMs === undefined ? [] : [durationMs]
    })
    const slowDurations = slow.flatMap((trace) => {
      const durationMs = entry.durationByTrace.get(trace.traceId)
      return durationMs === undefined ? [] : [durationMs]
    })
    const baselinePresenceRate = baseline.length ? baselineDurations.length / baseline.length : 0
    const slowPresenceRate = slow.length ? slowDurations.length / slow.length : 0
    const baselineMedianMs = percentile(baselineDurations, 0.5)
    const slowMedianMs = percentile(slowDurations, 0.5)
    const latencyComparisonAvailable = baselineDurations.length > 0 && slowDurations.length > 0
    const slowDeltaMs = latencyComparisonAvailable ? slowMedianMs - baselineMedianMs : 0
    const traceCount = entry.traceIds.size
    const errorRate = traceCount ? entry.errorTraceIds.size / traceCount : 0
    const callsPerAffectedTrace = traceCount ? entry.calls / traceCount : 0
    const latencyWeight = percentile(durationsOnEdge, 0.95) / Math.max(1, p95DurationMs)
    const deltaWeight = latencyComparisonAvailable ? Math.max(0, slowDeltaMs) / Math.max(1, p95DurationMs) : 0
    const repeatWeight = Math.max(0, callsPerAffectedTrace - 1) * Math.min(1, percentile(durationsOnEdge, 0.5) / Math.max(1, p95DurationMs))
    const presenceWeight = Math.max(0, slowPresenceRate - baselinePresenceRate)
    const impact = deltaWeight * 4 + latencyWeight * 1.5 + errorRate * 2 + repeatWeight + presenceWeight * 2
    return {
      key: entry.sample.key,
      source: entry.sample.source,
      target: entry.sample.target,
      sourceLabel: entry.sample.sourceLabel,
      targetLabel: entry.sample.targetLabel,
      kind: entry.kinds.size > 1 ? 'mixed' as const : [...entry.kinds][0] ?? 'sync',
      traceCount,
      traceRate: traceCount / traces.length,
      callCount: entry.calls,
      callsPerAffectedTrace,
      errorCount: entry.errors,
      errorTraceCount: entry.errorTraceIds.size,
      errorRate,
      p50Ms: percentile(durationsOnEdge, 0.5),
      p95Ms: percentile(durationsOnEdge, 0.95),
      baselineMedianMs,
      slowMedianMs,
      slowDeltaMs,
      baselineObservedTraceCount: baselineDurations.length,
      slowObservedTraceCount: slowDurations.length,
      latencyComparisonAvailable,
      baselinePresenceRate,
      slowPresenceRate,
      slowPresenceLift: slowPresenceRate - baselinePresenceRate,
      impact,
      rank: 0,
      traceIds: [...entry.traceIds],
      slowTraceIds: [...entry.traceIds].filter((traceId) => slowIds.has(traceId))
    }
  }).sort((left, right) => right.impact - left.impact || right.p95Ms - left.p95Ms || left.key.localeCompare(right.key))

  edgeRows.forEach((edge, index) => { edge.rank = index + 1 })
  const incidentImpact = new Map<string, number>()
  for (const edge of edgeRows) {
    incidentImpact.set(edge.source, Math.max(incidentImpact.get(edge.source) ?? 0, edge.impact))
    incidentImpact.set(edge.target, Math.max(incidentImpact.get(edge.target) ?? 0, edge.impact))
  }

  const nodeRows = [...services.values()].map((service) => ({
    id: service.id,
    label: service.label,
    ...(service.namespace ? { namespace: service.namespace } : {}),
    traceCount: service.traceIds.size,
    traceRate: service.traceIds.size / traces.length,
    rootTraceCount: service.rootTraceCount,
    spanCount: service.spanCount,
    errorTraceCount: service.errorTraceIds.size,
    errorRate: service.traceIds.size ? service.errorTraceIds.size / service.traceIds.size : 0,
    incidentImpact: incidentImpact.get(service.id) ?? 0
  })).sort((left, right) => right.rootTraceCount - left.rootTraceCount || right.traceCount - left.traceCount || left.id.localeCompare(right.id))

  return {
    traceCount: traces.length,
    p50DurationMs,
    p95DurationMs,
    baselineThresholdMs: baseline.at(-1)?.durationMs ?? p50DurationMs,
    slowThresholdMs: slow[0]?.durationMs ?? p95DurationMs,
    baselineTraceCount: baseline.length,
    slowTraceCount: slow.length,
    nodes: nodeRows,
    edges: edgeRows
  }
}
