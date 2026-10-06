import assert from 'node:assert/strict'
import { test } from 'vitest'
import { formatDisplayUnit, normalizeDisplayUnit } from './displayUnit.ts'
import {
  buildChartPresentationOptions,
  formatChartNumber,
} from './chartPresentation.ts'
import { createChartFingerprint } from './chartSemantic.ts'
import {
  inferVisualizationConfiguration,
  visualizationConfigurationsEqual,
  type VisualizationConfiguration,
} from './resultVisualization.ts'

const config: VisualizationConfiguration = {
  view: 'line',
  xColumn: 'x',
  valueColumn: 'value',
  aggregation: 'sum',
  seriesColumn: null,
}

test('units are backward compatible and tolerate invalid persisted metadata', () => {
  for (const value of [
    undefined,
    null,
    {},
    { family: 'time', unit: 'invalid' },
  ])
    assert.deepEqual(normalizeDisplayUnit(value), { family: 'number' })
  assert.equal(formatDisplayUnit(1250, '1,250'), '1,250')
  assert.equal(
    formatDisplayUnit(null, '—', { family: 'time', unit: 'ms' }),
    '—',
  )
  for (const unit of ['ms', 's', 'min', 'h'] as const)
    assert.equal(
      formatDisplayUnit(-12.5, '-12.5', { family: 'time', unit }),
      `-12.5 ${unit}`,
    )
})

test('units survive inference and trigger a new chart revision without changing results', () => {
  const result = {
    columns: [
      { name: 'x', dataTypeID: 0, dataTypeName: 'text' },
      { name: 'value', dataTypeID: 0, dataTypeName: 'float8' },
    ],
    rows: [{ x: 'A', value: 1250 }],
    rowCount: 1,
    durationMs: 1,
  }
  const snapshot = structuredClone(result)
  const withUnit: VisualizationConfiguration = {
    ...config,
    displayUnit: { family: 'time', unit: 's' },
  }
  assert.deepEqual(
    inferVisualizationConfiguration(result, withUnit).displayUnit,
    withUnit.displayUnit,
  )
  assert.equal(
    visualizationConfigurationsEqual(config, {
      ...config,
      displayUnit: { family: 'number' },
    }),
    true,
  )
  assert.equal(visualizationConfigurationsEqual(config, withUnit), false)
  assert.notEqual(
    createChartFingerprint(null, config, {}),
    createChartFingerprint(null, withUnit, {}),
  )
  assert.deepEqual(result, snapshot)
})

test('all shared chart views apply units to their numeric presentation only', () => {
  const expected = `${formatChartNumber(1250)} ms`
  for (const view of [
    'line',
    'bar',
    'area',
    'scatter',
    'treemap',
    'sunburst',
  ] as const) {
    const series = [{ name: 'Latency', data: [1250] }]
    const options = buildChartPresentationOptions({
      labels: ['A'],
      series,
      view,
      hasSeriesColumn: false,
      mode: 'sql',
      displayUnit: { family: 'time', unit: 'ms' },
      hierarchy: [{ name: 'A', value: 1250 }],
    })
    const tooltip = options.tooltip as { formatter: (value: unknown) => string }
    if (view === 'treemap' || view === 'sunburst')
      assert.match(tooltip.formatter({ name: 'A', value: 1250 }), /1,250 ms/)
    else {
      const axis = options.yAxis as {
        axisLabel: { formatter: (value: unknown) => string }
      }
      assert.equal(axis.axisLabel.formatter(1250), expected)
      assert.ok(
        tooltip
          .formatter([
            {
              axisValue: 'A',
              seriesName: 'Latency',
              value: 1250,
              dataIndex: 0,
            },
          ])
          .includes(expected),
      )
    }
    assert.deepEqual(series[0].data, [1250])
  }
})
