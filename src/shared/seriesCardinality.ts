import {
  CHART_SERIES_HARD_LIMIT,
  type SeriesCardinalityProbeRequest,
} from './chartLimits.ts'
import type { SqlDialect } from './types.ts'

export function quotePostgresIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

/** Builds a bounded, parameterized probe. Only identifiers are interpolated, after quoting. */
export function buildSeriesCardinalityProbe(
  request: SeriesCardinalityProbeRequest,
  dialect: SqlDialect = 'postgres',
): { sql: string; groupedSql: string; parameters: unknown[] } {
  const quoteGoogle = (value: string) =>
    '`' +
    Array.from(value, (char) => {
      if (char === '\\' || char === '`') return '\\' + char
      const code = char.charCodeAt(0)
      return code < 32 || code === 127
        ? `\\u${code.toString(16).padStart(4, '0')}`
        : char
    }).join('') +
    '`'
  const quote = (value: string) =>
    dialect === 'google-sql'
      ? quoteGoogle(value)
      : quotePostgresIdentifier(value)
  const column = quote(request.seriesColumn)
  const parameters: unknown[] = []
  const googleTemporalValue = (
    value: string,
    temporalType: 'date' | 'datetime' | 'timestamp' | undefined,
  ) => {
    if (dialect !== 'google-sql') return value
    if (temporalType === 'date') return value.slice(0, 10)
    if (
      temporalType === 'timestamp' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    )
      return `${value}:00Z`
    return value
  }
  const predicates = request.predicates.map((predicate) => {
    const column = quote(predicate.column)
    const temporalType =
      'temporalType' in predicate ? predicate.temporalType : undefined
    const googleParameter = () =>
      `CAST(? AS ${temporalType === 'date' ? 'DATE' : temporalType === 'datetime' ? 'DATETIME' : 'TIMESTAMP'})`
    if (predicate.operator === 'isNull') return `${column} IS NULL`
    if (predicate.operator === 'isNotNull') return `${column} IS NOT NULL`
    if (predicate.operator === 'range') {
      parameters.push(
        googleTemporalValue(predicate.startInclusive, temporalType),
        googleTemporalValue(predicate.endExclusive, temporalType),
      )
      return `${column} >= ${dialect === 'google-sql' ? googleParameter() : `$${parameters.length - 1}`} AND ${column} < ${dialect === 'google-sql' ? googleParameter() : `$${parameters.length}`}`
    }
    if (predicate.operator === 'gte' || predicate.operator === 'lt') {
      parameters.push(googleTemporalValue(predicate.value, temporalType))
      return `${column} ${predicate.operator === 'gte' ? '>=' : '<'} ${dialect === 'google-sql' ? googleParameter() : `$${parameters.length}`}`
    }
    if (predicate.operator === 'rolling') {
      const interval =
        predicate.unit === 'hour' && predicate.amount === 24
          ? '1 day'
          : `${predicate.amount} ${predicate.amount === 1 ? predicate.unit : `${predicate.unit}s`}`
      if (dialect === 'google-sql') {
        const current =
          predicate.temporalType === 'date'
            ? 'CURRENT_DATE()'
            : predicate.temporalType === 'datetime'
              ? 'CURRENT_DATETIME()'
              : 'CURRENT_TIMESTAMP()'
        const boundary =
          predicate.temporalType === 'date'
            ? predicate.unit === 'minute' || predicate.unit === 'hour'
              ? `DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${predicate.amount} ${predicate.unit.toUpperCase()}))`
              : `DATE_SUB(${current}, INTERVAL ${predicate.amount} ${predicate.unit.toUpperCase()})`
            : predicate.temporalType === 'datetime'
              ? `DATETIME_SUB(${current}, INTERVAL ${predicate.amount} ${predicate.unit.toUpperCase()})`
              : predicate.unit === 'month'
                ? `TIMESTAMP(DATETIME_SUB(DATETIME(${current}), INTERVAL ${predicate.amount} MONTH))`
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
  const relation =
    dialect === 'google-sql'
      ? quoteGoogle(`${request.schema}.${request.table}`)
      : `${quote(request.schema)}.${quote(request.table)}`
  const groupedSql = `SELECT ${column}\n  FROM ${relation}${predicates.length ? `\n  WHERE ${predicates.join(' AND ')}` : ''}\n  GROUP BY ${column}`
  return {
    sql: `SELECT count(*) AS ${quote('count')}\nFROM (\n  ${groupedSql}\n  LIMIT ${CHART_SERIES_HARD_LIMIT + 1}\n) AS ${quote('cardinality_probe')};`,
    groupedSql,
    parameters,
  }
}

/** Builds BigQuery's single-field approximate preflight from the same generated source/predicates as the exact probe. */
export function buildBigQuerySeriesCardinalityApproxProbe(
  request: SeriesCardinalityProbeRequest,
): { sql: string; parameters: unknown[] } {
  const exact = buildSeriesCardinalityProbe(request, 'google-sql')
  const fromIndex = exact.groupedSql.indexOf('\n  FROM ')
  const groupByIndex = exact.groupedSql.lastIndexOf('\n  GROUP BY ')
  if (fromIndex < 0 || groupByIndex <= fromIndex)
    throw new Error('Invalid generated BigQuery cardinality probe.')
  const dimension = exact.groupedSql.slice('SELECT '.length, fromIndex)
  const source = exact.groupedSql.slice(fromIndex, groupByIndex)
  return {
    sql: `SELECT APPROX_COUNT_DISTINCT(${dimension}) AS \`count\`${source};`,
    parameters: exact.parameters,
  }
}
