import {
  CHART_SERIES_HARD_LIMIT,
  SERIES_STATS_ACCEPT_THRESHOLD,
  SERIES_STATS_REJECT_THRESHOLD,
  type SeriesCardinalityProbeResult,
  type SeriesStatisticsRequest,
  type SeriesStatisticsResult,
} from '../shared/chartLimits.ts'
import { buildSeriesCardinalityProbe } from '../shared/seriesCardinality.ts'
import { validateSeriesCardinalityRequest } from '../shared/seriesCardinalityValidation.ts'
import {
  interpretSeriesStatistics,
  SERIES_STATISTICS_SQL,
} from '../shared/seriesStatistics.ts'
import { sqlDialectForSourceKind } from '../shared/types.ts'
import type { DataSourceSession } from './data-source.ts'

export interface ProbeMeasurement {
  provider: string
  strategy:
    | 'postgres-pg-stats'
    | 'postgres-planner'
    | 'bigquery-exact'
    | 'exact'
  seriesColumnCount: number
  hasPredicates: boolean
  durationMs: number
  result: 'accepted' | 'rejected' | 'fallback' | 'error'
  bytesProcessed?: number
}

/** Never interpret a missing, partial, or malformed plan as zero groups. */
export function groupedPlanEstimate(value: unknown): number | undefined {
  try {
    const plan = typeof value === 'string' ? JSON.parse(value) : value
    const rows = plan?.[0]?.Plan?.['Plan Rows']
    return typeof rows === 'number' && Number.isFinite(rows) && rows >= 0
      ? rows
      : undefined
  } catch {
    return undefined
  }
}

/** PostgreSQL-native table statistics lookup; unavailable for every other provider. */
export async function seriesStatistics(
  session: DataSourceSession,
  request: SeriesStatisticsRequest,
): Promise<SeriesStatisticsResult> {
  const unavailable = { available: false, source: 'pg_stats' as const }
  if (session.info.provider !== 'postgres') return unavailable
  try {
    const result = await session.query({
      sql: SERIES_STATISTICS_SQL,
      parameters: [request.schema, request.table, request.column],
    })
    return interpretSeriesStatistics(result.rows[0])
  } catch {
    return unavailable
  }
}

/** In-flight reuse only, isolated by actual session identity (including reconnects). */
export class SeriesCardinalityProbes {
  private readonly inFlight = new WeakMap<
    DataSourceSession,
    Map<string, Promise<SeriesCardinalityProbeResult>>
  >()
  private readonly measure: (measurement: ProbeMeasurement) => void
  constructor(measure: (measurement: ProbeMeasurement) => void = () => {}) {
    this.measure = measure
  }

  probe(
    session: DataSourceSession,
    input: unknown,
  ): Promise<SeriesCardinalityProbeResult> {
    const request = validateSeriesCardinalityRequest(input)
    const provider = session.info.provider
    if (
      !['postgres', 'bigquery', 'local-files', 'sqlite-file'].includes(provider)
    )
      throw new Error('Series cardinality requires a SQL datasource.')
    const key = JSON.stringify(request)
    let requests = this.inFlight.get(session)
    if (!requests) {
      requests = new Map()
      this.inFlight.set(session, requests)
    }
    const existing = requests.get(key)
    if (existing) return existing
    const pending = this.execute(session, request).finally(() =>
      requests.delete(key),
    )
    requests.set(key, pending)
    return pending
  }

  private async execute(
    session: DataSourceSession,
    request: ReturnType<typeof validateSeriesCardinalityRequest>,
  ): Promise<SeriesCardinalityProbeResult> {
    const provider = session.info.provider
    const probe = buildSeriesCardinalityProbe(
      request,
      sqlDialectForSourceKind(provider),
    )
    const record = (
      strategy: ProbeMeasurement['strategy'],
      started: number,
      result: ProbeMeasurement['result'],
      bytesProcessed?: number,
    ) => {
      this.measure({
        provider,
        strategy,
        seriesColumnCount: request.seriesColumns.length,
        hasPredicates: request.predicates.length > 0,
        durationMs: performance.now() - started,
        result,
        ...(bytesProcessed === undefined ? {} : { bytesProcessed }),
      })
    }
    if (provider === 'postgres') {
      const simpleUnscoped =
        request.seriesColumns.length === 1 && request.predicates.length === 0
      if (simpleUnscoped) {
        const started = performance.now()
        const statistics = await seriesStatistics(session, {
          schema: request.schema,
          table: request.table,
          column: request.seriesColumns[0],
        })
        const estimate =
          statistics.available &&
          statistics.estimatedDistinct !== undefined &&
          Number.isFinite(statistics.estimatedDistinct) &&
          statistics.estimatedDistinct >= 0
            ? statistics.estimatedDistinct
            : undefined
        if (
          estimate !== undefined &&
          estimate <= SERIES_STATS_ACCEPT_THRESHOLD
        ) {
          record('postgres-pg-stats', started, 'accepted')
          return {
            distinctCount: estimate,
            exceedsHardLimit: false,
            estimated: true,
          }
        }
        if (
          estimate !== undefined &&
          estimate > SERIES_STATS_REJECT_THRESHOLD
        ) {
          record('postgres-pg-stats', started, 'rejected')
          return {
            distinctCount: estimate,
            exceedsHardLimit: true,
            estimated: true,
          }
        }
        record('postgres-pg-stats', started, 'fallback')
      } else {
        const started = performance.now()
        let estimate: number | undefined
        try {
          const result = await session.query({
            sql: `EXPLAIN (FORMAT JSON) ${probe.groupedSql}`,
            parameters: probe.parameters,
          })
          estimate = groupedPlanEstimate(result.rows[0]?.['QUERY PLAN'])
        } catch {
          // Unsupported plans/permissions are not decisive: fall back to exact.
        }
        if (
          estimate !== undefined &&
          estimate <= SERIES_STATS_ACCEPT_THRESHOLD
        ) {
          record('postgres-planner', started, 'accepted')
          return {
            distinctCount: estimate,
            exceedsHardLimit: false,
            estimated: true,
          }
        }
        if (
          estimate !== undefined &&
          estimate > SERIES_STATS_REJECT_THRESHOLD
        ) {
          record('postgres-planner', started, 'rejected')
          return {
            distinctCount: estimate,
            exceedsHardLimit: true,
            estimated: true,
          }
        }
        record('postgres-planner', started, 'fallback')
      }
    }
    const started = performance.now()
    try {
      const result = session.querySeriesCardinality
        ? await session.querySeriesCardinality(request)
        : await session.query({ sql: probe.sql, parameters: probe.parameters })
      const rawCount = result.rows[0]?.count
      const distinctCount =
        typeof rawCount === 'number' ||
        (typeof rawCount === 'string' && /^\d+$/.test(rawCount))
          ? Number(rawCount)
          : NaN
      if (
        result.rows.length !== 1 ||
        !Number.isSafeInteger(distinctCount) ||
        distinctCount < 0 ||
        distinctCount > CHART_SERIES_HARD_LIMIT + 1
      )
        throw new Error('Invalid cardinality probe result.')
      const exceedsHardLimit = distinctCount > CHART_SERIES_HARD_LIMIT
      record(
        provider === 'bigquery' ? 'bigquery-exact' : 'exact',
        started,
        exceedsHardLimit ? 'rejected' : 'accepted',
        result.execution?.bytesProcessed,
      )
      return { distinctCount, exceedsHardLimit }
    } catch (error) {
      record(
        provider === 'bigquery' ? 'bigquery-exact' : 'exact',
        started,
        'error',
      )
      throw error
    }
  }
}
