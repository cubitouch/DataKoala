import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '@shared/types'
import { applyResultFilters, createResultFilter } from './resultFilters.ts'
import { decodeBuilderSeriesTuple, deriveEffectiveVisualization, pivotRowsForChart, type VisualizationConfiguration } from './resultVisualization.ts'

const result: QueryResult = {
  columns: [
    { name: 'created_at', dataTypeName: 'timestamptz', dataTypeID: 0 },
    { name: 'country', dataTypeName: 'text', dataTypeID: 0 },
    { name: 'device', dataTypeName: 'text', dataTypeID: 0 },
    { name: 'revenue', dataTypeName: 'numeric', dataTypeID: 0 }
  ],
  rows: [
    { created_at: '2026-08-01T10:00:00Z', country: 'FR', device: 'mobile', revenue: 2 },
    { created_at: '2026-08-01T10:00:00Z', country: 'FR', device: 'desktop', revenue: 3 },
    { created_at: '2026-08-01T10:00:00Z', country: 'DE', device: 'mobile', revenue: 4 }
  ],
  rowCount: 3,
  durationMs: 1
}
const base: VisualizationConfiguration = { view: 'line', xColumn: 'created_at', valueColumn: 'revenue', aggregation: 'sum', seriesColumn: null, seriesColumns: [], valueAxisScale: 'linear' }

test('SQL mode preserves the simple single-Series presentation', () => {
  const effective = deriveEffectiveVisualization(result, { ...base, seriesColumn: 'country' }, 'result')
  assert.equal(effective.seriesColumn, 'country')
  assert.deepEqual(effective.seriesColumns, [])
  assert.deepEqual(pivotRowsForChart(result, effective).series.map((series) => series.name).sort(), ['DE', 'FR'])
})

test('SQL mode combines multiple selected result columns only in the visualization layer', () => {
  const effective = deriveEffectiveVisualization(result, { ...base, seriesColumns: ['country', 'device'] }, 'result')
  assert.equal(effective.seriesColumn, null)
  assert.deepEqual(effective.seriesColumns, ['country', 'device'])
  const pivot = pivotRowsForChart(result, effective)
  assert.deepEqual(pivot.series.map((series) => series.name), [
    'country="DE" · device="mobile"',
    'country="FR" · device="desktop"',
    'country="FR" · device="mobile"'
  ])
  assert.deepEqual(decodeBuilderSeriesTuple(pivot.seriesValues[1]), [
    { column: 'country', value: 'FR' },
    { column: 'device', value: 'desktop' }
  ])
})

test('SQL tuple filters include and exclude the exact tuple client-side', () => {
  const pivot = pivotRowsForChart(result, deriveEffectiveVisualization(result, { ...base, seriesColumns: ['country', 'device'] }, 'result'))
  const frDesktop = pivot.seriesValues[1]
  assert.deepEqual(applyResultFilters(result.rows, [createResultFilter('series', 'equals', frDesktop)]), [result.rows[1]])
  assert.deepEqual(applyResultFilters(result.rows, [createResultFilter('series', 'notEquals', frDesktop)]), [result.rows[0], result.rows[2]])
})

test('SQL multi-Series selection drops columns that become X or Value dimensions', () => {
  const effective = deriveEffectiveVisualization(result, { ...base, xColumn: 'country', seriesColumns: ['country', 'device'] }, 'result')
  assert.equal(effective.seriesColumn, 'device')
  assert.deepEqual(effective.seriesColumns, [])
})
