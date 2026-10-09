// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const aiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  analyzeAnomalies: vi.fn(),
  cancel: vi.fn(),
  dispatchAction: vi.fn(),
  chartOptions: null as Record<string, unknown> | null,
}))

vi.mock('echarts-for-react', async () => {
  const React = await import('react')
  const MockChart = React.forwardRef(
    (
      {
        option,
        onEvents,
      }: {
        option: Record<string, unknown>
        onEvents?: unknown
      },
      ref: Ref<unknown>,
    ) => {
      aiMocks.chartOptions = option
      React.useImperativeHandle(ref, () => ({
        getEchartsInstance: () => ({
          dispatchAction: aiMocks.dispatchAction,
          on: vi.fn(),
          off: vi.fn(),
          getZr: () => ({ on: vi.fn(), off: vi.fn() }),
          resize: vi.fn(),
          isDisposed: () => false,
        }),
      }))
      const chartEvents = onEvents as
        { mouseover?: (params: Record<string, unknown>) => void } | undefined
      const chartSeries = option.series as Array<Record<string, unknown>>
      const firstSeries = chartSeries.find(
        (series) => series.aiAnomalyOverlay !== true,
      )
      const markerSeries = chartSeries.find(
        (series) => series.aiAnomalyOverlay === true,
      )
      const firstMarker = (
        markerSeries?.data as Array<Record<string, unknown>> | undefined
      )?.[0]
      return (
        <>
          <div
            data-testid="chart-marker"
            onMouseOver={() =>
              firstMarker &&
              chartEvents?.mouseover?.({
                componentType: 'series',
                seriesIndex: chartSeries.indexOf(markerSeries!),
                seriesName: markerSeries?.name as string,
                data: firstMarker,
              })
            }
          />
          <div
            data-testid="chart-series-point"
            onMouseOver={() =>
              chartEvents?.mouseover?.({
                componentType: 'series',
                seriesName: firstSeries?.name as string,
              })
            }
          />
        </>
      )
    },
  )
  MockChart.displayName = 'MockChart'
  return { default: MockChart }
})
vi.mock('@lib/api', () => ({
  api: {
    clipboardImage: vi.fn(),
    export: { saveBinary: vi.fn() },
    ai: {
      settings: { get: aiMocks.getSettings },
      analyzeAnomalies: aiMocks.analyzeAnomalies,
      cancel: aiMocks.cancel,
    },
  },
}))

import { GenericResultExplorer } from './GenericResultExplorer'
import type { GenericResultExplorerProps } from './GenericResultExplorer'
import type { QueryResult } from '@shared/types'
import type { VisualizationConfiguration } from '@lib/resultVisualization'

const configuration: VisualizationConfiguration = {
  view: 'line',
  xColumn: 'day',
  valueColumn: 'value',
  aggregation: 'sum',
  seriesColumn: null,
}
const result: QueryResult = {
  columns: [
    { name: 'day', dataTypeID: 0, dataTypeName: 'integer' },
    { name: 'value', dataTypeID: 0, dataTypeName: 'integer' },
  ],
  rows: Array.from({ length: 320 }, (_, day) => ({
    day,
    value: day === 157 ? 800 : day === 212 ? -40 : 20,
  })),
  rowCount: 320,
  durationMs: 3,
}
const multiSeriesResult: QueryResult = {
  columns: [
    { name: 'day', dataTypeID: 0, dataTypeName: 'integer' },
    { name: 'series', dataTypeID: 0, dataTypeName: 'text' },
    { name: 'value', dataTypeID: 0, dataTypeName: 'integer' },
  ],
  rows: Array.from({ length: 6 }, (_, day) =>
    ['A', 'B', 'C'].map((series, index) => ({
      day,
      series,
      value: day + index + 10,
    })),
  ).flat(),
  rowCount: 18,
  durationMs: 3,
}
const multiSeriesConfiguration: VisualizationConfiguration = {
  ...configuration,
  seriesColumn: 'series',
}
const props = (
  overrides: Partial<GenericResultExplorerProps> = {},
): GenericResultExplorerProps => ({
  mode: 'sql',
  result,
  resultRevision: 1,
  running: false,
  error: null,
  isResultStale: false,
  configuration,
  seriesVisibility: {},
  activeFilters: [],
  onConfigurationChange: vi.fn(),
  onSeriesVisibilityChange: vi.fn(),
  onAddFilter: vi.fn(),
  onRemoveFilter: vi.fn(),
  onClearFilters: vi.fn(),
  ...overrides,
})
const successfulAnalysis = {
  ok: true,
  value: {
    summary: 'A spike and drop are visible.',
    anomalies: [
      {
        seriesIndex: 0,
        pointIndex: 7,
        title: 'Narrow spike',
        reason: 'The sampled value at day 157 rises far above its neighbors.',
        severity: 'high',
      },
      {
        seriesIndex: 0,
        pointIndex: 12,
        title: 'Narrow drop',
        reason: 'The sampled value at day 212 falls far below its neighbors.',
        severity: 'medium',
      },
    ],
    limitations: ['The sample cannot explain the cause.'],
    followUps: ['Compare another time window.'],
  },
}
const analysisForSubmittedSeries = (request: {
  chart: { series: Array<{ name: string }> }
}) => ({
  ok: true,
  value: {
    summary: 'Each submitted series has one flagged point.',
    anomalies: request.chart.series.map((series, seriesIndex) => ({
      seriesIndex,
      pointIndex: 2,
      title: `${series.name} spike`,
      reason: `${series.name} rises above its neighbors.`,
    })),
    limitations: [],
    followUps: [],
  },
})
const renderedAnomalySeries = () => {
  const series = aiMocks.chartOptions?.series as
    Array<Record<string, unknown>> | undefined
  return (series ?? [])
    .filter((item) => item.aiAnomalyOverlay === true)
    .map((item) => {
      const data = item.data as Array<{ sourceSeriesName: string }>
      return data[0]?.sourceSeriesName
    })
    .filter((name): name is string => Boolean(name))
    .sort()
}

beforeEach(() => {
  aiMocks.getSettings.mockReset().mockResolvedValue({
    ok: true,
    value: { provider: 'openrouter', model: 'test-model', hasApiKey: true },
  })
  aiMocks.analyzeAnomalies.mockReset().mockResolvedValue(successfulAnalysis)
  aiMocks.cancel.mockReset()
  aiMocks.dispatchAction.mockReset()
  aiMocks.chartOptions = null
})
afterEach(cleanup)

describe('AI chart anomaly analysis', () => {
  it('shows loading, exact chart markers, a toggle, and on-demand AI details', async () => {
    let resolveAnalysis: (() => void) | undefined
    aiMocks.analyzeAnomalies.mockImplementation(
      (request: {
        chart: { series: Array<{ points: Array<{ x: unknown; y: number }> }> }
      }) =>
        new Promise((resolve) => {
          const points = request.chart.series[0].points
          const spikeIndex = points.findIndex(
            (point) => point.x === 157 && point.y === 800,
          )
          const dropIndex = points.findIndex(
            (point) => point.x === 212 && point.y === -40,
          )
          resolveAnalysis = () =>
            resolve({
              ...successfulAnalysis,
              value: {
                ...successfulAnalysis.value,
                anomalies: successfulAnalysis.value.anomalies.map(
                  (anomaly, index) => ({
                    ...anomaly,
                    pointIndex: index === 0 ? spikeIndex : dropIndex,
                  }),
                ),
              },
            })
        }),
    )
    render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    const analyzingButton = await screen.findByRole('button', {
      name: 'Analyzing with AI…',
    })
    expect((analyzingButton as HTMLButtonElement).disabled).toBe(true)
    resolveAnalysis?.()

    expect(
      await screen.findByRole('button', { name: 'AI details (2)' }),
    ).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Show anomalies' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.getAttribute('title')).toContain('Show or hide')
    await waitFor(() => {
      const chartSeries = aiMocks.chartOptions?.series as
        Array<Record<string, unknown>> | undefined
      const markerSeries = chartSeries?.find(
        (series) => series.aiAnomalyOverlay === true,
      )
      const markerData = markerSeries?.data as
        Array<{ value: unknown[]; originalIndex: number }> | undefined
      expect(markerData?.map(({ value }) => value)).toEqual([
        ['157', 800],
        ['212', -40],
      ])
    })
    fireEvent.mouseOver(screen.getByTestId('chart-marker'))
    const tooltipFormatter = (
      aiMocks.chartOptions?.tooltip as {
        formatter: (params: unknown) => string
      }
    ).formatter
    const markerSeries = (
      aiMocks.chartOptions?.series as Array<Record<string, unknown>>
    ).find((series) => series.aiAnomalyOverlay === true)
    const markerTooltipConfig = markerSeries?.tooltip as {
      trigger: string
      formatter: (input: unknown) => string
    }
    expect(markerTooltipConfig.trigger).toBe('item')
    const markerData = (markerSeries?.data as Array<Record<string, unknown>>)[0]
    const markerTooltip = markerTooltipConfig.formatter({
      componentType: 'series',
      seriesName: markerSeries?.name,
      data: markerData,
    })
    expect(markerTooltip).toContain('AI anomaly · high')
    expect(markerTooltip).toContain('Narrow spike')
    expect(markerTooltip).toContain('day 157 rises far above')
    expect(markerTooltip).toContain('<strong>800</strong>')
    fireEvent.mouseOver(screen.getByTestId('chart-series-point'))
    const pointTooltip = tooltipFormatter([
      { axisValue: '157', dataIndex: 157, seriesName: 'value', value: 800 },
    ])
    expect(pointTooltip).toContain('Narrow spike')
    expect(pointTooltip).toContain('day 157 rises far above')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => {
      const series = aiMocks.chartOptions?.series as
        Array<Record<string, unknown>> | undefined
      expect(series?.some((item) => item.aiAnomalyOverlay === true)).toBe(false)
      const formatter = (
        aiMocks.chartOptions?.tooltip as {
          formatter: (params: unknown) => string
        }
      ).formatter
      expect(
        formatter([
          { axisValue: '157', dataIndex: 157, seriesName: 'value', value: 800 },
        ]),
      ).not.toContain('AI anomaly')
    })
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'AI details (2)' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('A spike and drop are visible.')).toBeTruthy()
    expect(
      screen.getByText(
        'The sampled value at day 157 rises far above its neighbors.',
      ),
    ).toBeTruthy()
    const request = aiMocks.analyzeAnomalies.mock.calls[0][0]
    expect(request.chart.series[0].points).toContainEqual({ x: 157, y: 800 })
    expect(request.chart.series[0].points).toContainEqual({ x: 212, y: -40 })
    expect(request.chart.series[0].points.length).toBeLessThanOrEqual(32)
    expect(request.chart.series[0].originalPointCount).toBe(320)
    expect(request.chart.series[0].sampleCoverage).toBe(
      request.chart.series[0].points.length / 320,
    )
  })

  it('preserves AI analysis and toggle state when switching axis scale', async () => {
    const view = render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    expect(
      await screen.findByRole('button', { name: 'AI details (2)' }),
    ).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Show anomalies' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    view.rerender(
      <GenericResultExplorer
        {...props({
          configuration: { ...configuration, valueAxisScale: 'log' },
        })}
      />,
    )
    await waitFor(() => {
      const renderedSeries = aiMocks.chartOptions?.series as
        Array<Record<string, unknown>> | undefined
      const markerData = renderedSeries?.find(
        (series) => series.aiAnomalyOverlay === true,
      )?.data as Array<{ value: unknown[]; originalIndex: number }> | undefined
      expect(markerData?.map(({ value }) => value)).toEqual([['157', 800]])
      expect(markerData?.map(({ originalIndex }) => originalIndex)).toEqual([
        157,
      ])
    })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'AI details (2)' })).toBeTruthy()
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'AI details (2)' }))
    expect(screen.getByText(/Nonpositive flagged values remain/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'AI details (2)' }))

    view.rerender(
      <GenericResultExplorer
        {...props({
          configuration: { ...configuration, valueAxisScale: 'linear' },
        })}
      />,
    )
    await waitFor(() => {
      const renderedSeries = aiMocks.chartOptions?.series as
        Array<Record<string, unknown>> | undefined
      const markerData = renderedSeries?.find(
        (series) => series.aiAnomalyOverlay === true,
      )?.data as Array<{ originalIndex: number }> | undefined
      expect(markerData?.map(({ originalIndex }) => originalIndex)).toEqual([
        157, 212,
      ])
    })
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()
  })

  it('preserves findings for submitted series across hide and show without analyzing newly visible series', async () => {
    aiMocks.analyzeAnomalies.mockImplementation(
      (request: { chart: { series: Array<{ name: string }> } }) =>
        Promise.resolve(analysisForSubmittedSeries(request)),
    )
    const view = render(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: { C: false },
        })}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    expect(
      await screen.findByRole('button', { name: 'AI details (2)' }),
    ).toBeTruthy()
    await waitFor(() => expect(renderedAnomalySeries()).toEqual(['A', 'B']))
    expect(aiMocks.analyzeAnomalies.mock.calls[0][0].chart.series).toHaveLength(
      2,
    )

    const toggle = screen.getByRole('button', { name: 'Show anomalies' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    view.rerender(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: { A: false, C: false },
        })}
      />,
    )
    await waitFor(() => expect(renderedAnomalySeries()).toEqual(['B']))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'AI details (2)' })).toBeTruthy()

    view.rerender(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: {},
        })}
      />,
    )
    await waitFor(() => expect(renderedAnomalySeries()).toEqual(['A', 'B']))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    view.rerender(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: { B: false },
        })}
      />,
    )
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    view.rerender(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: {},
        })}
      />,
    )
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => expect(renderedAnomalySeries()).toEqual([]))
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()

    fireEvent.click(toggle)
    await waitFor(() => expect(renderedAnomalySeries()).toEqual(['A', 'B']))
    fireEvent.click(screen.getByRole('button', { name: 'AI details (2)' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('A: 6 of 6 valid points (100%)')).toBeTruthy()
    expect(screen.getByText('B: 6 of 6 valid points (100%)')).toBeTruthy()
    expect(screen.queryByText('C: 6 of 6 valid points (100%)')).toBeNull()
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()
  })

  it('keeps an in-flight request scoped to its submitted series during visibility changes', async () => {
    let finishAnalysis: (() => void) | undefined
    aiMocks.analyzeAnomalies.mockImplementation(
      (request: { chart: { series: Array<{ name: string }> } }) =>
        new Promise((resolve) => {
          finishAnalysis = () => resolve(analysisForSubmittedSeries(request))
        }),
    )
    const view = render(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: { C: false },
        })}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    await waitFor(() => expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce())
    view.rerender(
      <GenericResultExplorer
        {...props({
          result: multiSeriesResult,
          configuration: multiSeriesConfiguration,
          seriesVisibility: { A: false },
        })}
      />,
    )
    expect(aiMocks.cancel).not.toHaveBeenCalled()
    finishAnalysis?.()
    expect(
      await screen.findByRole('button', { name: 'AI details (2)' }),
    ).toBeTruthy()
    await waitFor(() => expect(renderedAnomalySeries()).toEqual(['B']))
    expect(
      screen
        .getByRole('button', { name: 'Show anomalies' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(aiMocks.analyzeAnomalies.mock.calls[0][0].chart.series).toHaveLength(
      2,
    )
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()
  })

  it('shows a calm empty state without markers when no anomalies are returned', async () => {
    aiMocks.analyzeAnomalies.mockResolvedValue({
      ok: true,
      value: {
        summary: 'No clear candidate stands out.',
        anomalies: [],
        limitations: ['The sample is sparse.'],
        followUps: [],
      },
    })
    render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'AI details (0)' }),
    )
    expect(
      await screen.findByText(
        'No candidate anomalies found in the supplied sample.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show anomalies' })).toBeNull()
  })

  it('invalidates completed findings when chart data changes without a revision bump', async () => {
    const view = render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    expect(
      await screen.findByRole('button', { name: 'AI details (2)' }),
    ).toBeTruthy()

    const changedResult: QueryResult = {
      ...result,
      rows: result.rows.map((row, index) =>
        index === 157 ? { ...row, value: 900 } : row,
      ),
    }
    view.rerender(
      <GenericResultExplorer
        {...props({ result: changedResult, resultRevision: 1 })}
      />,
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'AI details (2)' }),
      ).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Show anomalies' }),
      ).toBeNull()
    })
    expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce()
  })

  it('shows provider errors', async () => {
    aiMocks.analyzeAnomalies.mockResolvedValue({
      ok: false,
      code: 'provider',
      message: 'OpenRouter is unavailable.',
    })
    render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'OpenRouter is unavailable.',
    )
  })

  it('refreshes button visibility when OpenRouter settings change', async () => {
    aiMocks.getSettings
      .mockResolvedValueOnce({
        ok: true,
        value: { provider: 'openrouter', model: '', hasApiKey: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          provider: 'openrouter',
          model: 'test-model',
          hasApiKey: true,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { provider: 'openrouter', model: '', hasApiKey: false },
      })
    render(<GenericResultExplorer {...props()} />)
    window.dispatchEvent(new Event('datakoala:ai-settings-changed'))
    expect(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    ).toBeTruthy()
    window.dispatchEvent(new Event('datakoala:ai-settings-changed'))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Analyze with AI' }),
      ).toBeNull(),
    )
  })

  it('cancels and discards a response after the chart context changes', async () => {
    let resolveAnalysis: ((value: unknown) => void) | undefined
    aiMocks.analyzeAnomalies.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnalysis = resolve
        }),
    )
    const view = render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    await waitFor(() => expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce())
    const requestId = aiMocks.analyzeAnomalies.mock.calls[0][0].requestId
    const changedResult: QueryResult = {
      ...result,
      rows: result.rows.map((row, index) =>
        index === 157 ? { ...row, value: 900 } : row,
      ),
    }
    view.rerender(
      <GenericResultExplorer
        {...props({ result: changedResult, resultRevision: 1 })}
      />,
    )
    await waitFor(() => expect(aiMocks.cancel).toHaveBeenCalledWith(requestId))
    resolveAnalysis?.(successfulAnalysis)
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Analyze with AI',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    )
    expect(screen.queryByText('A spike and drop are visible.')).toBeNull()
  })
})
