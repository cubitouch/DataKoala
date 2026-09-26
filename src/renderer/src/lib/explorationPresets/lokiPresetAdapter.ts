import type { LokiBuilderState } from '@shared/loki'
import type { BuilderTimeRange } from '@lib/builderTimeRange'
import type { QueryMode, QuerySession } from '@store/useStore'
import type { ExplorationPresetAdapter } from './types'
import { clone, isRecord, oneOf, parseQueryMode, parseTimeRange, stringArray } from './validation'

export interface LokiPresetPayload { queryMode: QueryMode; sql: string; lokiBuilder: LokiBuilderState; lokiTimeRange: BuilderTimeRange; lokiResultLimit: number; lokiGroupBy: string[]; lokiResultView: QuerySession['lokiResultView'] }
function parseBuilder(value: unknown): LokiBuilderState | null {
  if (!isRecord(value) || !Array.isArray(value.labelMatchers) || !Array.isArray(value.lineFilters) || !Array.isArray(value.parsers) || !Array.isArray(value.fieldFilters)) return null
  const labels = value.labelMatchers.every((x) => isRecord(x) && typeof x.label === 'string' && oneOf(x.operator, ['=', '!=', '=~', '!~'] as const) && typeof x.value === 'string' && (x.values === undefined || stringArray(x.values)))
  const lines = value.lineFilters.every((x) => isRecord(x) && oneOf(x.operator, ['|=', '!=', '|~', '!~'] as const) && typeof x.value === 'string')
  const parsers = value.parsers.every((x) => isRecord(x) && oneOf(x.kind, ['json', 'logfmt', 'pattern', 'regexp'] as const) && (x.expression === undefined || typeof x.expression === 'string'))
  const fields = value.fieldFilters.every((x) => isRecord(x) && typeof x.field === 'string' && oneOf(x.operator, ['=', '!=', '=~', '!~'] as const) && typeof x.value === 'string')
  return labels && lines && parsers && fields ? clone(value) as unknown as LokiBuilderState : null
}
export const lokiPresetAdapter: ExplorationPresetAdapter<LokiPresetPayload> = {
  capture: (s) => clone({ queryMode: s.queryMode, sql: s.sql, lokiBuilder: s.lokiBuilder, lokiTimeRange: s.lokiTimeRange, lokiResultLimit: s.lokiResultLimit, lokiGroupBy: s.lokiGroupBy, lokiResultView: s.lokiResultView }),
  parse(value) {
    if (!isRecord(value) || typeof value.sql !== 'string' || !Number.isInteger(value.lokiResultLimit) || (value.lokiResultLimit as number) <= 0 || !stringArray(value.lokiGroupBy) || !oneOf(value.lokiResultView, ['list', 'table', 'patterns', 'line', 'area', 'bar', 'scatter', 'treemap', 'sunburst'] as const)) return null
    const queryMode = parseQueryMode(value.queryMode), lokiBuilder = parseBuilder(value.lokiBuilder), lokiTimeRange = parseTimeRange(value.lokiTimeRange)
    return queryMode && lokiBuilder && lokiTimeRange ? clone({ queryMode, sql: value.sql, lokiBuilder, lokiTimeRange, lokiResultLimit: value.lokiResultLimit as number, lokiGroupBy: value.lokiGroupBy, lokiResultView: value.lokiResultView }) : null
  },
  apply: (session, payload) => ({ ...session, ...clone(payload) })
}
