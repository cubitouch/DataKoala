import { useState } from 'react'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
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

const chartMock = vi.hoisted(() => ({
  brush: null as
    null | ((params: { areas: { coordRange: number[] }[] }) => void),
  option: null as null | { series: { data: unknown[] }[] },
}))
vi.mock('echarts-for-react', () => ({
  default: ({
    option,
    onEvents,
  }: {
    option: typeof chartMock.option
    onEvents: { brushEnd: NonNullable<typeof chartMock.brush> }
  }) => {
    chartMock.option = option
    chartMock.brush = onEvents.brushEnd
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

import {
  GenericResultExplorer,
  type GenericResultExplorerProps,
} from './GenericResultExplorer'
import { createResultFilter, type ResultFilter } from '@lib/resultFilters'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import type { QueryResult } from '@shared/types'

const result: QueryResult = {
  columns: [
    { name: 'category', dataTypeID: 0, dataTypeName: 'text' },
    { name: 'value', dataTypeID: 0, dataTypeName: 'integer' },
  ],
  rows: [{ category: 'A', value: 2 }],
  rowCount: 1,
  durationMs: 3,
}
const configuration: VisualizationConfiguration = {
  view: 'table',
  xColumn: 'category',
  valueColumn: 'value',
  aggregation: 'sum',
  seriesColumn: null,
  seriesColumns: [],
  valueAxisScale: 'linear',
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

beforeEach(() => {
  chartMock.option = null
  chartMock.brush = null
  aiMocks.getSettings.mockReset()
  aiMocks.analyzeAnomalies.mockReset()
  aiMocks.cancel.mockReset()
  aiMocks.getSettings.mockResolvedValue({
    ok: true,
    value: { provider: 'openrouter', model: '', hasApiKey: false },
  })
})
afterEach(cleanup)

describe('GenericResultExplorer controlled presentation', () => {
  it('shows the initial empty state without a session', () => {
    render(
      <GenericResultExplorer {...props({ hasRun: false, result: null })} />,
    )
    expect(screen.getByText('Run a query to view its results.')).toBeTruthy()
  })

  it('renders controlled errors and stale reconnect state', () => {
    const onReconnect = vi.fn()
    render(
      <GenericResultExplorer
        {...props({ error: 'query failed', isResultStale: true, onReconnect })}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain(
      'showing results from the last successful query',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnect).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain('query failed')
  })

  it('emits a complete next configuration when chart type changes', () => {
    const onConfigurationChange = vi.fn()
    render(<GenericResultExplorer {...props({ onConfigurationChange })} />)
    expect(screen.queryByRole('button', { name: 'Patterns' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Bar' }))
    expect(onConfigurationChange).toHaveBeenCalledWith({
      ...configuration,
      view: 'bar',
    })
  })

  it('wires table and chart promotion predicates independently', () => {
    const filter = createResultFilter('category', 'equals', 'A')
    const canPromoteTableFilter = vi.fn(() => true)
    const canPromoteChartFilter = vi.fn(() => false)
    const shared = {
      mode: 'builder' as const,
      activeFilters: [filter],
      onToggleFilterExecution: vi.fn(),
      canPromoteTableFilter,
      canPromoteChartFilter,
    }

    const table = render(<GenericResultExplorer {...props({ ...shared })} />)
    expect(screen.getByRole('button', { name: 'Apply to SQL' })).toBeTruthy()
    expect(canPromoteTableFilter).toHaveBeenCalledWith(filter)
    expect(canPromoteChartFilter).not.toHaveBeenCalled()
    table.unmount()

    render(
      <GenericResultExplorer
        {...props({
          ...shared,
          configuration: { ...configuration, view: 'bar' },
        })}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Apply to SQL' })).toBeNull()
    expect(canPromoteChartFilter).toHaveBeenCalledWith(filter)
  })

  it('hides AI chart analysis when OpenRouter is not configured', async () => {
    const anomalyResult: QueryResult = {
      columns: [
        { name: 'day', dataTypeID: 0, dataTypeName: 'integer' },
        { name: 'value', dataTypeID: 0, dataTypeName: 'integer' },
      ],
      rows: Array.from({ length: 8 }, (_, day) => ({
        day,
        value: day + 1,
      })),
      rowCount: 8,
      durationMs: 3,
    }
    render(
      <GenericResultExplorer
        {...props({
          result: anomalyResult,
          configuration: { ...configuration, view: 'line', xColumn: 'day' },
        })}
      />,
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Analyze with AI' }),
      ).toBeNull(),
    )
  })

  it('renders the controlled result in the table branch', () => {
    render(<GenericResultExplorer {...props()} />)
    expect(screen.getByText('category')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
  })
})
for (const mode of ['sql', 'builder'] as const) {
  it(`connects the HTML legend to shared visibility and Show all in ${mode} mode`, async () => {
    const groupedResult = {
      ...result,
      columns: [
        ...result.columns,
        { name: 'service', dataTypeID: 0, dataTypeName: 'text' },
      ],
      rows: [
        { category: 'A', value: 2, service: 'Alpha' },
        { category: 'A', value: 3, service: 'Beta' },
      ],
      rowCount: 2,
    }
    function Harness() {
      const [visibility, setVisibility] = useState<Record<string, boolean>>({})
      return (
        <GenericResultExplorer
          {...props({
            mode,
            result: groupedResult,
            configuration: {
              ...configuration,
              view: 'line',
              seriesColumn: 'service',
            },
            seriesVisibility: visibility,
            onSeriesVisibilityChange: setVisibility,
          })}
        />
      )
    }
    render(<Harness />)
    const alpha = await screen.findByRole('button', { name: 'Alpha' })
    fireEvent.click(alpha)
    expect(alpha.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(alpha.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Beta' }))
    expect(alpha.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Beta' }))
    expect(alpha.getAttribute('aria-pressed')).toBe('true')
  })
}

it('keeps SQL temporal selections local, cumulative, and removable', async () => {
  const temporal = {
    ...result,
    columns: [
      { name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp' },
      result.columns[1],
    ],
    rows: [0, 1, 2, 3].map((hour) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(),
      value: hour + 1,
    })),
    rowCount: 4,
  }
  const original = structuredClone(temporal)
  function Harness() {
    const [filters, setFilters] = useState<ResultFilter[]>([])
    return (
      <GenericResultExplorer
        {...props({
          result: temporal,
          configuration: {
            ...configuration,
            view: 'line',
            xColumn: 'timestamp',
          },
          activeFilters: filters,
          onAddFilter: (filter) =>
            setFilters((current) => [...current, filter]),
          onRemoveFilter: (id) =>
            setFilters((current) =>
              current.filter((filter) => filter.id !== id),
            ),
          onClearFilters: () => setFilters([]),
        })}
      />
    )
  }
  render(<Harness />)
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(4))
  const fullSeries = structuredClone(chartMock.option?.series)
  act(() => chartMock.brush?.({ areas: [{ coordRange: [1, 2] }] }))
  expect(screen.getByLabelText('Active result filters')).toBeTruthy()
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(2))
  act(() => chartMock.brush?.({ areas: [{ coordRange: [1, 1] }] }))
  expect(screen.getAllByRole('button', { name: /Remove filter/ })).toHaveLength(
    2,
  )
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(1))
  fireEvent.click(screen.getAllByRole('button', { name: /Remove filter/ })[1])
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(2))
  act(() => chartMock.brush?.({ areas: [{ coordRange: [0, 0] }] }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  await waitFor(() => expect(chartMock.option?.series).toEqual(fullSeries))
  expect(temporal).toEqual(original)
})
