// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  chartOptions: null as Record<string, unknown> | null,
}))

vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: Record<string, unknown> }) => {
    aiMocks.chartOptions = option
    return <div data-testid="chart" />
  },
}))
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
    const toggle = screen.getByRole('button', { name: 'AI anomalies' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => {
      const chartSeries = aiMocks.chartOptions?.series as
        Array<Record<string, unknown>> | undefined
      const markerData = chartSeries?.[0]?.markPoint as
        { data: Array<{ coord: unknown[] }> } | undefined
      expect(markerData?.data.map((marker) => marker.coord)).toEqual([
        [157, 800],
        [212, -40],
      ])
    })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
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
    expect(screen.queryByRole('button', { name: 'AI anomalies' })).toBeNull()
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
