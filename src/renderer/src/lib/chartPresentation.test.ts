import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildChartPresentationOptions,
  buildChartTooltipFormatter,
  formatChartNumber,
  formatTimeBucketLabel,
  inferTimeDisplayPrecision,
  positionChartTooltip
} from './chartPresentation.ts'

test('formats every builder time bucket deterministically in UTC', () => {
  const value = '2026-08-02T14:37:00Z'
  assert.equal(formatTimeBucketLabel(value, 'minute'), '02 Aug, 14:37')
  assert.equal(formatTimeBucketLabel(value, 'hour'), '02 Aug, 14:00')
  assert.equal(formatTimeBucketLabel(value, 'day'), '02 Aug')
  assert.equal(formatTimeBucketLabel('2026-07-28T00:00:00Z', 'week'), 'Week of 28 Jul')
  assert.equal(formatTimeBucketLabel(value, 'month'), 'Aug 2026')
  assert.equal(formatTimeBucketLabel(value, 'quarter'), 'Q3 2026')
  assert.equal(formatTimeBucketLabel(value, 'year'), '2026')
})

test('invalid dates retain their original display value', () => {
  assert.equal(formatTimeBucketLabel('not-a-date', 'day'), 'not-a-date')
  assert.equal(formatTimeBucketLabel('north', 'month'), 'north')
})

test('SQL precision inference is conservative and preserves categories', () => {
  assert.equal(inferTimeDisplayPrecision(['2026-08-01T14:00:00Z', '2026-08-01T15:00:00Z']), 'hour')
  assert.equal(inferTimeDisplayPrecision(['2025-01-01', '2026-01-01']), 'year')
  assert.equal(inferTimeDisplayPrecision(['east', 'west']), null)
  assert.equal(inferTimeDisplayPrecision(['2026-08-01', 'not-a-date']), null)
})

test('chart number formatting handles zero, fractions, nulls, and numeric strings', () => {
  assert.equal(formatChartNumber(0), '0')
  assert.equal(formatChartNumber(12345.678), '12,345.68')
  assert.equal(formatChartNumber('1000'), '1,000')
  assert.equal(formatChartNumber(null), '—')
})

test('tooltip uses the axis formatter and only public display fields', () => {
  const formatter = buildChartTooltipFormatter((value) => formatTimeBucketLabel(value, 'day'))
  const html = formatter([{ axisValue: '2026-08-02T00:00:00Z', seriesName: 'Orders', value: 0, data: { internal: true } }])
  assert.match(html, /02 Aug/)
  assert.match(html, /Orders/)
  assert.match(html, />0</)
  assert.doesNotMatch(html, /undefined|\[object Object\]|internal/)
})

test('tooltip positioning stays inside a small chart viewport', () => {
  const sizes = { contentSize: [220, 160], viewSize: [320, 200] }
  assert.deepEqual(positionChartTooltip([310, 190], null, {} as HTMLElement, null, sizes), [100, 40])
  assert.deepEqual(positionChartTooltip([0, 0], null, {} as HTMLElement, null, sizes), [12, 12])
})

test('presentation keeps line series unstacked and only stacks broken-down bars', () => {
  const base = { labels: ['2026-08-02T00:00:00Z'], series: [{ name: 'Orders', data: [1] }], mode: 'builder' as const, timeBucket: 'day' }
  const line = buildChartPresentationOptions({ ...base, view: 'line', hasSeriesColumn: true })
  assert.equal((line.series as { stack?: string }[])[0].stack, undefined)
  const plainBar = buildChartPresentationOptions({ ...base, view: 'bar', hasSeriesColumn: false })
  assert.equal((plainBar.series as { stack?: string }[])[0].stack, undefined)
  const stackedBar = buildChartPresentationOptions({ ...base, view: 'bar', hasSeriesColumn: true })
  assert.equal((stackedBar.series as { stack?: string }[])[0].stack, 'total')
  const axis = stackedBar.xAxis as { axisLabel: { formatter: (value: unknown) => string } }
  const tooltip = stackedBar.tooltip as { backgroundColor: string; confine: boolean; extraCssText: string; formatter: (value: unknown) => string }
  assert.equal(axis.axisLabel.formatter(base.labels[0]), '02 Aug')
  assert.equal(tooltip.backgroundColor, '#161922')
  assert.equal(tooltip.confine, true)
  assert.match(tooltip.extraCssText, /width.*max-height.*overflow:hidden/)
  assert.match(tooltip.formatter([{ axisValue: base.labels[0], seriesName: 'Orders', value: 1 }]), /02 Aug/)
})

test('tooltip marks and retains the hovered series without becoming scrollable', () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({ seriesName: `series-${index}`, value: index === 13 ? 0 : index, color: '#fff', axisValue: 'x' }))
  const formatter = buildChartTooltipFormatter(String, 'series-13')
  const html = formatter(rows)
  assert.match(html, /chart-tooltip-row-hovered[^>]*>.*series-13/)
  assert.match(html, /2 more/)
  const options = buildChartPresentationOptions({ labels: ['x'], series: [], view: 'line', hasSeriesColumn: true, mode: 'sql', hoveredSeriesIdentity: 'series-13' })
  assert.match((options.tooltip as { extraCssText: string }).extraCssText, /overflow:hidden/)
  assert.doesNotMatch((options.tooltip as { extraCssText: string }).extraCssText, /overflow:auto/)
})

test('time range selection never exposes the generic ECharts brush toolbox', () => {
  const options = buildChartPresentationOptions({
    labels: ['2026-08-02T00:00:00Z'],
    series: [{ name: 'Orders', data: [1] }],
    view: 'line',
    hasSeriesColumn: false,
    mode: 'sql',
    rangeSelectionEnabled: true
  })
  assert.deepEqual(options.toolbox, { show: false })
  assert.deepEqual((options.brush as { toolbox?: unknown[] }).toolbox, [])
})

test('area presentation stacks Series and uses a filled line renderer', () => {
  const options = buildChartPresentationOptions({ labels: ['x'], series: [{ name: 'A', data: [2] }], view: 'area', hasSeriesColumn: true, mode: 'sql' })
  const series = (options.series as Array<Record<string, unknown>>)[0]
  assert.equal(series.type, 'line')
  assert.equal(series.stack, 'total')
  assert.deepEqual(series.areaStyle, { opacity: 0.3 })
})

test('hierarchical presentation shares data and exposes path, value, and share tooltip', () => {
  const hierarchy = [{ name: 'France', value: 120, children: [{ name: 'Tech', value: 75 }] }]
  for (const view of ['treemap', 'sunburst'] as const) {
    const options = buildChartPresentationOptions({ labels: [], series: [], view, hasSeriesColumn: true, mode: 'sql', hierarchy })
    const series = (options.series as Array<Record<string, unknown>>)[0]
    assert.equal(series.type, view)
    assert.equal(series.data, hierarchy)
    const formatter = (options.tooltip as { formatter: (value: unknown) => string }).formatter
    assert.match(formatter({ treePathInfo: [{ name: 'France' }, { name: 'Tech' }], value: 75 }), /France → Tech/)
    assert.match(formatter({ treePathInfo: [{ name: 'France' }, { name: 'Tech' }], value: 75 }), /62.5%/)
  }
})
