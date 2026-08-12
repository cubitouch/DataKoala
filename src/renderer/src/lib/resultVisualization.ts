import { isNumericType, isTimeType, type QueryResult } from '../../../shared/types.ts'
import { orderChartSeries } from './chartSeries.ts'
import { CHART_POINTS_HARD_LIMIT, CHART_POINTS_SOFT_LIMIT, CHART_SERIES_HARD_LIMIT, CHART_SERIES_SOFT_LIMIT } from '../../../shared/chartLimits.ts'

export type ResultView = 'table' | 'bar' | 'line' | 'area' | 'scatter' | 'treemap' | 'sunburst'
export type Aggregation = 'sum' | 'average' | 'minimum' | 'maximum' | 'count'
export type ValueAxisScale = 'linear' | 'log'
export interface VisualizationConfiguration {
  view: ResultView
  xColumn: string | null
  valueColumn: string | null
  aggregation: Aggregation
  seriesColumn: string | null
  /** Multiple result columns combined into a visual tuple without changing the SQL result shape. */
  seriesColumns?: string[]
  valueAxisScale?: ValueAxisScale
  anomalyDetectionEnabled?: boolean
}
export interface ChartSeries {
  name: string
  data: (number | null)[]
  /** True where a zero is a synthetic placeholder for a missing series/bucket combination. */
  missing?: boolean[]
}
export type PivotRejectionReason = 'too-many-series' | 'too-many-points'
export interface PivotedResult {
  renderable: boolean
  rejectionReason?: PivotRejectionReason
  warning?: string
  labels: string[]
  xValues: unknown[]
  /** A multi-column tuple is encoded as JSON for the virtual `series` filter boundary. */
  seriesValues: unknown[]
  series: ChartSeries[]
}

export const NULL_SERIES_LABEL = 'NULL'
const X_NAMES = ['time_bucket', 'date', 'datetime', 'timestamp', 'created_at', 'month', 'year']
const VALUE_NAMES = ['count', 'value', 'total', 'sum', 'amount']
const SERIES_NAMES = ['series', 'category', 'group', 'type', 'status']
const sameStrings = (left: readonly string[] = [], right: readonly string[] = []) => left.length === right.length && left.every((value, index) => value === right[index])

export function visualizationConfigurationsEqual(a: VisualizationConfiguration, b: VisualizationConfiguration): boolean {
  return a.view === b.view && a.xColumn === b.xColumn && a.valueColumn === b.valueColumn &&
    a.aggregation === b.aggregation && a.seriesColumn === b.seriesColumn &&
    sameStrings(a.seriesColumns, b.seriesColumns) &&
    (a.valueAxisScale ?? 'linear') === (b.valueAxisScale ?? 'linear') &&
    Boolean(a.anomalyDetectionEnabled) === Boolean(b.anomalyDetectionEnabled)
}

export function deriveEffectiveVisualization(result: QueryResult, persisted: VisualizationConfiguration, mode: 'sql' | 'builder', builderSeries: readonly unknown[] = []): VisualizationConfiguration {
  const effective = inferVisualizationConfiguration(result, persisted)
  if (mode === 'builder') {
    const seriesColumns = builderSeries.filter((value): value is string => typeof value === 'string' && result.columns.some((column) => column.name === value))
    const xColumn = result.columns[0]?.name ?? null
    const valueColumn = result.columns.find((column, index) => index > 0 && !seriesColumns.includes(column.name) && (column.name === 'count' || column.name === 'value'))?.name
      ?? numericColumns(result).find((column) => column !== xColumn && !seriesColumns.includes(column))
      ?? null
    // Builder SQL has already performed the chosen aggregation. The chart only folds
    // duplicate result rows defensively; Sum is therefore the stable presentation aggregation.
    return { ...effective, xColumn, valueColumn, aggregation: 'sum', seriesColumn: seriesColumns.length ? 'series' : null, seriesColumns }
  }

  const names = new Set(result.columns.map((column) => column.name))
  const selectedMultiple = (persisted.seriesColumns ?? []).filter((name) => names.has(name) && name !== effective.xColumn && name !== effective.valueColumn)
  const single = selectedMultiple[0] ?? (effective.seriesColumn && effective.seriesColumn !== effective.xColumn && effective.seriesColumn !== effective.valueColumn ? effective.seriesColumn : null)
  // SQL mode charts describe already-returned columns. There is deliberately no
  // Aggregation control: Sum is a fixed presentation fold only when duplicate
  // X/Series rows exist, so stale persisted Average/Min/Max choices cannot act invisibly.
  if (selectedMultiple.length > 1) return { ...effective, aggregation: 'sum', seriesColumn: null, seriesColumns: selectedMultiple }
  return { ...effective, aggregation: 'sum', seriesColumn: single, seriesColumns: [] }
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function numericColumns(result: QueryResult): string[] {
  return result.columns.filter((column) => isNumericType(column.dataTypeName) || result.rows.some((row) => toFiniteNumber(row[column.name]) !== null)).map((column) => column.name)
}

export function inferVisualizationConfiguration(result: QueryResult, previous?: VisualizationConfiguration): VisualizationConfiguration {
  const names = result.columns.map((column) => column.name)
  const numbers = numericColumns(result)
  const valid = (name: string | null, choices = names) => name != null && choices.includes(name) ? name : null
  const xColumn = valid(previous?.xColumn ?? null) ?? result.columns.find((column) => isTimeType(column.dataTypeName))?.name ?? X_NAMES.find((name) => names.includes(name)) ?? names[0] ?? null
  const valueColumn = valid(previous?.valueColumn ?? null, numbers) ?? VALUE_NAMES.find((name) => numbers.includes(name) && name !== xColumn) ?? numbers.find((name) => name !== xColumn) ?? null
  const inferredSeries = SERIES_NAMES.find((name) => names.includes(name) && name !== xColumn && name !== valueColumn) ?? null
  const hasPreviousSelections = Boolean(previous?.xColumn || previous?.valueColumn)
  const previousSeries = previous?.seriesColumn === null && hasPreviousSelections ? null : valid(previous?.seriesColumn ?? null)
  return {
    view: previous?.view ?? 'table', xColumn, valueColumn,
    aggregation: previous?.aggregation ?? 'sum',
    seriesColumn: previousSeries ?? (!hasPreviousSelections ? inferredSeries : null),
    seriesColumns: previous?.seriesColumns?.filter((name) => names.includes(name)),
    valueAxisScale: previous?.valueAxisScale ?? 'linear',
    anomalyDetectionEnabled: previous?.anomalyDetectionEnabled ?? false
  }
}

function xKey(value: unknown): string { return value instanceof Date ? value.toISOString() : `${typeof value}:${String(value)}` }

export type SerializableBuilderSeriesValue = string | number | boolean | null | { type: 'date'; value: string }
export interface BuilderSeriesTupleEntry { column: string; value: SerializableBuilderSeriesValue }

function serializeBuilderSeriesValue(value: unknown): SerializableBuilderSeriesValue {
  if (value instanceof Date) return { type: 'date', value: value.toISOString() }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return String(value)
}

function isBuilderSeriesTupleEntry(value: unknown): value is BuilderSeriesTupleEntry {
  if (typeof value !== 'object' || value === null || !('column' in value) || !('value' in value) || typeof value.column !== 'string') return false
  const entryValue = value.value
  return typeof entryValue === 'string' || typeof entryValue === 'number' || typeof entryValue === 'boolean' || entryValue === null ||
    (typeof entryValue === 'object' && entryValue !== null && 'type' in entryValue && entryValue.type === 'date' && 'value' in entryValue && typeof entryValue.value === 'string')
}

export function encodeBuilderSeriesTuple(row: Record<string, unknown>, columns: readonly string[]): string {
  return JSON.stringify(columns.map((column) => ({ column, value: serializeBuilderSeriesValue(row[column]) })))
}

export function decodeBuilderSeriesTuple(value: unknown): BuilderSeriesTupleEntry[] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every(isBuilderSeriesTupleEntry) ? parsed : null
  } catch { return null }
}

function formatBuilderSeriesValue(value: SerializableBuilderSeriesValue): string {
  if (value === null) return NULL_SERIES_LABEL
  if (typeof value === 'object') return JSON.stringify(value.value)
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

export function builderSeriesTupleLabel(value: unknown): string {
  const tuple = decodeBuilderSeriesTuple(value)
  return tuple ? tuple.map(({ column, value: item }) => `${column}=${formatBuilderSeriesValue(item)}`).join(' · ') : String(value)
}

export function pivotRowsForChart(result: QueryResult, config: VisualizationConfiguration): PivotedResult {
  const empty = { renderable: true, labels: [], xValues: [], seriesValues: [], series: [] }
  if (!config.xColumn || (config.aggregation !== 'count' && !config.valueColumn)) return empty
  const tupleColumns = config.seriesColumns?.filter((column) => result.columns.some((candidate) => candidate.name === column)) ?? []
  const usesSeriesTuple = tupleColumns.length > 1 || (config.seriesColumn === 'series' && tupleColumns.length > 0 && !result.columns.some((column) => column.name === 'series'))
  const xMeta = result.columns.find((column) => column.name === config.xColumn)
  const temporal = Boolean(xMeta && isTimeType(xMeta.dataTypeName))
  const numericX = Boolean(xMeta && isNumericType(xMeta.dataTypeName))
  const xValues = new Map<string, unknown>()
  const seriesNames: string[] = []
  const seriesValues = new Map<string, unknown>()
  const resolveSeries = (row: Record<string, unknown>) => {
    if (usesSeriesTuple) {
      const encoded = encodeBuilderSeriesTuple(row, tupleColumns)
      return { name: builderSeriesTupleLabel(encoded), value: encoded }
    }
    const raw = config.seriesColumn ? row[config.seriesColumn] : null
    return { name: config.seriesColumn ? (raw == null ? NULL_SERIES_LABEL : String(raw)) : (config.valueColumn ?? 'Count'), value: raw }
  }
  for (const row of result.rows) {
    const rawX = row[config.xColumn]
    xValues.set(xKey(rawX), rawX)
    const resolved = resolveSeries(row)
    if (!seriesValues.has(resolved.name)) {
      seriesNames.push(resolved.name)
      seriesValues.set(resolved.name, resolved.value)
      if (seriesNames.length > CHART_SERIES_HARD_LIMIT) return { ...empty, renderable: false, rejectionReason: 'too-many-series' as const }
    }
  }
  const potentialPoints = seriesNames.length * xValues.size
  if (potentialPoints > CHART_POINTS_HARD_LIMIT) return { ...empty, renderable: false, rejectionReason: 'too-many-points' as const }
  const warning = seriesNames.length > CHART_SERIES_SOFT_LIMIT ? `This chart contains ${seriesNames.length} series.` : potentialPoints > CHART_POINTS_SOFT_LIMIT ? `This chart contains ${potentialPoints.toLocaleString()} potential points.` : undefined
  const groups = new Map<string, { values: number[]; rows: number }>()
  for (const row of result.rows) {
    const key = xKey(row[config.xColumn])
    const resolved = resolveSeries(row)
    const groupKey = `${key}\0${resolved.name}`
    const group = groups.get(groupKey) ?? { values: [], rows: 0 }
    group.rows++
    const numeric = config.valueColumn ? toFiniteNumber(row[config.valueColumn]) : null
    if (numeric !== null) group.values.push(numeric)
    groups.set(groupKey, group)
  }
  const entries = [...xValues.entries()]
  if (temporal) entries.sort((a, b) => new Date(String(a[1])).getTime() - new Date(String(b[1])).getTime())
  else if (numericX) entries.sort((a, b) => Number(a[1]) - Number(b[1]))
  const aggregate = (group?: { values: number[]; rows: number }): number | null => {
    if (!group) return 0
    if (config.aggregation === 'count') return group.rows
    if (!group.values.length) return null
    if (config.aggregation === 'average') return group.values.reduce((a, b) => a + b, 0) / group.values.length
    if (config.aggregation === 'minimum') return Math.min(...group.values)
    if (config.aggregation === 'maximum') return Math.max(...group.values)
    return group.values.reduce((a, b) => a + b, 0)
  }
  const orderedSeries = orderChartSeries(seriesNames.map((name) => ({
    name,
    data: entries.map(([key]) => aggregate(groups.get(`${key}\0${name}`))),
    missing: entries.map(([key]) => !groups.has(`${key}\0${name}`))
  })))
  return {
    renderable: true,
    warning,
    labels: entries.map(([, value]) => formatXAxisValue(value, temporal)),
    xValues: entries.map(([, value]) => value),
    seriesValues: orderedSeries.map((series) => seriesValues.get(series.name)),
    series: orderedSeries
  }
}

export function formatXAxisValue(value: unknown, temporal = false): string {
  if (value === null || value === undefined) return NULL_SERIES_LABEL
  if (!temporal) return String(value)
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace(/\.000Z$/, 'Z') : String(value)
}
