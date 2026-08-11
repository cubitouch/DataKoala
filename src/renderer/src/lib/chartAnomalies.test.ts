import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chartAnomalyEligibility, detectChartAnomalies } from './chartAnomalies.ts'
import type { ChartSeries, PivotedResult } from './resultVisualization.ts'

const options = { windowSize: 12, minimumBaselineSize: 6, threshold: 3.5 }
const series = (data: Array<number | null>, missing?: boolean[]): ChartSeries => ({ name: 'A', data, missing })

test('detects upward and downward deviations from independent rolling baselines', () => {
  const found = detectChartAnomalies([
    series([10, 11, 9, 10, 10, 11, 40]),
    { name: 'B', data: [-10, -11, -9, -10, -10, -11, -40] }
  ], options)
  assert.deepEqual(found.map(({ seriesName, dataIndex, direction }) => ({ seriesName, dataIndex, direction })), [
    { seriesName: 'A', dataIndex: 6, direction: 'above' },
    { seriesName: 'B', dataIndex: 6, direction: 'below' }
  ])
})

test('detects one spike after a genuinely flat baseline', () => {
  assert.equal(detectChartAnomalies([series([2, 2, 2, 2, 2, 2, 2 + Number.EPSILON])], options).length, 0)
  assert.deepEqual(detectChartAnomalies([series([2, 2, 2, 2, 2, 2, 20])], options).map(({ dataIndex }) => dataIndex), [6])
  assert.equal(detectChartAnomalies([series([0, 0, 0, 0, 0, 0, -1])], options)[0].direction, 'below')
})

test('reports only the first change when a flat baseline transitions to a stable level', () => {
  assert.deepEqual(detectChartAnomalies([series([10, 10, 10, 10, 10, 10, 11, 11, 11, 11])], options).map(({ dataIndex }) => dataIndex), [6])
})

test('uses small discrete baseline variation as a fallback when MAD is zero', () => {
  assert.deepEqual(detectChartAnomalies([series([10, 10, 10, 10, 10, 11, 9, 11, 10])], options), [])
  assert.deepEqual(detectChartAnomalies([series([10, 10, 10, 10, 10, 11, 30])], options).map(({ dataIndex }) => dataIndex), [6])
})

test('handles missing synthetic zeroes, genuine zeroes, and insufficient history', () => {
  assert.equal(detectChartAnomalies([series([1, 1, 1, 1, 1, 0, 9], [false, false, false, false, false, true, false])], options).length, 0)
  assert.equal(detectChartAnomalies([series([1, 1, 1, 1, 1, 9])], options).length, 0)
})

test('ignores null/non-finite values, supports consecutive anomalies, and does not mutate input', () => {
  const input = series([5, null, 5, Number.NaN, 5, 5, 5, 5, 50, 60])
  const before = [...input.data]
  assert.deepEqual(detectChartAnomalies([input], options).map((item) => item.dataIndex), [8, 9])
  assert.deepEqual(input.data, before)
})

test('eligibility requires a renderable ordered line chart with enough observations', () => {
  const chart: PivotedResult = { renderable: true, labels: [], xValues: [], seriesValues: [], series: [series([1, 2, 3, 4, 5, 6, 7])] }
  const numeric = { name: 'x', dataTypeID: 23, dataTypeName: 'int4' }
  assert.deepEqual(chartAnomalyEligibility(chart, 'line', numeric), { available: true })
  const bar = chartAnomalyEligibility(chart, 'bar', numeric)
  const categorical = chartAnomalyEligibility(chart, 'line', { ...numeric, dataTypeName: 'text' })
  const sparse = chartAnomalyEligibility({ ...chart, series: [series([1, 2])] }, 'line', numeric)
  assert.equal(bar.available, false); if (!bar.available) assert.match(bar.reason, /Line/)
  assert.equal(categorical.available, false); if (!categorical.available) assert.match(categorical.reason, /ordered/)
  assert.equal(sparse.available, false); if (!sparse.available) assert.match(sparse.reason, /6 earlier/)
})

test('presentation attaches silent markers to their original series and omits log-invalid markers', async () => {
  const { buildChartPresentationOptions } = await import('./chartPresentation.ts')
  const anomaly = { seriesName: 'A', dataIndex: 6, value: -2, median: 1, mad: 0, direction: 'below' as const }
  const linear = buildChartPresentationOptions({ labels: [], series: [series([1, 1, 1, 1, 1, 1, -2])], view: 'line', hasSeriesColumn: false, mode: 'sql', anomalies: [anomaly] }) as { series: Array<{ markPoint: { silent: boolean; data: unknown[] } }> }
  assert.equal(linear.series[0].markPoint.silent, true)
  assert.equal(linear.series[0].markPoint.data.length, 1)
  const log = buildChartPresentationOptions({ labels: [], series: [series([1, 1, 1, 1, 1, 1, -2])], view: 'line', hasSeriesColumn: false, mode: 'sql', valueAxisScale: 'log', anomalies: [anomaly] }) as { series: Array<{ markPoint: { data: unknown[] } }> }
  assert.equal(log.series[0].markPoint.data.length, 0)
})
