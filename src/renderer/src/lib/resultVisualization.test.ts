import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '@shared/types'
import { builderSeriesTupleLabel, decodeBuilderSeriesTuple, deriveEffectiveVisualization, inferVisualizationConfiguration, pivotRowsForChart, toFiniteNumber, type VisualizationConfiguration } from './resultVisualization.ts'

const result = (columns: [string, string][], rows: Record<string, unknown>[]): QueryResult => ({ columns: columns.map(([name, dataTypeName]) => ({ name, dataTypeName, dataTypeID: 0 })), rows, rowCount: rows.length, durationMs: 1 })
const config = (patch: Partial<VisualizationConfiguration> = {}): VisualizationConfiguration => ({ view: 'line', xColumn: 'x', valueColumn: 'value', aggregation: 'sum', seriesColumn: 'series', valueAxisScale: 'linear', ...patch })

test('infers conventional SQL result columns including numeric PostgreSQL strings', () => {
  const inferred = inferVisualizationConfiguration(result([['time_bucket', 'timestamptz'], ['series', 'text'], ['count', 'int8']], [{ time_bucket: '2026-01-01', series: 'FR', count: '12' }]))
  assert.deepEqual({ x: inferred.xColumn, value: inferred.valueColumn, series: inferred.seriesColumn }, { x: 'time_bucket', value: 'count', series: 'series' })
})
test('prefers timestamp X and count value', () => {
  const inferred = inferVisualizationConfiguration(result([['category', 'text'], ['created', 'timestamp'], ['amount', 'numeric'], ['count', 'int8']], []))
  assert.equal(inferred.xColumn, 'created'); assert.equal(inferred.valueColumn, 'count')
})
test('retains valid selections and replaces missing selections', () => {
  const previous = config({ xColumn: 'category', valueColumn: 'total', seriesColumn: null })
  const kept = inferVisualizationConfiguration(result([['category', 'text'], ['total', 'numeric']], []), previous)
  assert.equal(kept.xColumn, 'category'); assert.equal(kept.valueColumn, 'total'); assert.equal(kept.seriesColumn, null)
  const changed = inferVisualizationConfiguration(result([['date', 'date'], ['count', 'int8']], []), previous)
  assert.equal(changed.xColumn, 'date'); assert.equal(changed.valueColumn, 'count')
})
test('does not infer high-cardinality identifiers as series', () => {
  const inferred = inferVisualizationConfiguration(result([['date', 'date'], ['count', 'int8'], ['user_id', 'text']], [{ date: '2026-01-01', count: 1, user_id: 'a' }]))
  assert.equal(inferred.seriesColumn, null)
})
test('sums, averages, counts, fills combinations and handles NULL series', () => {
  const input = result([['x', 'text'], ['series', 'text'], ['value', 'numeric']], [{ x: 'b', series: 'A', value: '2' }, { x: 'a', series: 'A', value: '4' }, { x: 'a', series: 'A', value: '6' }, { x: 'a', series: null, value: '3' }])
  const sum = pivotRowsForChart(input, config())
  assert.deepEqual(sum.labels, ['b', 'a']); assert.deepEqual(sum.series[0].data, [2, 10]); assert.deepEqual(sum.series[1], { name: 'NULL', data: [0, 3], missing: [true, false] })
  assert.deepEqual(pivotRowsForChart(input, config({ aggregation: 'average' })).series[0].data, [2, 5])
  assert.deepEqual(pivotRowsForChart(input, config({ aggregation: 'count', valueColumn: null })).series[0].data, [1, 2])
})
test('sorts temporal and numeric axes but preserves categories', () => {
  const temporal = result([['x', 'timestamp'], ['value', 'int4']], [{ x: '2026-10-01', value: 1 }, { x: '2026-02-01', value: 2 }])
  assert.match(pivotRowsForChart(temporal, config({ seriesColumn: null })).labels[0], /2026-02/)
  const numeric = result([['x', 'int4'], ['value', 'int4']], [{ x: 10, value: 1 }, { x: 2, value: 2 }])
  assert.deepEqual(pivotRowsForChart(numeric, config({ seriesColumn: null })).labels, ['2', '10'])
})
test('normalized DuckDB timestamp and numeric strings remain chartable', () => {
  const normalized = result([['x', 'timestamp_ns'], ['value', 'decimal(18,2)']], [
    { x: '2026-01-02 03:04:05.123456789', value: '12.50' },
    { x: '2026-01-01 03:04:05.123456789', value: '7.25' }
  ])
  const pivot = pivotRowsForChart(normalized, config({ seriesColumn: null }))
  assert.match(pivot.labels[0], /2026-01-01/)
  assert.deepEqual(pivot.series[0].data, [7.25, 12.5])
})
test('invalid numeric strings are not converted to misleading zeroes', () => {
  assert.equal(toFiniteNumber('12.5'), 12.5); assert.equal(toFiniteNumber('nope'), null)
  const invalid = result([['x', 'text'], ['value', 'text']], [{ x: 'a', value: 'nope' }])
  assert.deepEqual(pivotRowsForChart(invalid, config({ seriesColumn: null })).series[0].data, [null])
})
test('derives repaired SQL configuration before persistence and preserves explicit choices', () => {
  const input = result([['date', 'date'], ['amount', 'numeric']], [{ date: '2026-01-01', amount: 2 }])
  const stale = config({ xColumn: 'missing', valueColumn: 'gone', seriesColumn: null })
  const effective = deriveEffectiveVisualization(input, stale, 'sql')
  assert.equal(effective.xColumn, 'date'); assert.equal(effective.valueColumn, 'amount')
  assert.deepEqual(deriveEffectiveVisualization(input, effective, 'sql'), effective)
})

test('Builder keeps real Series columns in results and creates only a visual tuple', () => {
  const input = result([['time_bucket', 'timestamptz'], ['country', 'text'], ['device', 'text'], ['count', 'int8']], [
    { time_bucket: '2026-01-01T00:00:00Z', country: 'FR', device: 'mobile', count: '2' },
    { time_bucket: '2026-01-01T00:00:00Z', country: 'FR', device: 'desktop', count: '3' }
  ])
  const effective = deriveEffectiveVisualization(input, config(), 'builder', ['country', 'device'])
  assert.equal(effective.seriesColumn, 'series')
  assert.deepEqual(effective.seriesColumns, ['country', 'device'])
  const pivot = pivotRowsForChart(input, effective)
  assert.deepEqual(pivot.series.map((series) => series.name), ['country="FR" · device="desktop"', 'country="FR" · device="mobile"'])
  const tuple = decodeBuilderSeriesTuple(pivot.seriesValues[0])
  assert.deepEqual(tuple, [{ column: 'country', value: 'FR' }, { column: 'device', value: 'desktop' }])
  assert.equal(builderSeriesTupleLabel(pivot.seriesValues[0]), 'country="FR" · device="desktop"')
  assert.equal(input.columns.some((column) => column.name === 'series'), false)
})

test('Builder tuple labels remain unambiguous and Date values round-trip', () => {
  const input = result([['time_bucket', 'timestamptz'], ['category', 'text'], ['released_at', 'timestamp'], ['count', 'int8']], [
    { time_bucket: '2026-01-01T00:00:00Z', category: 'A · B', released_at: new Date('2025-12-31T12:00:00Z'), count: 1 }
  ])
  const pivot = pivotRowsForChart(input, deriveEffectiveVisualization(input, config(), 'builder', ['category', 'released_at']))
  assert.equal(pivot.series[0].name, 'category="A · B" · released_at="2025-12-31T12:00:00.000Z"')
  assert.deepEqual(decodeBuilderSeriesTuple(pivot.seriesValues[0]), [
    { column: 'category', value: 'A · B' },
    { column: 'released_at', value: { type: 'date', value: '2025-12-31T12:00:00.000Z' } }
  ])
})

test('Builder supports a single real Series column through the same visual tuple boundary', () => {
  const input = result([['time_bucket', 'timestamptz'], ['country', 'text'], ['count', 'int8']], [{ time_bucket: '2026-01-01T00:00:00Z', country: 'FR', count: 1 }])
  const effective = deriveEffectiveVisualization(input, config(), 'builder', ['country'])
  const pivot = pivotRowsForChart(input, effective)
  assert.equal(pivot.series[0].name, 'country="FR"')
  assert.deepEqual(decodeBuilderSeriesTuple(pivot.seriesValues[0]), [{ column: 'country', value: 'FR' }])
})

test('Builder without Series has no visual breakdown', () => {
  const input = result([['time_bucket', 'timestamptz'], ['count', 'int8']], [{ time_bucket: '2026-01-01T00:00:00Z', count: 1 }])
  const effective = deriveEffectiveVisualization(input, config(), 'builder', [])
  assert.equal(effective.seriesColumn, null)
  assert.deepEqual(effective.seriesColumns, [])
})
