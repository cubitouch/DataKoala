import type { QueryResult, SqlDialect } from '@shared/types'
import { builderSeriesTupleLabel, decodeBuilderSeriesTuple } from './resultVisualization.ts'

export type ScalarResultFilterOperator = 'equals' | 'notEquals' | 'isNull' | 'isNotNull'
export type RangeResultFilterOperator = 'range' | 'notRange'
export type ResultFilterOperator = ScalarResultFilterOperator | RangeResultFilterOperator
export type SerializableFilterValue = string | number | boolean | null | { type: 'date'; value: string }

export interface BuilderFilterProvenance {
  mode: 'builder'
  resultAlias: 'series' | 'time_bucket'
  table: { schema: string; name: string }
  sourceColumns: string[]
  timeColumn: string | null
  timeBucket: string
  sourceKind: 'single-column' | 'series-tuple' | 'time-bucket'
  targetKind: 'result-alias' | 'source-column' | 'series-tuple' | 'time-bucket'
  sourceColumn?: string
  displayLabel: string
  clientResultColumn?: string
  rangeKind?: 'bucket-boundaries'
}

interface ResultFilterMetadata { execution?: 'client' | 'query'; provenance?: BuilderFilterProvenance; nativeType?: string }
export type ResultFilter = ResultFilterMetadata & ({ id: string; column: string; operator: ScalarResultFilterOperator; value?: SerializableFilterValue } | { id: string; column: string; operator: RangeResultFilterOperator; startInclusive: string; endExclusive: string })
export interface FilteredQueryResult extends QueryResult { originalRowCount: number; filteredRowCount: number }

function serializedValue(value: unknown): SerializableFilterValue {
  if (value instanceof Date) return { type: 'date', value: value.toISOString() }
  if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value && value.type === 'date' && typeof value.value === 'string') return { type: 'date', value: value.value }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return String(value)
}
function comparableValue(value: unknown): string {
  const normalized = serializedValue(value)
  if (normalized === null) return 'null'
  if (typeof normalized === 'object') return `date:${normalized.value}`
  return `${typeof normalized}:${String(normalized)}`
}
const scalarFilterValue = (filter: ResultFilter): SerializableFilterValue | undefined => 'value' in filter ? filter.value : undefined
export function resultValuesEqual(left: unknown, right: unknown): boolean { return comparableValue(left) === comparableValue(right) }

export function resultFilterKey(filter: Omit<ResultFilter, 'id'> | ResultFilter): string {
  const provenance = filter.provenance
  const target = provenance ? JSON.stringify({ mode: provenance.mode, targetKind: provenance.targetKind, table: provenance.table, resultAlias: provenance.resultAlias, sourceColumn: provenance.sourceColumn, sourceColumns: provenance.sourceColumns, timeColumn: provenance.timeColumn, timeBucket: provenance.timeBucket, nativeType: filter.nativeType }) : JSON.stringify({ targetKind: 'result-alias', resultAlias: filter.column, nativeType: filter.nativeType })
  if ('startInclusive' in filter) return `${target}\u0000${filter.operator}\u0000${filter.startInclusive}\u0000${filter.endExclusive}`
  const value = filter.operator === 'isNull' || filter.operator === 'isNotNull' ? '' : comparableValue('value' in filter ? filter.value : undefined)
  return `${target}\u0000${filter.operator}\u0000${value}`
}
export function stableResultFilterId(filter: Omit<ResultFilter, 'id'>): string { return `result-filter:${encodeURIComponent(resultFilterKey(filter))}` }
export function createResultFilter(column: string, operator: ScalarResultFilterOperator, value?: unknown, nativeType?: string): ResultFilter {
  const metadata = nativeType ? { nativeType } : {}
  const filter: Omit<Extract<ResultFilter, { operator: ScalarResultFilterOperator }>, 'id'> = operator === 'isNull' || operator === 'isNotNull' ? { column, operator, ...metadata } : { column, operator, value: serializedValue(value), ...metadata }
  return { ...filter, id: stableResultFilterId(filter) }
}
export function createResultRangeFilter(column: string, startInclusive: string, endExclusive: string, exclude = false, nativeType?: string): Extract<ResultFilter, { operator: RangeResultFilterOperator }> {
  const filter: Omit<Extract<ResultFilter, { operator: RangeResultFilterOperator }>, 'id'> = { column, operator: exclude ? 'notRange' : 'range', startInclusive, endExclusive, ...(nativeType ? { nativeType } : {}) }
  return { ...filter, id: stableResultFilterId(filter) }
}
export function deduplicateResultFilters(filters: ResultFilter[]): ResultFilter[] {
  const seen = new Set<string>()
  return filters.filter((filter) => { const key = resultFilterKey(filter); if (seen.has(key)) return false; seen.add(key); return true })
}
export function serializeResultFilters(filters: ResultFilter[]): string { return JSON.stringify(deduplicateResultFilters(filters)) }
export function deserializeResultFilters(serialized: string): ResultFilter[] {
  const parsed: unknown = JSON.parse(serialized)
  if (!Array.isArray(parsed)) return []
  const valid = parsed.filter((value): value is ResultFilter => {
    if (typeof value !== 'object' || value === null || !('id' in value) || !('column' in value) || !('operator' in value)) return false
    if (typeof value.id !== 'string' || typeof value.column !== 'string') return false
    if (value.operator === 'range' || value.operator === 'notRange') return 'startInclusive' in value && 'endExclusive' in value && typeof value.startInclusive === 'string' && typeof value.endExclusive === 'string'
    return value.operator === 'equals' || value.operator === 'notEquals' || value.operator === 'isNull' || value.operator === 'isNotNull'
  })
  return deduplicateResultFilters(valid.map((filter) => {
    const old = filter.provenance
    const provenance = old ? { ...old, targetKind: old.targetKind ?? (old.sourceKind === 'single-column' ? 'source-column' : old.sourceKind), sourceColumn: old.sourceColumn ?? (old.sourceKind === 'single-column' ? old.sourceColumns[0] : undefined), displayLabel: old.displayLabel ?? (old.sourceKind === 'single-column' ? old.sourceColumns[0] : old.sourceKind === 'series-tuple' ? old.sourceColumns.join(' + ') : `${old.timeBucket} ${old.timeColumn ?? 'time'}`) } as BuilderFilterProvenance : undefined
    const normalized: ResultFilter = { ...filter, provenance }
    return { ...normalized, id: stableResultFilterId(normalized) }
  }))
}
export function normalizeLegacyResultFilters(value: unknown): ResultFilter[] { return Array.isArray(value) ? deserializeResultFilters(JSON.stringify(value)) : [] }

function dateInRange(value: unknown, startInclusive: string, endExclusive: string): boolean {
  const candidate = value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
  const start = new Date(startInclusive).getTime(); const end = new Date(endExclusive).getTime()
  return Number.isFinite(candidate) && Number.isFinite(start) && Number.isFinite(end) && candidate >= start && candidate < end
}
function builderTupleMatches(row: Record<string, unknown>, encoded: unknown): boolean | null {
  const tuple = decodeBuilderSeriesTuple(encoded)
  return tuple ? tuple.every(({ column, value }) => resultValuesEqual(row[column], value)) : null
}
export function applyResultFilters(rows: Record<string, unknown>[], filters: ResultFilter[]): Record<string, unknown>[] {
  const clientFilters = filters.filter((filter) => filter.execution !== 'query')
  if (!clientFilters.length) return rows
  return rows.filter((row) => clientFilters.every((filter) => {
    if (filter.column === 'series' && (filter.operator === 'equals' || filter.operator === 'notEquals')) {
      const matches = builderTupleMatches(row, scalarFilterValue(filter))
      if (matches !== null) return filter.operator === 'equals' ? matches : !matches
    }
    const value = row[filter.provenance?.clientResultColumn ?? filter.column]
    if (filter.operator === 'range' || filter.operator === 'notRange') { const inRange = dateInRange(value, filter.startInclusive, filter.endExclusive); return filter.operator === 'range' ? inRange : !inRange }
    if (filter.operator === 'isNull') return value === null || value === undefined
    if (filter.operator === 'isNotNull') return value !== null && value !== undefined
    const equals = resultValuesEqual(value, scalarFilterValue(filter))
    return filter.operator === 'equals' ? equals : !equals
  }))
}
export function filterQueryResult(result: QueryResult, filters: ResultFilter[]): FilteredQueryResult {
  const rows = applyResultFilters(result.rows, filters)
  return { ...result, rows, rowCount: rows.length, originalRowCount: result.rowCount, filteredRowCount: rows.length }
}
export function formatResultFilterValue(value: SerializableFilterValue | undefined): string {
  if (typeof value === 'object' && value !== null) return value.value
  if (typeof value === 'string') return `“${value}”`
  return String(value)
}
export function resultFilterLabel(filter: ResultFilter): string {
  const label = filter.provenance?.displayLabel ?? (filter.column === 'series' ? 'Series' : filter.column)
  if (filter.operator === 'range' || filter.operator === 'notRange') return `${label} ${filter.operator === 'range' ? 'in' : 'outside'} [${filter.startInclusive}, ${filter.endExclusive})`
  const operators: Record<ScalarResultFilterOperator, string> = { equals: '=', notEquals: '≠', isNull: 'is NULL', isNotNull: 'is not NULL' }
  const rawValue = scalarFilterValue(filter)
  const displayValue = filter.column === 'series' && decodeBuilderSeriesTuple(rawValue) ? `“${builderSeriesTupleLabel(rawValue)}”` : formatResultFilterValue(rawValue)
  const suffix = filter.operator === 'equals' || filter.operator === 'notEquals' ? ` ${displayValue}` : ''
  return `${label} ${operators[filter.operator]}${suffix}`
}
export function resultFilterDemotion(filter: ResultFilter, resultColumns: readonly string[]): { allowed: boolean; column?: string; reason?: string } {
  if (filter.execution !== 'query') return { allowed: true }
  const tuple = filter.column === 'series' && (filter.operator === 'equals' || filter.operator === 'notEquals') ? decodeBuilderSeriesTuple(scalarFilterValue(filter)) : null
  if (tuple && tuple.every(({ column }) => resultColumns.includes(column))) return { allowed: true, column: 'series' }
  const provenance = filter.provenance
  if (!provenance || provenance.targetKind === 'result-alias' || provenance.targetKind === 'series-tuple' || provenance.targetKind === 'time-bucket') return resultColumns.includes(filter.column) ? { allowed: true, column: filter.column } : { allowed: false, reason: `Cannot move to client because the result no longer contains ${filter.column}.` }
  const source = provenance.sourceColumn
  return source && resultColumns.includes(source) ? { allowed: true, column: source } : { allowed: false, reason: `Cannot move to client because the result does not contain source column ${source ?? provenance.displayLabel}.` }
}

export const queryResultFilters = (filters: ResultFilter[]) => filters.filter((filter) => filter.execution === 'query')
export const clientResultFilters = (filters: ResultFilter[]) => filters.filter((filter) => filter.execution !== 'query')
export const isPromotableFilter = (filter: ResultFilter) => filter.operator !== 'notRange'
function parameterValue(value: SerializableFilterValue | undefined): unknown { return typeof value === 'object' && value !== null ? value.value : value }
function googleSqlParameterType(nativeType: string | undefined): string | null {
  const type = nativeType?.trim().toUpperCase().replace(/\s*\(.*/, '')
  const aliases: Record<string, string> = { INTEGER: 'INT64', FLOAT: 'FLOAT64', BOOLEAN: 'BOOL', DECIMAL: 'NUMERIC', BIGDECIMAL: 'BIGNUMERIC' }
  const canonical = type ? (aliases[type] ?? type) : ''
  return ['INT64', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'BOOL', 'STRING', 'BYTES', 'GEOGRAPHY', 'JSON'].includes(canonical) ? canonical : null
}
export function resultFilterPredicates(filters: ResultFilter[], resolveColumn: (filter: ResultFilter) => string | null, dialect: SqlDialect = 'postgres'): { sql: string; parameters: unknown[] } | null {
  const predicates: string[] = []; const parameters: unknown[] = []
  const parameter = () => dialect === 'google-sql' ? '?' : `$${parameters.length}`
  for (const filter of filters) {
    if (!isPromotableFilter(filter)) return null
    const tuple = filter.column === 'series' && (filter.operator === 'equals' || filter.operator === 'notEquals') ? decodeBuilderSeriesTuple(scalarFilterValue(filter)) : null
    if (tuple) {
      const comparisons: string[] = []
      for (const entry of tuple) {
        const component = { ...filter, column: entry.column } as ResultFilter
        const column = resolveColumn(component)
        if (!column) return null
        parameters.push(parameterValue(entry.value))
        comparisons.push(`${column} IS NOT DISTINCT FROM ${parameter()}`)
      }
      const equality = `(${comparisons.join(' AND ')})`
      predicates.push(filter.operator === 'equals' ? equality : `NOT ${equality}`)
      continue
    }
    const column = resolveColumn(filter); if (!column) return null
    if (filter.operator === 'isNull') predicates.push(`${column} IS NULL`)
    else if (filter.operator === 'isNotNull') predicates.push(`${column} IS NOT NULL`)
    else if (filter.operator === 'range') {
      const type = googleSqlParameterType(filter.nativeType) ?? 'TIMESTAMP'
      const value = (bound: string) => type === 'DATE' ? bound.slice(0, 10) : bound
      parameters.push(value(filter.startInclusive)); const start = dialect === 'google-sql' ? `CAST(? AS ${type})` : parameter()
      parameters.push(value(filter.endExclusive)); const end = dialect === 'google-sql' ? `CAST(? AS ${type})` : parameter()
      const comparable = column
      predicates.push(`${comparable} >= ${start} AND ${comparable} < ${end}`)
    } else {
      const raw = scalarFilterValue(filter); parameters.push(parameterValue(raw))
      const inferredDate = typeof raw === 'object' && raw !== null && raw.type === 'date'
      const type = googleSqlParameterType(filter.nativeType) ?? (inferredDate ? 'TIMESTAMP' : null)
      const comparable = column
      const placeholder = dialect === 'google-sql' && type ? `CAST(? AS ${type})` : parameter()
      predicates.push(`${comparable} ${filter.operator === 'equals' ? '=' : 'IS DISTINCT FROM'} ${placeholder}`)
    }
  }
  return { sql: predicates.join(' AND '), parameters }
}
export function wrapSqlWithResultFilters(userSql: string, filters: ResultFilter[], dialect: SqlDialect = 'postgres'): { sql: string; parameters: unknown[] } | null {
  const trimmed = userSql.trim(); const body = trimmed.endsWith(';') ? trimmed.slice(0, -1).trimEnd() : trimmed
  if (!/^select\b/i.test(body) || body.includes(';')) return null
  const quote = (value: string) => dialect === 'google-sql' ? `\`${value.replaceAll('`', '``')}\`` : `"${value.replaceAll('"', '""')}"`
  const built = resultFilterPredicates(filters, (filter) => `${quote('_datakoala_source')}.${quote(filter.column)}`, dialect)
  if (!built?.sql) return null
  return { sql: `SELECT *\nFROM (\n${body}\n) AS ${quote('_datakoala_source')}\nWHERE ${built.sql}`, parameters: built.parameters }
}
