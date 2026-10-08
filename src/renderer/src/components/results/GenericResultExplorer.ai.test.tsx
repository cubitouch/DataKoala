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
}))

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="chart" />,
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
    findings: ['A narrow spike appears at point 157.'],
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
})
afterEach(cleanup)

describe('AI chart anomaly analysis', () => {
  it('shows loading and renders the structured analysis from an extrema-preserving sample', async () => {
    let resolveAnalysis: ((value: unknown) => void) | undefined
    aiMocks.analyzeAnomalies.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnalysis = resolve
        }),
    )
    render(<GenericResultExplorer {...props()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Analyze with AI' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Analyzing with AI…' }),
    ).toBeDisabled()
    resolveAnalysis?.(successfulAnalysis)

    expect(
      await screen.findByText('A spike and drop are visible.'),
    ).toBeTruthy()
    expect(screen.getByText('A narrow spike appears at point 157.')).toBeTruthy()
    const request = aiMocks.analyzeAnomalies.mock.calls[0][0]
    expect(request.chart.series[0].points).toContainEqual({ x: 157, y: 800 })
    expect(request.chart.series[0].points).toContainEqual({ x: 212, y: -40 })
    expect(request.chart.series[0].points).toHaveLength(32)
    expect(request.chart.series[0].originalPointCount).toBe(320)
    expect(request.chart.series[0].sampleCoverage).toBe(0.1)
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
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
        value: { provider: 'openrouter', model: 'test-model', hasApiKey: true },
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
    await waitFor(() =>
      expect(aiMocks.analyzeAnomalies).toHaveBeenCalledOnce(),
    )
    const requestId = aiMocks.analyzeAnomalies.mock.calls[0][0].requestId
    view.rerender(
      <GenericResultExplorer {...props({ resultRevision: 2 })} />,
    )
    await waitFor(() => expect(aiMocks.cancel).toHaveBeenCalledWith(requestId))
    resolveAnalysis?.(successfulAnalysis)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Analyze with AI' }),
      ).toBeEnabled(),
    )
    expect(screen.queryByText('A spike and drop are visible.')).toBeNull()
  })
})
