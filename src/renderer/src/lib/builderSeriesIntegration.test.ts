import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '@shared/types'
import { generateBuilderQuery } from './builderSql.ts'
import { applyResultFilters, createResultFilter, resultFilterDemotion, type BuilderFilterProvenance } from './resultFilters.ts'
import { deriveEffectiveVisualization, pivotRowsForChart, type VisualizationConfiguration } from './resultVisualization.ts'
import { transitionBuilderState } from './builderTransitions.ts'

const table = { schema: 'public', name: 'events' }
const builder = { table, timeColumn: 'created_at', timeBucket: 'hour' as const, seriesColumns: ['country', 'device'] }
const result: QueryResult = {
  columns: [
    { name: 'time_bucket', dataTypeName: 'timestamptz', dataTypeID: 0 },
    { name: 'country', dataTypeName: 'text', dataTypeID: 0 },
    { name: 'device', dataTypeName: 'text', dataTypeID: 0 },
    { name: 'count', dataTypeName: 'int8', dataTypeID: 0 }
  ],
  rows: [
    { time_bucket: '2026-08-01T10:00:00Z', country: 'FR', device: 'mobile', count: '2' },
    { time_bucket: '2026-08-01T10:00:00Z', country: 'FR', device: 'desktop', count: '3' }
  ],
  rowCount: 2,
  durationMs: 1
}
const visual: VisualizationConfiguration = { view: 'line', xColumn: 'time_bucket', valueColumn: 'count', aggregation: 'sum', seriesColumn: null }

test('independent SQL columns feed a visual tuple and client tuple filter', () => {
  const query = generateBuilderQuery({ ...builder, timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } })
  assert.match(query.sql, /"country",\n  "device",/)
  assert.doesNotMatch(query.sql, /concat_ws|AS "series"|::text/)
  assert.match(query.sql, /GROUP BY 1, 2, 3/)
  const effective = deriveEffectiveVisualization(result, visual, 'builder', builder.seriesColumns)
  const pivot = pivotRowsForChart(result, effective)
  const filter = createResultFilter('series', 'equals', pivot.seriesValues[0])
  assert.deepEqual(applyResultFilters(result.rows, [filter]), [result.rows[1]])
})

test('promoted visual tuple expands to null-safe predicates on every source column', () => {
  const pivot = pivotRowsForChart(result, deriveEffectiveVisualization(result, visual, 'builder', builder.seriesColumns))
  const provenance: BuilderFilterProvenance = {
    mode: 'builder', resultAlias: 'series', table, sourceColumns: builder.seriesColumns,
    timeColumn: builder.timeColumn, timeBucket: builder.timeBucket,
    sourceKind: 'series-tuple', targetKind: 'series-tuple', displayLabel: 'country + device'
  }
  const filter = { ...createResultFilter('series', 'equals', pivot.seriesValues[0]), execution: 'query' as const, provenance }
  const query = generateBuilderQuery({ ...builder, timeRange: { kind: 'rolling', amount: 24, unit: 'hour' }, filters: [filter] })
  assert.match(query.sql, /"country" IS NOT DISTINCT FROM \$1 AND "device" IS NOT DISTINCT FROM \$2/)
  assert.deepEqual(query.parameters, ['FR', 'desktop'])
  assert.doesNotMatch(query.sql, /concat_ws|AS "series"/)
  assert.deepEqual(resultFilterDemotion(filter, result.columns.map((column) => column.name)), { allowed: true, column: 'series' })
})

test('single-column visual tuple uses source-column provenance for promotion and demotion', () => {
  const singleResult: QueryResult = {
    ...result,
    columns: result.columns.filter((column) => column.name !== 'device'),
    rows: result.rows.map(({ device: _device, ...row }) => row)
  }
  const singleBuilder = { ...builder, seriesColumns: ['country'] }
  const tuple = pivotRowsForChart(singleResult, deriveEffectiveVisualization(singleResult, visual, 'builder', ['country'])).seriesValues[0]
  const provenance: BuilderFilterProvenance = {
    mode: 'builder', resultAlias: 'series', table, sourceColumns: ['country'], sourceColumn: 'country',
    timeColumn: builder.timeColumn, timeBucket: builder.timeBucket,
    sourceKind: 'single-column', targetKind: 'source-column', displayLabel: 'country'
  }
  const filter = { ...createResultFilter('series', 'equals', tuple), execution: 'query' as const, provenance }
  const query = generateBuilderQuery({ ...singleBuilder, timeRange: { kind: 'rolling', amount: 24, unit: 'hour' }, filters: [filter] })
  assert.match(query.sql, /"country" IS NOT DISTINCT FROM \$1/)
  assert.deepEqual(query.parameters, ['FR'])
  assert.deepEqual(resultFilterDemotion(filter, singleResult.columns.map((column) => column.name)), { allowed: true, column: 'series' })
})

test('Date-valued visual tuples preserve typed comparison and query parameters', () => {
  const date = new Date('2026-08-01T09:00:00.000Z')
  const dateResult: QueryResult = {
    columns: [
      { name: 'time_bucket', dataTypeName: 'timestamptz', dataTypeID: 0 },
      { name: 'released_at', dataTypeName: 'timestamp', dataTypeID: 0 },
      { name: 'count', dataTypeName: 'int8', dataTypeID: 0 }
    ],
    rows: [{ time_bucket: '2026-08-01T10:00:00Z', released_at: date, count: 1 }],
    rowCount: 1,
    durationMs: 1
  }
  const dateBuilder = { ...builder, seriesColumns: ['released_at'] }
  const tuple = pivotRowsForChart(dateResult, deriveEffectiveVisualization(dateResult, visual, 'builder', ['released_at'])).seriesValues[0]
  assert.deepEqual(applyResultFilters(dateResult.rows, [createResultFilter('series', 'equals', tuple)]), dateResult.rows)
  const provenance: BuilderFilterProvenance = {
    mode: 'builder', resultAlias: 'series', table, sourceColumns: ['released_at'], sourceColumn: 'released_at',
    timeColumn: builder.timeColumn, timeBucket: builder.timeBucket,
    sourceKind: 'single-column', targetKind: 'source-column', displayLabel: 'released_at'
  }
  const query = generateBuilderQuery({ ...dateBuilder, timeRange: { kind: 'rolling', amount: 24, unit: 'hour' }, filters: [{ ...createResultFilter('series', 'equals', tuple), execution: 'query', provenance }] })
  assert.deepEqual(query.parameters, ['2026-08-01T09:00:00.000Z'])
})

test('tuple filters survive harmless changes and are removed when Series dimensions change', () => {
  const tuple = pivotRowsForChart(result, deriveEffectiveVisualization(result, visual, 'builder', builder.seriesColumns)).seriesValues[0]
  const provenance: BuilderFilterProvenance = {
    mode: 'builder', resultAlias: 'series', table, sourceColumns: builder.seriesColumns,
    timeColumn: builder.timeColumn, timeBucket: builder.timeBucket,
    sourceKind: 'series-tuple', targetKind: 'series-tuple', displayLabel: 'country + device'
  }
  const filter = { ...createResultFilter('series', 'equals', tuple), provenance }
  const state = { builder, builderResultFilters: [filter] }
  assert.deepEqual(transitionBuilderState(state, { timeBucket: 'day' }).builderResultFilters, [filter])
  const changed = transitionBuilderState(state, { seriesColumns: ['country'] })
  assert.deepEqual(changed.builderResultFilters, [])
  assert.match(changed.removedDescriptions[0], /Series dimensions changed/)
})
