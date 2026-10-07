import { describe, expect, it } from 'vitest'
import { formatDisplayValue, isDisplayUnit } from './displayUnit'
import {
  buildChartPresentationOptions,
  formatChartNumber,
} from './chartPresentation'
import {
  inferVisualizationConfiguration,
  visualizationConfigurationsEqual,
} from './resultVisualization'

describe('display units', () => {
  it('validates the supported families and input units', () => {
    for (const unit of ['ms', 's', 'min', 'h'])
      expect(isDisplayUnit({ family: 'time', unit })).toBe(true)
    expect(isDisplayUnit({ family: 'number' })).toBe(true)
    for (const value of [
      null,
      {},
      { family: 'time' },
      { family: 'time', unit: 'days' },
      { family: 'bytes' },
    ])
      expect(isDisplayUnit(value)).toBe(false)
  })
  it('composes with any numeric formatter and leaves missing values alone', () => {
    expect(
      formatDisplayValue(
        3600000000,
        { family: 'time', unit: 'ms' },
        () => '1k',
      ),
    ).toBe('1k h')
    expect(
      formatDisplayValue(
        null,
        { family: 'time', unit: 's' },
        formatChartNumber,
      ),
    ).toBe('—')
    expect(formatDisplayValue(1200, undefined, formatChartNumber)).toBe(
      formatChartNumber(1200),
    )
  })
  it.each([
    [0.025, 's', '25 ms'],
    [0.000025, 's', '25 µs'],
    [0.000000025, 's', '25 ns'],
    [0.000000000001, 's', '0.001 ns'],
    [0, 's', '0 s'],
    [-0.025, 's', '-25 ms'],
    [1500, 'ms', '1.5 s'],
    [90, 's', '1.5 min'],
    [120, 'min', '2 h'],
    [0.5, 'h', '30 min'],
    [999.999, 'ms', '1 s'],
    [59.999, 's', '1 min'],
  ] as const)('scales %s %s to %s', (value, unit, expected) => {
    expect(
      formatDisplayValue(value, { family: 'time', unit }, formatChartNumber),
    ).toBe(expected)
  })
  it('preserves missing and non-finite values', () => {
    for (const value of [null, undefined, '', 'invalid', NaN, Infinity])
      expect(
        formatDisplayValue(
          value,
          { family: 'time', unit: 's' },
          formatChartNumber,
        ),
      ).toBe(formatChartNumber(value))
  })
  it('uses one unit for the axis, crosshair and tooltip without changing data', () => {
    const series = [{ name: 'Latency', data: [1200] }]
    const options = buildChartPresentationOptions({
      labels: ['A'],
      series,
      view: 'line',
      hasSeriesColumn: false,
      mode: 'sql',
      displayUnit: { family: 'time', unit: 'ms' },
    })
    const axis = options.yAxis as {
      axisLabel: { formatter: (value: number) => string }
    }
    const tooltip = options.tooltip as {
      formatter: (value: unknown) => string
      axisPointer: { label: { formatter: (value: unknown) => string } }
    }
    const expected = '1.2 s'
    expect(axis.axisLabel.formatter(1200)).toBe(expected)
    expect(
      tooltip.axisPointer.label.formatter({ axisDimension: 'y', value: 1200 }),
    ).toBe(expected)
    expect(
      tooltip.formatter({
        axisValue: 'A',
        dataIndex: 0,
        seriesName: 'Latency',
        value: 1200,
      }),
    ).toContain(expected)
    expect(series[0].data).toEqual([1200])
  })
  it.each(['treemap', 'sunburst'] as const)(
    'formats %s values without changing percentage semantics',
    (view) => {
      const options = buildChartPresentationOptions({
        labels: [],
        series: [],
        view,
        hasSeriesColumn: true,
        mode: 'sql',
        hierarchy: [{ name: 'A', value: 10 }],
        displayUnit: { family: 'time', unit: 's' },
      })
      const tooltip = options.tooltip as {
        formatter: (value: unknown) => string
      }
      expect(tooltip.formatter({ name: 'A', value: 10 })).toContain('10 s')
      expect(tooltip.formatter({ name: 'A', value: 10 })).toContain('100.0%')
    },
  )
  it('retains units during inference and detects configuration changes', () => {
    const result = {
      columns: [{ name: 'value', dataTypeID: 0, dataTypeName: 'numeric' }],
      rows: [{ value: 1200 }],
      rowCount: 1,
      durationMs: 0,
    }
    const original = inferVisualizationConfiguration(result)
    const configured = {
      ...original,
      displayUnit: { family: 'time' as const, unit: 'ms' as const },
    }
    expect(
      inferVisualizationConfiguration(result, configured).displayUnit,
    ).toEqual(configured.displayUnit)
    expect(visualizationConfigurationsEqual(original, configured)).toBe(false)
    expect(
      visualizationConfigurationsEqual(original, {
        ...original,
        displayUnit: { family: 'number' },
      }),
    ).toBe(true)
  })
})
