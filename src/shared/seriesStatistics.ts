import type { SeriesStatisticsResult } from './chartLimits'

export const SERIES_STATISTICS_SQL = `SELECT
  s.n_distinct,
  c.reltuples
FROM pg_catalog.pg_stats AS s
JOIN pg_catalog.pg_namespace AS n
  ON n.nspname = s.schemaname
JOIN pg_catalog.pg_class AS c
  ON c.relnamespace = n.oid
 AND c.relname = s.tablename
JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid = c.oid
 AND a.attname = s.attname
 AND NOT a.attisdropped
WHERE s.schemaname = $1
  AND s.tablename = $2
  AND s.attname = $3;`

export function interpretSeriesStatistics(row: Record<string, unknown> | undefined): SeriesStatisticsResult {
  if (!row) return { available: false, source: 'pg_stats' }
  if (row.n_distinct === null || row.n_distinct === undefined || row.n_distinct === '' ||
      row.reltuples === null || row.reltuples === undefined || row.reltuples === '') return { available: false, source: 'pg_stats' }
  const nDistinct = Number(row.n_distinct)
  const reltuples = Number(row.reltuples)
  if (!Number.isFinite(nDistinct) || !Number.isFinite(reltuples) || reltuples < 0) return { available: false, source: 'pg_stats' }
  const estimatedDistinct = nDistinct >= 0 ? nDistinct : Math.abs(nDistinct) * reltuples
  if (!Number.isFinite(estimatedDistinct) || estimatedDistinct < 0) return { available: false, source: 'pg_stats' }
  return { available: true, estimatedDistinct, source: 'pg_stats' }
}
