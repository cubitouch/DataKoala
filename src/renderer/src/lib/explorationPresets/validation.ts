import type { QueryLanguage } from '@shared/types'
import type { BuilderQueryState, QueryMode, QuerySession } from '@store/useStore'
import type { BuilderTimeRange } from '@lib/builderTimeRange'
import type { VisualizationConfiguration } from '@lib/resultVisualization'

export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
export const oneOf = <T>(value: unknown, allowed: readonly T[]): value is T => allowed.includes(value as T)
export const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
export const finiteTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
export const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function parseQueryMode(value: unknown): QueryMode | null {
  return value === 'sql' || value === 'builder' ? value : null
}

export function parseQueryLanguage(value: unknown): QueryLanguage | null {
  if (!isRecord(value)) return null
  if (value.kind === 'promql' || value.kind === 'traceql' || value.kind === 'logql') return { kind: value.kind }
  if (value.kind === 'sql' && oneOf(value.dialect, ['postgres', 'duckdb', 'google-sql'] as const)) return { kind: 'sql', dialect: value.dialect }
  return null
}

export function equalQueryLanguages(left: QueryLanguage, right: QueryLanguage): boolean {
  return left.kind === right.kind && (left.kind !== 'sql' || (right.kind === 'sql' && left.dialect === right.dialect))
}

export function parseTimeRange(value: unknown): BuilderTimeRange | null {
  if (!isRecord(value)) return null
  const recurringWindows = value.recurringWindows === undefined ? undefined : Array.isArray(value.recurringWindows) && value.recurringWindows.every((window) => isRecord(window) && typeof window.id === 'string' && typeof window.from === 'string' && typeof window.to === 'string')
    ? value.recurringWindows.map((window) => ({ id: window.id as string, from: window.from as string, to: window.to as string })) : null
  if (recurringWindows === null) return null
  if (value.kind === 'all') return { kind: 'all', ...(recurringWindows ? { recurringWindows } : {}) }
  if (value.kind === 'rolling' && typeof value.amount === 'number') {
    const valid = (value.unit === 'minute' && oneOf(value.amount, [15, 30] as const)) ||
      (value.unit === 'hour' && oneOf(value.amount, [1, 3, 6, 12, 24] as const)) ||
      (value.unit === 'day' && oneOf(value.amount, [7, 30] as const)) ||
      (value.unit === 'month' && oneOf(value.amount, [3, 6, 12] as const))
    return valid ? clone(value) as BuilderTimeRange : null
  }
  if (value.kind !== 'custom') return null
  if ((value.startDate !== null && typeof value.startDate !== 'string') || (value.endDate !== null && typeof value.endDate !== 'string') || typeof value.startTime !== 'string' || typeof value.endTime !== 'string') return null
  return clone(value) as BuilderTimeRange
}

export function parseBuilder(value: unknown): BuilderQueryState | null {
  if (!isRecord(value) || !oneOf(value.timeBucket, ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'] as const) || !stringArray(value.seriesColumns)) return null
  if (value.table !== null && (!isRecord(value.table) || typeof value.table.schema !== 'string' || typeof value.table.name !== 'string')) return null
  if (value.timeColumn !== null && typeof value.timeColumn !== 'string') return null
  const timeRange = value.timeRange === undefined ? undefined : parseTimeRange(value.timeRange)
  if (value.timeRange !== undefined && !timeRange) return null
  return clone(value) as unknown as BuilderQueryState
}

export function parseVisualization(value: unknown): VisualizationConfiguration | null {
  if (!isRecord(value) || !oneOf(value.view, ['table', 'bar', 'line', 'area', 'scatter', 'treemap', 'sunburst'] as const) || !oneOf(value.aggregation, ['sum', 'average', 'minimum', 'maximum', 'count'] as const)) return null
  for (const field of ['xColumn', 'valueColumn', 'seriesColumn'] as const) if (value[field] !== null && typeof value[field] !== 'string') return null
  if (value.seriesColumns !== undefined && !stringArray(value.seriesColumns)) return null
  if (value.hierarchyDimensions !== undefined && !stringArray(value.hierarchyDimensions)) return null
  if (value.valueAxisScale !== undefined && !oneOf(value.valueAxisScale, ['linear', 'log'] as const)) return null
  if (value.anomalyDetectionEnabled !== undefined && typeof value.anomalyDetectionEnabled !== 'boolean') return null
  return clone(value) as unknown as VisualizationConfiguration
}

export type SessionPatch = Partial<QuerySession>
