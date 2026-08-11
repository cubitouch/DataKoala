import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '../../../shared/types.ts'
import { pivotRowsForChart } from './resultVisualization.ts'

const config = { view: 'line' as const, xColumn: 'x', valueColumn: 'value', aggregation: 'sum' as const, seriesColumn: 'series' }
function result(seriesCount: number, xCount: number): QueryResult {
  const rows: Record<string, unknown>[] = []
  for (let series = 0; series < seriesCount; series++) for (let x = 0; x < xCount; x++) rows.push({ series: `s${series}`, x, value: 1 })
  return { columns: [{ name: 'series', dataTypeID: 25, dataTypeName: 'text' }, { name: 'x', dataTypeID: 23, dataTypeName: 'int4' }, { name: 'value', dataTypeID: 23, dataTypeName: 'int4' }], rows, rowCount: rows.length, durationMs: 1 }
}

test('30 series does not warn and 31 series returns a soft warning', () => {
  assert.equal(pivotRowsForChart(result(30, 1), config).warning, undefined)
  assert.match(pivotRowsForChart(result(31, 1), config).warning ?? '', /31 series/)
})

test('100 series is accepted and 101 series is rejected', () => {
  assert.equal(pivotRowsForChart(result(100, 1), config).renderable, true)
  const rejected = pivotRowsForChart(result(101, 1), config)
  assert.equal(rejected.renderable, false)
  assert.equal(rejected.rejectionReason, 'too-many-series')
})

test('100 × 1,000 potential points is accepted at the hard boundary', () => {
  assert.equal(pivotRowsForChart(result(100, 1_000), config).renderable, true)
})

test('point counts above the hard limit reject before matrix allocation', () => {
  const rejected = pivotRowsForChart(result(100, 1_001), config)
  assert.equal(rejected.renderable, false)
  assert.equal(rejected.rejectionReason, 'too-many-points')
  assert.deepEqual(rejected.series, [])
})

test('empty and null-only series results are safe', () => {
  assert.equal(pivotRowsForChart(result(0, 0), config).renderable, true)
  const nulls = result(1, 2); nulls.rows.forEach((row) => { row.series = null })
  const pivot = pivotRowsForChart(nulls, config)
  assert.equal(pivot.renderable, true)
  assert.equal(pivot.series.length, 1)
})
