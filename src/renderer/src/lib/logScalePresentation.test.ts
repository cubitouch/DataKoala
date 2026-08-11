import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '@shared/types'
import { prepareLogScaleSeries } from './chartAxisScale.ts'
import { buildChartPresentationOptions } from './chartPresentation.ts'
import { inferVisualizationConfiguration, type ChartSeries } from './resultVisualization.ts'

const prepare = (series: ChartSeries[], visibility = {}) => prepareLogScaleSeries(series, visibility)

test('all-positive Log data is unchanged and reports no omissions', () => {
  const source = [{ name: 'A', data: [1, 2, 3] }]
  const result = prepare(source)
  assert.deepEqual(result.series[0].data, [1, 2, 3])
  assert.equal(result.omittedCount, 0)
  assert.equal(result.positiveCount, 3)
  assert.deepEqual(source[0].data, [1, 2, 3])
})

test('zero-only, negative, and mixed-sign values become gaps without clamping', () => {
  assert.deepEqual(prepare([{ name: 'A', data: [0, 0] }]), {
    series: [{ name: 'A', data: [null, null] }], omittedCount: 2, positiveCount: 0
  })
  assert.deepEqual(prepare([{ name: 'A', data: [-4, 2, 0, 8] }]), {
    series: [{ name: 'A', data: [null, 2, null, 8] }], omittedCount: 2, positiveCount: 2
  })
})

test('null-heavy data stays null and nulls are not counted as non-positive omissions', () => {
  const result = prepare([{ name: 'A', data: [null, 0, null, 5] }])
  assert.deepEqual(result.series[0].data, [null, null, null, 5])
  assert.equal(result.omittedCount, 1)
})

test('omission count follows currently visible series and legend isolation', () => {
  const series = [
    { name: 'A', data: [0, 2] },
    { name: 'B', data: [-1, 3] }
  ]
  assert.equal(prepare(series).omittedCount, 2)
  assert.equal(prepare(series, { A: true, B: false }).omittedCount, 1)
  assert.equal(prepare(series, { A: false, B: true }).omittedCount, 1)
})

test('synthetic missing bucket zero is not counted as a genuine zero', () => {
  const result = prepare([{ name: 'A', data: [0, 0, 4], missing: [true, false, false] }])
  assert.deepEqual(result.series[0].data, [null, null, 4])
  assert.equal(result.omittedCount, 1)
})

test('line and bar presentations omit non-positive values and lines do not bridge gaps', () => {
  const series = [{ name: 'A', data: [2, 0, -1, 4] }]
  const line = buildChartPresentationOptions({ labels: ['a', 'b', 'c', 'd'], series, view: 'line', hasSeriesColumn: false, mode: 'sql', valueAxisScale: 'log' }) as { series: Array<{ data: Array<number | null>; connectNulls: boolean }> }
  const bar = buildChartPresentationOptions({ labels: ['a', 'b', 'c', 'd'], series, view: 'bar', hasSeriesColumn: false, mode: 'sql', valueAxisScale: 'log' }) as { series: Array<{ data: Array<number | null> }> }
  assert.deepEqual(line.series[0].data, [2, null, null, 4])
  assert.equal(line.series[0].connectNulls, false)
  assert.deepEqual(bar.series[0].data, [2, null, null, 4])
})

test('Log tooltip uses original genuine value even when the plotted point is omitted', () => {
  const option = buildChartPresentationOptions({
    labels: ['a', 'b'],
    series: [{ name: 'Revenue', data: [5, 0] }],
    view: 'line', hasSeriesColumn: false, mode: 'sql', valueAxisScale: 'log'
  }) as { tooltip: { formatter: (input: unknown) => string } }
  const html = option.tooltip.formatter([{ axisValue: 'b', dataIndex: 1, seriesName: 'Revenue', value: null, color: '#fff' }])
  assert.match(html, />0<\/strong>/)
})

test('Log preference survives compatible result inference and source values remain untouched', () => {
  const result: QueryResult = {
    columns: [
      { name: 'created_at', dataTypeName: 'timestamptz', dataTypeID: 0 },
      { name: 'value', dataTypeName: 'numeric', dataTypeID: 0 }
    ],
    rows: [{ created_at: '2026-08-01T00:00:00Z', value: -2 }],
    rowCount: 1,
    durationMs: 1
  }
  const effective = inferVisualizationConfiguration(result, { view: 'line', xColumn: 'created_at', valueColumn: 'value', aggregation: 'sum', seriesColumn: null, valueAxisScale: 'log' })
  assert.equal(effective.valueAxisScale, 'log')
  assert.equal(result.rows[0].value, -2)
})
