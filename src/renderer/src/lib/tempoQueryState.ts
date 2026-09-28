import type { BuilderTimeRange } from './builderTimeRange'
import { EMPTY_TRACE_BUILDER, type TraceBuilderState, type TraceSampleSize } from './traceBuilder'

export type TraceResultView = 'list' | 'scatter' | 'service-map'

export const DEFAULT_TRACE_RANGE: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }
export const DEFAULT_TRACE_SAMPLE_SIZE: TraceSampleSize = '250'
export const DEFAULT_TRACE_RESULT_VIEW: TraceResultView = 'list'

export function defaultTempoBuilder(): TraceBuilderState {
  return { ...EMPTY_TRACE_BUILDER, advancedFilters: [] }
}

export function cloneTempoBuilder(builder: TraceBuilderState): TraceBuilderState {
  return {
    ...builder,
    advancedFilters: builder.advancedFilters.map((filter) => filter.mode === 'compare' ? { ...filter } : { ...filter, values: [...filter.values] })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T => typeof value === 'string' && allowed.includes(value as T)

export function parseTempoBuilder(value: unknown): TraceBuilderState | null {
  if (!isRecord(value)) return null
  const stringFields = ['serviceNamespace', 'service', 'httpMethod', 'endpoint', 'rpcSystem', 'rpcService', 'rpcMethod', 'messagingSystem', 'messagingDestination', 'messagingOperation', 'dbSystem', 'dbOperation', 'spanName', 'minDurationMs'] as const
  if (stringFields.some((field) => typeof value[field] !== 'string')) return null
  if (!oneOf(value.spanKind, ['any', 'server', 'client', 'producer', 'consumer', 'internal', 'unspecified'] as const) ||
      !oneOf(value.protocol, ['any', 'http', 'rpc', 'messaging', 'database'] as const) ||
      !oneOf(value.status, ['any', 'unset', 'error', 'ok'] as const) || !Array.isArray(value.advancedFilters)) return null
  const advancedFilters: TraceBuilderState['advancedFilters'] = []
  for (const filter of value.advancedFilters) {
    if (!isRecord(filter) || typeof filter.attribute !== 'string' || !oneOf(filter.scope, ['resource', 'span'] as const)) return null
    if (oneOf(filter.mode, ['include', 'exclude'] as const) && Array.isArray(filter.values) && !filter.values.some((item) => typeof item !== 'string')) {
      advancedFilters.push({ attribute: filter.attribute, scope: filter.scope, mode: filter.mode, values: [...filter.values] as string[] })
      continue
    }
    if (filter.mode === 'compare' && oneOf(filter.operator, ['>', '>=', '<', '<=', '=~', '!~'] as const) && typeof filter.value === 'string') {
      advancedFilters.push({ attribute: filter.attribute, scope: filter.scope, mode: 'compare', operator: filter.operator, value: filter.value })
      continue
    }
    return null
  }
  return { ...Object.fromEntries(stringFields.map((field) => [field, value[field]])), spanKind: value.spanKind, protocol: value.protocol, status: value.status, advancedFilters } as TraceBuilderState
}

export function parseTempoSampleSize(value: unknown): TraceSampleSize | null {
  return oneOf(value, ['100', '250', '500', 'all'] as const) ? value : null
}

export function parseTraceResultView(value: unknown): TraceResultView | null {
  return oneOf(value, ['list', 'scatter', 'service-map'] as const) ? value : null
}
