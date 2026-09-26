import type { BuilderTimeRange } from '@lib/builderTimeRange'
import { parseTempoBuilder, type TraceResultView } from '@lib/tempoQueryState'
import type { TraceBuilderState, TraceSampleSize } from '@lib/traceBuilder'
import type { QueryMode } from '@store/useStore'
import type { ExplorationPresetAdapter } from './types'
import { clone, isRecord, oneOf, parseQueryMode, parseTimeRange } from './validation'

export interface TempoPresetPayload { queryMode: QueryMode; sql: string; tempoBuilder: TraceBuilderState; tempoTimeRange: BuilderTimeRange; tempoSampleSize: TraceSampleSize; tempoResultView: TraceResultView }
export const tempoPresetAdapter: ExplorationPresetAdapter<TempoPresetPayload> = {
  capture: (s) => clone({ queryMode: s.queryMode, sql: s.sql, tempoBuilder: s.tempoBuilder, tempoTimeRange: s.tempoTimeRange, tempoSampleSize: s.tempoSampleSize, tempoResultView: s.tempoResultView }),
  parse(value) {
    if (!isRecord(value) || typeof value.sql !== 'string' || !oneOf(value.tempoSampleSize, ['100', '250', '500', 'all'] as const) || !oneOf(value.tempoResultView, ['list', 'scatter', 'service-map'] as const)) return null
    const queryMode = parseQueryMode(value.queryMode), tempoBuilder = parseTempoBuilder(value.tempoBuilder), tempoTimeRange = parseTimeRange(value.tempoTimeRange)
    return queryMode && tempoBuilder && tempoTimeRange ? clone({ queryMode, sql: value.sql, tempoBuilder, tempoTimeRange, tempoSampleSize: value.tempoSampleSize, tempoResultView: value.tempoResultView }) : null
  },
  apply: (session, payload) => ({ ...session, ...clone(payload) })
}

