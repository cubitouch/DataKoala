import assert from 'node:assert/strict'
import test from 'node:test'
import { measureChartSeries, orderChartSeries } from './chartSeries.ts'
import { summarizeTooltipRows } from './chartTooltip.ts'
import { isolateSeries, reconcileSeriesVisibility, showAllSeries, toggleSeries } from './chartVisibility.ts'
import { validateLogScale } from './chartAxisScale.ts'

const series = [{ name: 'small', data: [1, null] }, { name: 'Large', data: [5, 2] }, { name: 'negative', data: [-2, 1] }]
test('series metrics and order are finite, immutable, and deterministic', () => {
  const before = structuredClone(series)
  assert.deepEqual(orderChartSeries(series).map((item) => item.name), ['Large', 'small', 'negative'])
  assert.deepEqual(orderChartSeries([...series].reverse()).map((item) => item.name), ['Large', 'small', 'negative'])
  assert.deepEqual(measureChartSeries([{ name: 'null', data: [null] }])[0], { series: { name: 'null', data: [null] }, identity: 'null', normalizedName: 'null', finiteSum: 0, finiteAbsoluteSum: 0, nonNullPoints: 0, originalIndex: 0 })
  assert.deepEqual(series, before)
})
test('tooltip bounds entries, omits zeros, and retains hovered zero', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ identity: String(i), name: `A very long label ${i}`, value: i < 4 ? 0 : i }))
  const summary = summarizeTooltipRows(rows, '0', 5)
  assert.equal(summary.rows[0].hovered, true)
  assert.equal(summary.rows.some((row) => row.identity === '0'), true)
  assert.equal(summary.omitted, 10)
  const cappedHover = summarizeTooltipRows(rows, '14', 5)
  assert.equal(cappedHover.rows.at(-1)?.identity, '14')
  assert.equal(cappedHover.rows.at(-1)?.hovered, true)
})
test('legend state uses identities and restores isolated state', () => {
  const ids = ['a', 'b', 'c']
  assert.deepEqual(toggleSeries(showAllSeries(ids), 'b'), { a: true, b: false, c: true })
  const isolated = isolateSeries(showAllSeries(ids), ids, 'b')
  assert.deepEqual(isolated, { a: false, b: true, c: false })
  assert.deepEqual(isolateSeries(isolated, ids, 'b'), showAllSeries(ids))
  assert.deepEqual(reconcileSeriesVisibility(isolated, ['b', 'd']), { b: true, d: true })
})
test('log remains selectable for positive, zero, negative, and null-heavy visible data', () => {
  assert.equal(validateLogScale([{ name: 'a', data: [1, 2] }]).valid, true)
  assert.equal(validateLogScale([{ name: 'a', data: [0, 2] }]).valid, true)
  assert.equal(validateLogScale([{ name: 'a', data: [-1] }]).valid, true)
  const nullOnly = validateLogScale([{ name: 'a', data: [null] }])
  assert.equal(nullOnly.valid, true)
  assert.match(nullOnly.reason ?? '', /No strictly positive visible values/)
  assert.equal(validateLogScale([{ name: 'a', data: [-1] }, { name: 'b', data: [2] }], { a: false, b: true }).valid, true)
})
