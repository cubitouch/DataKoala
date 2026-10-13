import { describe, expect, it } from 'vitest'
import { chartClickContext } from './chartInteractions'
import {
  chartPointActionFilters,
  type ChartPointContext,
} from './chartPointFilters'
import {
  encodeBuilderSeriesTuple,
  type VisualizationConfiguration,
} from './resultVisualization'

const configuration: VisualizationConfiguration = {
  view: 'line',
  xColumn: 'time',
  valueColumn: 'value',
  aggregation: 'sum',
  seriesColumn: 'service',
  seriesColumns: [],
  valueAxisScale: 'linear',
}
const event = { componentType: 'series', dataIndex: 0, seriesIndex: 0 }
const chart = {
  renderable: true,
  xValues: ['2026-01-01T01:23:45Z'],
  seriesValues: ['Alpha'],
}

describe('point interpretation', () => {
  it('resolves direct source values and preserves bucket context', () => {
    expect(chartClickContext(event, chart, configuration, 'hour')).toEqual({
      xColumn: 'time',
      xValue: chart.xValues[0],
      seriesColumn: 'service',
      seriesValue: 'Alpha',
      seriesFilters: [{ column: 'service', value: 'Alpha' }],
      timeBucket: 'hour',
    })
  })
  it('decodes composite source series instead of filtering their display labels', () => {
    const tuple = encodeBuilderSeriesTuple({ service: 'Alpha', region: 'eu' }, [
      'service',
      'region',
    ])
    expect(
      chartClickContext(
        event,
        { ...chart, seriesValues: [tuple] },
        { ...configuration, seriesColumn: 'series' },
      )?.seriesFilters,
    ).toEqual([
      { column: 'service', value: 'Alpha' },
      { column: 'region', value: 'eu' },
    ])
  })
  it.each([
    {},
    { ...event, componentType: 'legend' },
    { ...event, data: { aiAnomalyOverlay: true } },
  ])('ignores non-point payloads %j', (payload) => {
    expect(chartClickContext(payload, chart, configuration)).toBeNull()
  })
  it('ignores unavailable charts and axes', () => {
    expect(chartClickContext(event, null, configuration)).toBeNull()
    expect(
      chartClickContext(event, { ...chart, renderable: false }, configuration),
    ).toBeNull()
    expect(
      chartClickContext(event, chart, { ...configuration, xColumn: null }),
    ).toBeNull()
  })
})

const context: ChartPointContext = {
  xColumn: 'time',
  xValue: chart.xValues[0],
  seriesColumn: 'service',
  seriesValue: 'Alpha',
}
describe('point actions', () => {
  it.each([
    ['includeX', 'equals'],
    ['excludeX', 'notEquals'],
  ] as const)('maps %s', (action, operator) => {
    expect(chartPointActionFilters(context, action)).toMatchObject([
      { column: 'time', operator, value: context.xValue },
    ])
  })
  it.each([
    ['includeX', 'isNull'],
    ['excludeX', 'isNotNull'],
  ] as const)('maps null %s', (action, operator) => {
    expect(
      chartPointActionFilters({ ...context, xValue: null }, action),
    ).toMatchObject([{ column: 'time', operator }])
  })
  it('keeps series-before-range order and exact bucket boundaries', () => {
    expect(
      chartPointActionFilters(
        { ...context, timeBucket: 'hour' },
        'includeSeriesAndX',
      ),
    ).toMatchObject([
      { column: 'service', operator: 'equals', value: 'Alpha' },
      {
        column: 'time',
        operator: 'range',
        startInclusive: '2026-01-01T01:00:00.000Z',
        endExclusive: '2026-01-01T02:00:00.000Z',
      },
    ])
  })
  it('rejects invalid bucket values without falling back to equality', () => {
    expect(
      chartPointActionFilters(
        { ...context, xValue: 'bad', timeBucket: 'hour' },
        'includeX',
      ),
    ).toEqual([])
  })
  it('excludes composite tuples as one filter', () => {
    expect(
      chartPointActionFilters(
        {
          ...context,
          seriesColumn: 'series',
          seriesFilters: [
            { column: 'service', value: 'Alpha' },
            { column: 'region', value: 'eu' },
          ],
        },
        'excludeSeries',
      ),
    ).toMatchObject([
      { column: 'series', operator: 'notEquals', value: 'Alpha' },
    ])
  })
})
