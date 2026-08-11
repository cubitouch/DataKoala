export const CHART_SERIES_SOFT_LIMIT = 30
export const CHART_SERIES_HARD_LIMIT = 100
export const CHART_POINTS_SOFT_LIMIT = 20_000
export const CHART_POINTS_HARD_LIMIT = 100_000
/** Planner estimates are advisory only outside this deliberately wide band. */
export const SERIES_STATS_ACCEPT_THRESHOLD = 50
export const SERIES_STATS_REJECT_THRESHOLD = 200
export const MAX_SERIES_PROBE_COLUMNS = 16
export const MAX_SERIES_PROBE_PREDICATES = 32

export type CardinalityProbePredicate =
  | { column: string; operator: 'equals' | 'notEquals'; value: string | number | boolean | null }
  | { column: string; operator: 'isNull' | 'isNotNull' }
  | { column: string; operator: 'range'; startInclusive: string; endExclusive: string; temporalType?: 'date' | 'datetime' | 'timestamp' }
  | { column: string; operator: 'gte' | 'lt'; value: string; temporalType?: 'date' | 'datetime' | 'timestamp' }
  | { column: string; operator: 'rolling'; amount: 1 | 3 | 6 | 7 | 12 | 24 | 30; unit: 'hour' | 'day' | 'month'; temporalType?: 'date' | 'datetime' | 'timestamp' }

export interface SeriesCardinalityProbeRequest {
  schema: string
  table: string
  /** Complete ordered Builder series dimension proposed by the user. */
  seriesColumns: string[]
  predicates: CardinalityProbePredicate[]
}

export interface SeriesCardinalityProbeResult {
  /** Bounded at CHART_SERIES_HARD_LIMIT + 1. */
  distinctCount: number
  exceedsHardLimit: boolean
}

export interface SeriesStatisticsRequest { schema: string; table: string; column: string }
export interface SeriesStatisticsResult {
  available: boolean
  estimatedDistinct?: number
  source: 'pg_stats'
}
