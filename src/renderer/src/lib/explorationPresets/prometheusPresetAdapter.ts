import type { QueryMode, QuerySession } from '@store/useStore'
import type { BuilderTimeRange } from '@lib/builderTimeRange'
import type { PromqlBuilderState } from '@lib/promqlBuilder'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import type { ExplorationPresetAdapter } from './types'
import { clone, isRecord, oneOf, parseQueryMode, parseTimeRange, parseVisualization, stringArray } from './validation'

export interface PrometheusPresetPayload { queryMode: QueryMode; sql: string; promqlBuilder: PromqlBuilderState; prometheusTimeRange: BuilderTimeRange; prometheusStep: QuerySession['prometheusStep']; sqlVisualization: VisualizationConfiguration }

function parseBuilder(value: unknown): PromqlBuilderState | null {
  if (!isRecord(value) || typeof value.metric !== 'string' || !stringArray(value.filterBy) || !stringArray(value.groupBy) || !isRecord(value.labelValues)) return null
  if (!Object.values(value.labelValues).every(stringArray)) return null
  if (!oneOf(value.calculation, ['raw', 'rate', 'increase', 'observation-rate', 'histogram-average', 'histogram-sum', 'percentile'] as const) || !oneOf(value.aggregation, ['none', 'sum', 'avg', 'min', 'max'] as const) || !oneOf(value.window, ['1m', '5m', '10m', '15m', '30m', '1h'] as const) || !oneOf(value.percentile, [0.5, 0.75, 0.9, 0.95, 0.99, 0.999] as const)) return null
  if (value.histogramKindOverride !== undefined && !oneOf(value.histogramKindOverride, ['auto', 'classic', 'native'] as const)) return null
  return clone(value) as unknown as PromqlBuilderState
}

export const prometheusPresetAdapter: ExplorationPresetAdapter<PrometheusPresetPayload> = {
  capture: (session) => clone({ queryMode: session.queryMode, sql: session.sql, promqlBuilder: session.promqlBuilder, prometheusTimeRange: session.prometheusTimeRange, prometheusStep: session.prometheusStep, sqlVisualization: session.sqlVisualization }),
  parse(value) {
    if (!isRecord(value) || typeof value.sql !== 'string' || !oneOf(value.prometheusStep, ['auto', '15s', '30s', '1m', '2m', '5m', '10m', '15m', '30m', '1h', '2h', '6h', '12h', '1d'] as const)) return null
    const queryMode = parseQueryMode(value.queryMode), promqlBuilder = parseBuilder(value.promqlBuilder), prometheusTimeRange = parseTimeRange(value.prometheusTimeRange), sqlVisualization = parseVisualization(value.sqlVisualization)
    return queryMode && promqlBuilder && prometheusTimeRange && sqlVisualization ? clone({ queryMode, sql: value.sql, promqlBuilder, prometheusTimeRange, prometheusStep: value.prometheusStep, sqlVisualization }) : null
  },
  apply: (session, payload) => ({ ...session, ...clone(payload) })
}
