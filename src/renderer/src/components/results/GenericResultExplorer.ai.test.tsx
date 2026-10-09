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
      const firstSeries = (option.series as Array<Record<string, unknown>>)?.[0]
      const firstMarker = (
        firstSeries?.markPoint as
          { data?: Array<Record<string, unknown>> } | undefined
      )?.data?.[0]
      return (
        <>
          <div
            data-testid="chart-marker"
            onMouseOver={() =>
              firstMarker &&
              chartEvents?.mouseover?.({
                componentType: 'markPoint',
                seriesIndex: 0,
                seriesName: firstSeries?.name as string,
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
      const markerData = chartSeries?.[0]?.markPoint as
        { data: Array<{ coord: unknown[] }> } | undefined
      expect(markerData?.data.map((marker) => marker.coord)).toEqual([
        ['157', 800],
        ['212', -40],
      ])
    })
    fireEvent.mouseOver(screen.getByTestId('chart-marker'))
    expect(aiMocks.dispatchAction).toHaveBeenCalledWith({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: 157,
    })
    const tooltipFormatter = (
      aiMocks.chartOptions?.tooltip as {
        formatter: (params: unknown) => string
      }
    ).formatter
    const markerTooltip = tooltipFormatter([
      { axisValue: '157', dataIndex: 157, seriesName: 'value', value: 800 },
    ])
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
      expect(series?.[0].markPoint).toBeUndefined()
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
      const markerData = (
        renderedSeries?.[0]?.markPoint as
          | { data: Array<{ coord: unknown[]; originalIndex: number }> }
          | undefined
      )?.data
      expect(markerData).toEqual([
        { coord: ['157', 800], value: 800, originalIndex: 157 },
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
      const markerData = (
        renderedSeries?.[0]?.markPoint as
          { data: Array<{ originalIndex: number }> } | undefined
      )?.data
      expect(markerData?.map(({ originalIndex }) => originalIndex)).toEqual([
        157, 212,
      ])
    })
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
    view.rerender(<GenericResultExplorer {...props({ resultRevision: 2 })} />)
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
