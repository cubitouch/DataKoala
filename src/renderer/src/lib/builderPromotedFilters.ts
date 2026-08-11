import type { TimeBucket } from '../store/useStore'
import { timeBucketRange } from './chartPointFilters.ts'
import { decodeBuilderSeriesTuple, type SerializableBuilderSeriesValue } from './resultVisualization.ts'
import { queryResultFilters, type ResultFilter, type SerializableFilterValue } from './resultFilters.ts'
import { quotePostgresIdentifier } from '../../../shared/seriesCardinality.ts'

export interface BuilderFilterContext {
  table: { schema: string; name: string }
  /** Real source column selected for the Builder X axis. */
  xColumn: string
  /** Set only when X is temporal and rendered through the time_bucket result alias. */
  timeColumn: string | null
  timeBucket: TimeBucket | null
  timeColumnDataType?: string
  seriesColumns: string[]
}

const scalar = (value: SerializableFilterValue | SerializableBuilderSeriesValue | undefined): unknown => typeof value === 'object' && value !== null ? value.value : value
const scalarFilterValue = (filter: ResultFilter): SerializableFilterValue | undefined => 'value' in filter ? filter.value : undefined
const sameTable = (filter: ResultFilter, context: BuilderFilterContext) => !filter.provenance || (filter.provenance.table.schema === context.table.schema && filter.provenance.table.name === context.table.name)
const sameOrderedColumns = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((column, index) => column === right[index])

function scalarPredicate(expression: string, filter: ResultFilter, parameters: unknown[]): string | null {
  if (filter.operator === 'isNull') return `${expression} IS NULL`
  if (filter.operator === 'isNotNull') return `${expression} IS NOT NULL`
  if (filter.operator === 'range' || filter.operator === 'notRange') return null
  parameters.push(scalar(scalarFilterValue(filter)))
  return `${expression} ${filter.operator === 'equals' ? '=' : 'IS DISTINCT FROM'} $${parameters.length}`
}

function tuplePredicate(filter: ResultFilter, expectedColumns: readonly string[], parameters: unknown[]): string | null {
  if (filter.operator !== 'equals' && filter.operator !== 'notEquals') return null
  const rawValue = scalarFilterValue(filter)
  const tuple = decodeBuilderSeriesTuple(rawValue)
  if (!tuple) {
    if (expectedColumns.length !== 1) return null
    parameters.push(scalar(rawValue))
    const comparison = `${quotePostgresIdentifier(expectedColumns[0])} IS NOT DISTINCT FROM $${parameters.length}`
    return filter.operator === 'equals' ? `(${comparison})` : `NOT (${comparison})`
  }
  if (!sameOrderedColumns(tuple.map((entry) => entry.column), expectedColumns)) return null
  const comparisons = tuple.map(({ column, value }) => {
    parameters.push(scalar(value))
    return `${quotePostgresIdentifier(column)} IS NOT DISTINCT FROM $${parameters.length}`
  })
  const equality = `(${comparisons.join(' AND ')})`
  return filter.operator === 'equals' ? equality : `NOT ${equality}`
}

export function resolveBuilderPromotedFilters(filters: ResultFilter[], context: BuilderFilterContext): { sql: string; parameters: unknown[] } | null {
  const parameters: unknown[] = []; const predicates: string[] = []
  for (const filter of queryResultFilters(filters)) {
    const provenance = filter.provenance
    if (!sameTable(filter, context)) return null
    if (filter.column === 'series') {
      if (provenance?.targetKind === 'source-column') {
        const sourceColumn = provenance.sourceColumn
        if (!sourceColumn || !context.seriesColumns.includes(sourceColumn)) return null
        const predicate = tuplePredicate(filter, [sourceColumn], parameters)
        if (!predicate) return null
        predicates.push(predicate)
        continue
      }
      if (provenance?.targetKind !== 'series-tuple' || !sameOrderedColumns(provenance.sourceColumns, context.seriesColumns)) return null
      const predicate = tuplePredicate(filter, context.seriesColumns, parameters)
      if (!predicate) return null
      predicates.push(predicate)
      continue
    }
    if (filter.column === 'time_bucket') {
      if (!context.timeColumn || !context.timeBucket) return null
      if (provenance && (provenance.targetKind !== 'time-bucket' || provenance.timeColumn !== context.timeColumn || provenance.timeBucket !== context.timeBucket)) return null
      const source = quotePostgresIdentifier(context.timeColumn)
      if (filter.operator === 'range' || filter.operator === 'notRange') {
        if (provenance && provenance.rangeKind !== 'bucket-boundaries') return null
        const bound = (value: string) => context.timeColumnDataType?.toLowerCase() === 'date' ? value.slice(0, 10) : value
        parameters.push(bound(filter.startInclusive), bound(filter.endExclusive))
        const inside = `${source} >= $${parameters.length - 1} AND ${source} < $${parameters.length}`
        predicates.push(filter.operator === 'range' ? `(${inside})` : `(${source} IS NULL OR ${source} < $${parameters.length - 1} OR ${source} >= $${parameters.length})`)
        continue
      }
      if (filter.operator === 'isNull' || filter.operator === 'isNotNull') { predicates.push(`${source} IS ${filter.operator === 'isNull' ? '' : 'NOT '}NULL`); continue }
      const boundaries = timeBucketRange(scalar(scalarFilterValue(filter)), context.timeBucket)
      if (!boundaries) return null
      const bound = (value: string) => context.timeColumnDataType?.toLowerCase() === 'date' ? value.slice(0, 10) : value
      parameters.push(bound(boundaries.startInclusive), bound(boundaries.endExclusive))
      const inside = `${source} >= $${parameters.length - 1} AND ${source} < $${parameters.length}`
      predicates.push(filter.operator === 'equals' ? `(${inside})` : `(${source} IS NULL OR ${source} < $${parameters.length - 1} OR ${source} >= $${parameters.length})`)
      continue
    }

    const sourceColumn = provenance?.targetKind === 'source-column' ? provenance.sourceColumn : filter.column
    const isXAxis = sourceColumn === context.xColumn && context.timeColumn === null
    const isSeries = Boolean(sourceColumn && context.seriesColumns.includes(sourceColumn))
    if (!sourceColumn || (!isXAxis && !isSeries)) return null
    const predicate = scalarPredicate(quotePostgresIdentifier(sourceColumn), filter, parameters)
    if (!predicate) return null
    predicates.push(predicate)
  }
  return { sql: predicates.join(' AND '), parameters }
}
