import assert from 'node:assert/strict'
import { test } from 'vitest'
import { formatCompactNumber } from './compactNumber.ts'
import { buildChartPresentationOptions } from './chartPresentation.ts'

test('compact notation keeps useful precision and stable suffixes', () => {
  for (const [value, expected] of [
    [1000, '1k'],
    [1250, '1.25k'],
    [1500, '1.5k'],
    [12500, '12.5k'],
    [125000, '125k'],
    [1e6, '1M'],
    [2.5e6, '2.5M'],
    [1e9, '1B'],
    [1e12, '1T'],
    [-1250, '-1.25k'],
    [-2.5e6, '-2.5M'],
    [999999, '1M'],
    [-999999, '-1M'],
    [999999999, '1B'],
    [999999999999, '1T'],
    [0, '0'],
    [12.5, '12.5'],
    [0.125, '0.13'],
    [999, '999'],
    ['1250', '1.25k'],
    [null, '—'],
    [undefined, '—'],
    ['', ''],
    ['unknown', 'unknown'],
    [Infinity, 'Infinity'],
    [NaN, 'NaN'],
  ] as const)
    assert.equal(formatCompactNumber(value), expected, String(value))
})

test('shared chart axes and tooltips compact values without changing series data', () => {
  for (const view of [
    'line',
    'bar',
    'area',
    'scatter',
    'treemap',
    'sunburst',
  ] as const) {
    const series = [{ name: 'Count', data: [1250000] }]
    const options = buildChartPresentationOptions({
      labels: ['A'],
      series,
      view,
      hasSeriesColumn: false,
      mode: 'sql',
      hierarchy: [{ name: 'A', value: 1250000 }],
    })
    const tooltip = options.tooltip as { formatter: (value: unknown) => string }
    if (view === 'treemap' || view === 'sunburst')
      assert.match(tooltip.formatter({ name: 'A', value: 1250000 }), /1.25M/)
    else {
      const axis = options.yAxis as {
        axisLabel: { formatter: (value: unknown) => string }
      }
      assert.equal(axis.axisLabel.formatter(1250000), '1.25M')
      assert.match(
        tooltip.formatter([
          { axisValue: 'A', seriesName: 'Count', value: 1250000, dataIndex: 0 },
        ]),
        /1.25M/,
      )
    }
    assert.deepEqual(series[0].data, [1250000])
  }
})
