import type { QuerySession } from '@store/useStore'
import { DEFAULT_PROMQL_BUILDER } from '@lib/promqlBuilder'
import { DEFAULT_LOKI_BUILDER } from '@shared/loki'
import { defaultTempoBuilder } from '@lib/tempoQueryState'

export function testSession(options: Partial<QuerySession> = {}): QuerySession {
  return {
    id: 'session', title: 'Query', connectionProfileId: 'profile', sql: '', manualQueryPristine: false,
    prometheusTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' }, prometheusStep: 'auto', promqlBuilder: { ...DEFAULT_PROMQL_BUILDER, filterBy: [], groupBy: [], labelValues: {} },
    lokiTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' }, lokiBuilder: { ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }, lokiResultLimit: 1000, lokiGroupBy: [], lokiResultView: 'list', lokiRangeHistory: [],
    tempoBuilder: defaultTempoBuilder(), tempoTimeRange: { kind: 'rolling', amount: 1, unit: 'hour' }, tempoSampleSize: '250', tempoResultView: 'list',
    running: false, queryError: null, result: null, pendingResult: null, resultRevision: 0, lastSuccessfulResultRevision: 0, isResultStale: false,
    queryMode: 'sql', builder: { table: null, timeColumn: null, timeBucket: 'day', seriesColumns: [] }, builderHasRun: false,
    sqlVisualization: { view: 'table', xColumn: null, valueColumn: null, aggregation: 'sum', seriesColumn: null, seriesColumns: [], hierarchyDimensions: [], valueAxisScale: 'linear', anomalyDetectionEnabled: false },
    builderVisualization: { view: 'line', xColumn: null, valueColumn: null, aggregation: 'count', seriesColumn: null, seriesColumns: [], hierarchyDimensions: [], valueAxisScale: 'linear', anomalyDetectionEnabled: false },
    sqlResultFilters: [], builderResultFilters: [], queryFilterRevision: { sql: 0, builder: 0 }, builderFilterNotice: null,
    explainText: null, showExplain: false, activeExplainRequest: null, seriesVisibility: {}, ...options
  }
}

