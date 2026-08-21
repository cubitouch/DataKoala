import { performance } from 'node:perf_hooks'

export type TempoPerformanceOperation = 'search.sample' | 'search.exhaustive' | 'trace.get'

export interface TempoProviderMetrics {
  inspectedBytes?: number
  inspectedTraces?: number
  totalBlocks?: number
  completedJobs?: number
  totalJobs?: number
  [name: string]: number | undefined
}

export interface TempoGcxInvocationTiming {
  phase: string
  gcxWallMs: number
  stdoutBytes: number
  providerMetrics?: TempoProviderMetrics
}

export interface TempoGcxInvocationMeasurement {
  phase: string
  gcxWallMs: number
  stdout: string
  raw?: unknown
}

export interface TempoPerformanceSummary {
  requestId: string
  operation: TempoPerformanceOperation
  totalMs: number
  gcxInvocations: number
  gcxTotalMs: number
  gcx: TempoGcxInvocationTiming[]
  parseMs: number
  normalizeMs: number
  rootStatusEnrichmentMs?: number
  rootStatusQueries?: number
  rowCount?: number
  spanCount?: number
  boundedTraceLookup?: boolean
  completedChunks?: number
}

export const tempoPerformanceEnabled = (): boolean => process.env.DATAKOALA_TEMPO_PERF === '1'

export function tempoPerformanceLog(event: string, fields: Record<string, unknown>): void {
  if (!tempoPerformanceEnabled()) return
  console.info(`[tempo-perf] ${JSON.stringify({ event, ...fields })}`)
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Tolerates direct Tempo responses and gcx data wrappers. Diagnostics never affect query success. */
export function extractTempoProviderMetrics(raw: unknown): TempoProviderMetrics | undefined {
  const outer = record(raw)
  const data = record(outer?.data)
  const metrics = record(outer?.metrics) ?? record(data?.metrics)
  if (!metrics) return undefined
  const output: TempoProviderMetrics = {}
  for (const [key, value] of Object.entries(metrics)) {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
    if (Number.isFinite(numeric)) output[key] = numeric
  }
  return Object.keys(output).length ? output : undefined
}

export class TempoPerformanceCollector {
  readonly requestId: string
  readonly operation: TempoPerformanceOperation
  private readonly started: number
  private readonly clock: () => number
  private readonly gcx: TempoGcxInvocationTiming[] = []
  private parseMs = 0
  private normalizeMs = 0
  private rootStatusEnrichmentMs?: number
  private rootStatusQueries?: number

  constructor(requestId: string, operation: TempoPerformanceOperation, now: () => number = () => performance.now()) {
    this.requestId = requestId
    this.operation = operation
    this.clock = now
    this.started = now()
    tempoPerformanceLog('operation.start', { requestId, operation })
  }

  now(): number { return this.clock() }
  recordGcx({ phase, gcxWallMs, stdout, raw }: TempoGcxInvocationMeasurement): void {
    const providerMetrics = extractTempoProviderMetrics(raw)
    const timing: TempoGcxInvocationTiming = {
      phase, gcxWallMs, stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
      ...(providerMetrics ? { providerMetrics } : {})
    }
    this.gcx.push(timing)
    tempoPerformanceLog('gcx.complete', { requestId: this.requestId, operation: this.operation, ...timing })
  }
  recordParse(durationMs: number): void { this.parseMs += durationMs }
  recordNormalize(durationMs: number): void { this.normalizeMs += durationMs }
  recordRootStatus(durationMs: number, queries: number): void { this.rootStatusEnrichmentMs = durationMs; this.rootStatusQueries = queries }
  complete(fields: Pick<TempoPerformanceSummary, 'rowCount' | 'spanCount' | 'boundedTraceLookup' | 'completedChunks'> = {}): TempoPerformanceSummary {
    const summary: TempoPerformanceSummary = {
      requestId: this.requestId, operation: this.operation, totalMs: this.clock() - this.started,
      gcxInvocations: this.gcx.length, gcxTotalMs: this.gcx.reduce((sum, item) => sum + item.gcxWallMs, 0), gcx: [...this.gcx],
      parseMs: this.parseMs, normalizeMs: this.normalizeMs,
      ...(this.rootStatusEnrichmentMs === undefined ? {} : { rootStatusEnrichmentMs: this.rootStatusEnrichmentMs, rootStatusQueries: this.rootStatusQueries }),
      ...fields
    }
    tempoPerformanceLog('operation.complete', summary as unknown as Record<string, unknown>)
    return summary
  }
}

export function createTempoPerformance(requestId: string | undefined, operation: TempoPerformanceOperation): TempoPerformanceCollector | undefined {
  return tempoPerformanceEnabled() ? new TempoPerformanceCollector(requestId || `main-${process.pid}-${Date.now()}`, operation) : undefined
}
