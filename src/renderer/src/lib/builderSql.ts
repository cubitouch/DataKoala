import type { TimeBucket } from '@store/useStore'
import type { Aggregation } from './resultVisualization.ts'
import {
  BUILDER_AGGREGATIONS,
  BUILDER_TIME_BUCKETS,
  isBuilderTemporalDataType,
  isBuilderTimeBucketSupported,
} from '@shared/builderCapabilities.ts'
import {
  isMinuteBucketAvailable,
  MINUTE_BUCKET_UNAVAILABLE_REASON,
  SEVEN_DAYS,
  validateBuilderTimeRange,
  type BuilderTimeRange,
} from './builderTimeRange.ts'
import { customRangeToQueryBounds } from './customTimeRange.ts'
import { isPromotableFilter, type ResultFilter } from './resultFilters.ts'
import { resolveBuilderPromotedFilters } from './builderPromotedFilters.ts'
import {
  quoteGoogleIdentifier,
  quotePostgresIdentifier,
} from '@shared/seriesCardinality.ts'
import type { SqlDialect } from '@shared/types.ts'

export { quotePostgresIdentifier as quoteIdentifier } from '@shared/seriesCardinality.ts'

export const TIME_BUCKETS = BUILDER_TIME_BUCKETS
export {
  BUILDER_AGGREGATIONS,
  isBuilderTemporalDataType,
  isBuilderTimeBucketSupported,
}

export interface BuilderSqlInput {
  dialect?: SqlDialect
  table: { schema: string; name: string }
  /** Canonical source column for X in the axis-first Builder. */
  xColumn?: string
  xColumnDataType?: string
  /** Independent temporal source used to constrain the Builder dataset. */
  timeColumn?: string | null
  timeBucket?: TimeBucket
  timeColumnDataType?: string
  valueColumn?: string | null
  aggregation?: Aggregation
  seriesColumns?: string[]
  timeRange?: BuilderTimeRange
  filters?: ResultFilter[]
}

export function buildBuilderPredicates(
  time: string,
  range: BuilderTimeRange,
  timeColumnDataType?: string,
  dialect: SqlDialect = 'postgres',
): { sql: string[]; parameters: unknown[] } {
  const validation = validateBuilderTimeRange(range)
  if (validation) throw new Error(validation)
  const sql: string[] = []
  const parameters: unknown[] = []
  const temporalType = timeColumnDataType?.toLowerCase()

  if (range.kind === 'rolling') {
    const interval =
      range.unit === 'hour' && range.amount === 24
        ? '1 day'
        : `${range.amount} ${range.amount === 1 ? range.unit : `${range.unit}s`}`
    if (dialect === 'google-sql') {
      const unit = range.unit.toUpperCase()
      const current =
        temporalType === 'date'
          ? 'CURRENT_DATE()'
          : temporalType === 'datetime'
            ? 'CURRENT_DATETIME()'
            : 'CURRENT_TIMESTAMP()'
      const expression =
        temporalType === 'date'
          ? range.unit === 'minute' || range.unit === 'hour'
            ? `DATE(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${range.amount} ${unit}))`
            : `DATE_SUB(${current}, INTERVAL ${range.amount} ${unit})`
          : temporalType === 'datetime'
            ? `DATETIME_SUB(${current}, INTERVAL ${range.amount} ${unit})`
            : range.unit === 'month'
              ? `TIMESTAMP(DATETIME_SUB(DATETIME(${current}), INTERVAL ${range.amount} MONTH))`
              : `TIMESTAMP_SUB(${current}, INTERVAL ${range.amount} ${unit})`
      sql.push(`${time} >= ${expression}`)
    } else {
      sql.push(`${time} >= CURRENT_TIMESTAMP - INTERVAL '${interval}'`)
    }
  } else if (range.kind === 'custom') {
    const bounds = customRangeToQueryBounds({
      startDate: range.startDate,
      startTime: range.startTime,
      endDate: range.endDate,
      endTime: range.endTime,
      recurringWindows: range.recurringWindows ?? [],
    })
    const googleParameterType =
      temporalType === 'date'
        ? 'DATE'
        : temporalType === 'datetime'
          ? 'DATETIME'
          : 'TIMESTAMP'
    const parameter = () =>
      dialect === 'google-sql'
        ? `CAST(? AS ${googleParameterType})`
        : `$${parameters.length}`
    const boundValue = (value: string) => {
      if (dialect !== 'google-sql') return value
      if (googleParameterType === 'DATE') return value.slice(0, 10)
      // Custom SQL ranges are UTC instants for TIMESTAMP, while DATETIME is a
      // timezone-free civil value. Normalize text without locale/Date parsing.
      if (
        googleParameterType === 'TIMESTAMP' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
      )
        return `${value}:00Z`
      return value
    }
    if (bounds.startInclusive) {
      parameters.push(boundValue(bounds.startInclusive))
      sql.push(`${time} >= ${parameter()}`)
    }
    if (bounds.endExclusive) {
      parameters.push(boundValue(bounds.endExclusive))
      sql.push(`${time} < ${parameter()}`)
    }
  }

  const windows = range.recurringWindows ?? []
  if (windows.length) {
    if (temporalType === 'date')
      throw new Error(
        'Recurring daily windows require a timestamp or datetime time column.',
      )
    const localTime =
      dialect === 'google-sql'
        ? `TIME(${time})`
        : temporalType === 'timestamptz' ||
            temporalType === 'timestamp with time zone'
          ? `(${time} AT TIME ZONE current_setting('TimeZone'))::time`
          : `${time}::time`
    const parts = windows.map((window) => {
      parameters.push(window.from)
      const from =
        dialect === 'google-sql'
          ? 'CAST(? AS TIME)'
          : `$${parameters.length}::time`
      parameters.push(window.to)
      const to =
        dialect === 'google-sql'
          ? 'CAST(? AS TIME)'
          : `$${parameters.length}::time`
      return window.to > window.from
        ? `(${localTime} >= ${from} AND ${localTime} < ${to})`
        : `(${localTime} >= ${from} OR ${localTime} < ${to})`
    })
    sql.push(`(${parts.join(' OR ')})`)
  }
  return { sql, parameters }
}

function quoteIdentifier(
  value: string,
  dialect: SqlDialect = 'postgres',
): string {
  return dialect === 'google-sql'
    ? quoteGoogleIdentifier(value)
    : quotePostgresIdentifier(value)
}

function aggregateExpression(
  aggregation: Aggregation,
  valueColumn: string | null | undefined,
  dialect: SqlDialect,
): { expression: string; alias: 'count' | 'value' } {
  if (aggregation === 'count') return { expression: 'COUNT(*)', alias: 'count' }
  if (!valueColumn)
    throw new Error(
      `${aggregation[0].toUpperCase() + aggregation.slice(1)} requires a numeric Y axis column.`,
    )
  const value = quoteIdentifier(valueColumn, dialect)
  if (aggregation === 'average')
    return { expression: `AVG(${value})`, alias: 'value' }
  if (aggregation === 'minimum')
    return { expression: `MIN(${value})`, alias: 'value' }
  if (aggregation === 'maximum')
    return { expression: `MAX(${value})`, alias: 'value' }
  return { expression: `SUM(${value})`, alias: 'value' }
}

export function generateBuilderQuery(input: BuilderSqlInput): {
  sql: string
  parameters: unknown[]
} {
  const xColumn = input.xColumn ?? input.timeColumn
  if (!xColumn)
    throw new Error('Choose an X axis before generating Builder SQL.')
  const legacyTemporalInput =
    input.xColumn === undefined && Boolean(input.timeColumn)
  const xColumnDataType =
    input.xColumnDataType ??
    (legacyTemporalInput ? input.timeColumnDataType : undefined)
  const temporalX =
    legacyTemporalInput || isBuilderTemporalDataType(xColumnDataType)
  const aggregation = input.aggregation ?? 'count'
  if (!BUILDER_AGGREGATIONS.includes(aggregation))
    throw new Error(`Unsupported aggregation: ${String(aggregation)}`)
  const dialect = input.dialect ?? 'postgres'
  const x = quoteIdentifier(xColumn, dialect)
  const bucket = input.timeBucket ?? 'day'
  const timeFilterColumn =
    input.xColumn === undefined ? input.timeColumn : input.timeColumn
  const effectiveRange = timeFilterColumn
    ? (input.timeRange ?? SEVEN_DAYS)
    : undefined
  const bucketSafetyRange = effectiveRange ?? ({ kind: 'all' } as const)
  if (temporalX && !(TIME_BUCKETS as readonly string[]).includes(bucket))
    throw new Error(`Unsupported time bucket: ${String(bucket)}`)
  if (
    temporalX &&
    !isBuilderTimeBucketSupported(xColumnDataType, bucket, dialect)
  )
    throw new Error(`BigQuery DATE columns do not support ${bucket} buckets.`)
  if (
    temporalX &&
    bucket === 'minute' &&
    !isMinuteBucketAvailable(bucketSafetyRange)
  )
    throw new Error(MINUTE_BUCKET_UNAVAILABLE_REASON)

  const xType = xColumnDataType?.toLowerCase()
  const googleType =
    xType === 'date' ? 'DATE' : xType === 'datetime' ? 'DATETIME' : 'TIMESTAMP'
  const xExpression =
    temporalX && dialect === 'google-sql'
      ? `${googleType}_TRUNC(${x}, ${bucket.toUpperCase()})`
      : temporalX
        ? xType === 'timestamptz' || xType === 'timestamp with time zone'
          ? input.dialect === 'duckdb'
            ? `date_trunc('${bucket}', ${x} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
            : `date_trunc('${bucket}', ${x}, 'UTC')`
          : xType
            ? `date_trunc('${bucket}', ${x}) AT TIME ZONE 'UTC'`
            : `date_trunc('${bucket}', ${x})`
        : x
  const xSelection = temporalX
    ? `${xExpression} AS ${quoteIdentifier('time_bucket', dialect)}`
    : xExpression
  const aggregate = aggregateExpression(aggregation, input.valueColumn, dialect)
  const table =
    dialect === 'google-sql'
      ? quoteGoogleIdentifier(`${input.table.schema}.${input.table.name}`)
      : `${quotePostgresIdentifier(input.table.schema)}.${quotePostgresIdentifier(input.table.name)}`
  const seriesColumns = (input.seriesColumns ?? []).filter(
    (column) => column !== xColumn && column !== input.valueColumn,
  )
  const quotedSeriesColumns = seriesColumns.map((column) =>
    quoteIdentifier(column, dialect),
  )
  const rangeSource = timeFilterColumn
    ? quoteIdentifier(timeFilterColumn, dialect)
    : null
  const rangePredicates =
    rangeSource && effectiveRange
      ? buildBuilderPredicates(
          rangeSource,
          effectiveRange,
          input.timeColumnDataType,
          dialect,
        )
      : { sql: [], parameters: [] }
  const filterPredicates = resolveBuilderPromotedFilters(input.filters ?? [], {
    dialect,
    parameterOffset: rangePredicates.parameters.length,
    table: input.table,
    xColumn,
    timeColumn: temporalX ? xColumn : null,
    timeColumnDataType: temporalX ? xColumnDataType : undefined,
    timeBucket: temporalX ? bucket : null,
    seriesColumns,
  })
  if (!filterPredicates)
    throw new Error(
      'A promoted filter no longer matches the Builder dimensions.',
    )
  const parameters = [...rangePredicates.parameters]
  const offsetSql = filterPredicates.sql
  parameters.push(...filterPredicates.parameters)
  const dimensionPositions = Array.from(
    { length: 1 + quotedSeriesColumns.length },
    (_, index) => index + 1,
  )
  const predicates = [
    ...(temporalX ? [`${x} IS NOT NULL`] : []),
    ...rangePredicates.sql,
    offsetSql,
  ].filter(Boolean)
  return {
    sql: [
      'SELECT',
      `  ${xSelection},`,
      ...quotedSeriesColumns.map((column) => `  ${column},`),
      `  ${aggregate.expression} AS ${quoteIdentifier(aggregate.alias, dialect)}`,
      `FROM ${table}`,
      ...(predicates.length ? [`WHERE ${predicates.join(' AND ')}`] : []),
      `GROUP BY ${dimensionPositions.join(', ')}`,
      `ORDER BY ${dimensionPositions.map((position) => (dialect === 'google-sql' ? `${position} ASC` : `${position} ASC NULLS LAST`)).join(', ')};`,
    ].join('\n'),
    parameters,
  }
}

export function isBuilderFilterPromotable(
  filter: ResultFilter,
  input: {
    table: BuilderSqlInput['table'] | null
    xColumn?: string | null
    timeColumn: string | null
    timeBucket: TimeBucket
    seriesColumns?: string[]
    timeRange?: BuilderTimeRange
  },
): boolean {
  if (!isPromotableFilter(filter) || !input.table) return false
  const xColumn = input.xColumn ?? input.timeColumn
  if (!xColumn) return false
  const temporalX = Boolean(
    input.xColumn ? input.xColumn === input.timeColumn : input.timeColumn,
  )
  if (filter.column === 'time_bucket') return temporalX
  if (filter.column === 'series') return Boolean(input.seriesColumns?.length)
  if (!temporalX && filter.column === xColumn) return true
  return Boolean(input.seriesColumns?.includes(filter.column))
}

export function generateBuilderSql(input: BuilderSqlInput): string {
  return generateBuilderQuery(input).sql
}

export function formatPostgresLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error(
        'Cannot materialize a non-finite numeric query parameter.',
      )
    return String(value)
  }
  if (typeof value === 'bigint') return String(value)
  const text = value instanceof Date ? value.toISOString() : String(value)
  return `'${text.replaceAll("'", "''")}'`
}

/** Lex only generated SQL's quoted regions/comments and parameter tokens. */
export function materializeSqlParameters(
  sql: string,
  parameters: unknown[],
  dialect?: SqlDialect,
): string {
  let output = ''
  let i = 0
  let positionalIndex = 0
  const literal = (value: unknown, google: boolean) => {
    if (!google || typeof value !== 'string')
      return formatPostgresLiteral(value)
    // GoogleSQL interprets backslash escapes, unlike standard PostgreSQL strings.
    return (
      "'" +
      value
        .replaceAll('\\', '\\\\')
        .replaceAll("'", "\\'")
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r')
        .replaceAll('\t', '\\t') +
      "'"
    )
  }
  while (i < sql.length) {
    const start = i
    const char = sql[i]
    if (sql.startsWith('--', i) || (dialect === 'google-sql' && char === '#')) {
      while (i < sql.length && sql[i] !== '\n') i++
    } else if (sql.startsWith('/*', i)) {
      i += 2
      let depth = 1
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) {
          depth++
          i += 2
        } else if (sql.startsWith('*/', i)) {
          depth--
          i += 2
        } else i++
      }
    } else if (char === '"' || char === "'" || char === '`') {
      const delimiter =
        char !== '`' &&
        dialect === 'google-sql' &&
        sql.startsWith(char.repeat(3), i)
          ? char.repeat(3)
          : char
      // E-strings in PG and all GoogleSQL strings/identifiers allow escapes.
      const escaped =
        dialect === 'google-sql' ||
        char === '`' ||
        (char === "'" && /(?:^|[^\w])e$/i.test(sql.slice(0, i)))
      i += delimiter.length
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') {
          i += 2
          continue
        }
        if (sql.startsWith(delimiter, i)) {
          i += delimiter.length
          if (delimiter.length === 1 && sql[i] === char) {
            i++
            continue
          }
          break
        }
        i++
      }
    } else {
      const dollarQuote = sql
        .slice(i)
        .match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0]
      if (dollarQuote) {
        const end = sql.indexOf(dollarQuote, i + dollarQuote.length)
        i = end < 0 ? sql.length : end + dollarQuote.length
      } else {
        const numbered = sql.slice(i).match(/^\$(\d+)\b/)
        const placeholder = char === '?' ? '?' : numbered?.[0]
        if (placeholder) {
          const index =
            char === '?' ? positionalIndex++ : Number(numbered![1]) - 1
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= parameters.length
          )
            throw new Error(`Missing value for query parameter ${placeholder}.`)
          output += literal(
            parameters[index],
            dialect === 'google-sql' || (!dialect && char === '?'),
          )
          i += placeholder.length
          continue
        }
        i++
      }
    }
    output += sql.slice(start, i)
  }
  if (positionalIndex > 0 && positionalIndex !== parameters.length)
    throw new Error('Too many query parameters were supplied.')
  return output
}
