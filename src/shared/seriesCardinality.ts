import { CHART_SERIES_HARD_LIMIT, type SeriesCardinalityProbeRequest } from './chartLimits.ts'
import type { SqlDialect } from './types.ts'

export function quotePostgresIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

/** Builds a bounded, parameterized probe. Only identifiers are interpolated, after quoting. */
export function buildSeriesCardinalityProbe(request: SeriesCardinalityProbeRequest, dialect: SqlDialect = 'postgres'): { sql: string; parameters: unknown[] } {
  if (!request.seriesColumns.length) throw new Error('A cardinality probe requires at least one series column.')
  const quote = (value: string) => dialect === 'google-sql' ? `\`${value.replaceAll('`', '``')}\`` : quotePostgresIdentifier(value)
  const columns = request.seriesColumns.map(quote)
  // A tuple preserves each combination (including NULLs) and cannot collide the
  // way Builder's human-readable display separator could.
  const dimension = columns.length === 1 ? columns[0] : dialect === 'google-sql' ? `STRUCT(${columns.join(', ')})` : `(${columns.join(', ')})`
  const parameters: unknown[] = []
  const predicates = request.predicates.map((predicate) => {
    const column = quote(predicate.column)
    const temporalType = 'temporalType' in predicate ? predicate.temporalType : undefined
    const googleParameter = () => `CAST(? AS ${temporalType === 'date' ? 'DATE' : temporalType === 'datetime' ? 'DATETIME' : 'TIMESTAMP'})`
    if (predicate.operator === 'isNull') return `${column} IS NULL`
    if (predicate.operator === 'isNotNull') return `${column} IS NOT NULL`
    if (predicate.operator === 'range') {
      parameters.push(temporalType === 'date' ? predicate.startInclusive.slice(0, 10) : predicate.startInclusive, temporalType === 'date' ? predicate.endExclusive.slice(0, 10) : predicate.endExclusive)
      return `${column} >= ${dialect === 'google-sql' ? googleParameter() : `$${parameters.length - 1}`} AND ${column} < ${dialect === 'google-sql' ? googleParameter() : `$${parameters.length}`}`
    }
    if (predicate.operator === 'gte' || predicate.operator === 'lt') {
      parameters.push(temporalType === 'date' ? predicate.value.slice(0, 10) : predicate.value)
      return `${column} ${predicate.operator === 'gte' ? '>=' : '<'} ${dialect === 'google-sql' ? googleParameter() : `$${parameters.length}`}`
    }
    if (predicate.operator === 'rolling') {
      const interval = predicate.unit === 'hour' && predicate.amount === 24
        ? '1 day'
        : `${predicate.amount} ${predicate.amount === 1 ? predicate.unit : `${predicate.unit}s`}`
      if (dialect === 'google-sql') {
        const current = predicate.temporalType === 'date' ? 'CURRENT_DATE()' : predicate.temporalType === 'datetime' ? 'CURRENT_DATETIME()' : 'CURRENT_TIMESTAMP()'
        const boundary = predicate.temporalType === 'date' ? predicate.unit === 'hour' ? `DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${predicate.amount} HOUR))` : `DATE_SUB(${current}, INTERVAL ${predicate.amount} ${predicate.unit.toUpperCase()})`
          : predicate.temporalType === 'datetime' ? `DATETIME_SUB(${current}, INTERVAL ${predicate.amount} ${predicate.unit.toUpperCase()})`
            : predicate.unit === 'month' ? `TIMESTAMP(DATETIME_SUB(DATETIME(${current}), INTERVAL ${predicate.amount} MONTH))`
              : `TIMESTAMP_SUB(${current}, INTERVAL ${predicate.amount} ${predicate.unit.toUpperCase()})`
        return `${column} >= ${boundary}`
      }
      return `${column} >= CURRENT_TIMESTAMP - INTERVAL '${interval}'`
    }
    if (predicate.operator === 'equals' || predicate.operator === 'notEquals') {
      parameters.push(predicate.value)
      return `${column} ${predicate.operator === 'equals' ? '=' : 'IS DISTINCT FROM'} ${dialect === 'google-sql' ? '?' : `$${parameters.length}`}`
    }
    // Runtime IPC validation remains fail-closed even if an untyped caller sends
    // an operator outside the shared request union.
    throw new Error('Unsupported cardinality probe predicate.')
  })
  return {
    sql: `SELECT count(*) AS ${quote('count')}\nFROM (\n  SELECT ${dimension}\n  FROM ${dialect === 'google-sql' ? `\`${[...request.schema.split('.'), request.table].map((part) => part.replaceAll('`', '``')).join('.')}\`` : `${quote(request.schema)}.${quote(request.table)}`}${predicates.length ? `\n  WHERE ${predicates.join(' AND ')}` : ''}\n  GROUP BY ${dimension}\n  LIMIT ${CHART_SERIES_HARD_LIMIT + 1}\n) AS ${quote('cardinality_probe')};`,
    parameters
  }
}
