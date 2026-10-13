import { useState, useImperativeHandle, type Ref } from 'react'
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

const queryMocks = vi.hoisted(() => ({ run: vi.fn(), runLoki: vi.fn() }))

type HoverEvent = {
  componentType?: string
  seriesName?: string
  data?: unknown
}

const chartMock = vi.hoisted(() => ({
  dispatchAction: vi.fn(),
  finished: null as null | (() => void),
  image: vi.fn(() => 'data:image/png;base64,VISIBLE'),
  save: vi.fn(),
  write: vi.fn(),
  globalout: null as null | (() => void),
  mouseover: null as null | ((event: HoverEvent) => void),
  mouseout: null as null | ((event: HoverEvent) => void),
  brush: null as
    null | ((params: { areas: { coordRange: number[] }[] }) => void),
  click: null as
    | null
    | ((params: {
        componentType?: string
        dataIndex?: number
        seriesIndex?: number
      }) => void),
  option: null as null | { series: { data: unknown[] }[] },
}))
vi.mock('echarts-for-react', () => ({
  default: function MockChart({
    option,
    onEvents,
    ref,
  }: {
    ref: Ref<unknown>
    option: typeof chartMock.option
    onEvents: {
      finished: () => void
      brushEnd: NonNullable<typeof chartMock.brush>
      click: NonNullable<typeof chartMock.click>
      mouseover: NonNullable<typeof chartMock.mouseover>
      mouseout: NonNullable<typeof chartMock.mouseout>
    }
  }) {
    useImperativeHandle(
      ref,
      () => ({
        getEchartsInstance: () => ({
          dispatchAction: chartMock.dispatchAction,
          getDataURL: chartMock.image,
          getDom: () => ({
            getBoundingClientRect: () => ({ left: 0, top: 0 }),
          }),
          getZr: () => ({
            on: (_event: string, handler: () => void) => {
              chartMock.globalout = handler
            },
            off: () => {
              chartMock.globalout = null
            },
          }),
        }),
      }),
      [],
    )
    chartMock.finished = onEvents.finished
    chartMock.mouseover = onEvents.mouseover
    chartMock.mouseout = onEvents.mouseout
    chartMock.option = option
    chartMock.brush = onEvents.brushEnd
    chartMock.click = onEvents.click
    return <div data-testid="chart" />
  },
}))
vi.mock('@lib/api', () => ({
  api: {
    query: queryMocks,
    clipboardImage: { writePng: chartMock.write },
    export: { saveBinary: chartMock.save },
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
import { ResultExplorer } from './ResultExplorer'
import { useStore } from '@store/useStore'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
} from '@test/sessionTestUtils'
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
  chartMock.click = null
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
    const onAddFilter = vi.fn()
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
            onAddFilter,
          })}
        />
      )
    }
    render(<Harness />)
    const alpha = await screen.findByRole('button', { name: 'Alpha' })
    fireEvent.click(alpha)
    expect(alpha.getAttribute('aria-pressed')).toBe('false')
    act(() =>
      chartMock.click?.({
        componentType: 'series',
        dataIndex: 0,
        seriesIndex: 0,
      }),
    )
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Filter to this series' }),
    )
    expect(onAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        column: 'service',
        operator: 'equals',
        value: 'Beta',
      }),
    )
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

for (const kind of ['sql', 'prometheus'] as const) {
  it(`keeps ${kind} brush filters tab-scoped and preserved on refresh without queries`, async () => {
    resetTestStore({
      profiles:
        kind === 'prometheus'
          ? [
              {
                id: 'metrics',
                name: 'Metrics',
                kind: 'prometheus',
                version: 1,
                readonly: true,
                transport: { kind: 'gcx', datasourceUid: 'metrics' },
              },
            ]
          : [],
    })
    const temporal: QueryResult = {
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
    patchActiveTestSession({
      connectionProfileId: kind === 'prometheus' ? 'metrics' : null,
      result: temporal,
      resultRevision: 1,
      sqlVisualization: {
        ...configuration,
        view: 'line',
        xColumn: 'timestamp',
      },
    })
    const a = activeTestSession().id
    render(<ResultExplorer mode="sql" />)
    await waitFor(() =>
      expect(chartMock.option?.series[0].data).toHaveLength(4),
    )
    act(() => chartMock.brush?.({ areas: [{ coordRange: [2, 1] }] }))
    expect(activeTestSession().sqlResultFilters[0]).toMatchObject({
      column: 'timestamp',
      operator: 'range',
      startInclusive: '2026-01-01T01:00:00.000Z',
      endExclusive: '2026-01-01T03:00:00.000Z',
    })
    await waitFor(() =>
      expect(chartMock.option?.series[0].data).toHaveLength(2),
    )
    const filters = activeTestSession().sqlResultFilters
    act(() =>
      useStore.getState().setResult({ ...temporal, durationMs: 5 }, null, a),
    )
    expect(activeTestSession().sqlResultFilters).toEqual(filters)
    act(() => chartMock.brush?.({ areas: [{ coordRange: [1, 1] }] }))
    await waitFor(() =>
      expect(chartMock.option?.series[0].data).toHaveLength(1),
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Remove filter/ })[1])
    await waitFor(() =>
      expect(chartMock.option?.series[0].data).toHaveLength(2),
    )
    act(() => chartMock.brush?.({ areas: [{ coordRange: [0, 0] }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() =>
      expect(chartMock.option?.series[0].data).toHaveLength(4),
    )
    const retainedBrush = chartMock.brush
    act(() => useStore.getState().createTab())
    const b = activeTestSession().id
    act(() => retainedBrush?.({ areas: [{ coordRange: [0, 1] }] }))
    expect(activeTestSession().id).toBe(b)
    expect(activeTestSession().sqlResultFilters).toEqual([])
    expect(
      useStore.getState().tabs.find((tab) => tab.id === a)?.sqlResultFilters,
    ).toHaveLength(1)
    expect(queryMocks.run).not.toHaveBeenCalled()
    expect(queryMocks.runLoki).not.toHaveBeenCalled()
    cleanup()
    resetTestStore()
  })
}

it('translates click menus into local point filters and clears them', async () => {
  resetTestStore()
  patchActiveTestSession({
    result,
    resultRevision: 1,
    sqlVisualization: { ...configuration, view: 'bar' },
  })
  render(<ResultExplorer mode="sql" />)
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(1))
  act(() =>
    chartMock.click?.({
      componentType: 'series',
      dataIndex: 0,
      seriesIndex: 0,
    }),
  )
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Filter to this category value' }),
  )
  expect(activeTestSession().sqlResultFilters[0]).toMatchObject({
    column: 'category',
    operator: 'equals',
    value: 'A',
  })
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))
  expect(activeTestSession().sqlResultFilters).toEqual([])
  expect(queryMocks.run).not.toHaveBeenCalled()
  expect(queryMocks.runLoki).not.toHaveBeenCalled()
  cleanup()
  resetTestStore()
})

it('dismisses point context on result, chart and tab changes and keeps retained clicks bound to A', async () => {
  resetTestStore()
  patchActiveTestSession({
    result,
    resultRevision: 1,
    sqlVisualization: { ...configuration, view: 'bar' },
  })
  const a = activeTestSession().id
  render(<ResultExplorer mode="sql" />)
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(1))
  const click = () =>
    act(() =>
      chartMock.click?.({
        componentType: 'series',
        dataIndex: 0,
        seriesIndex: 0,
      }),
    )
  click()
  expect(screen.getByRole('menu')).toBeTruthy()
  act(() =>
    useStore.getState().setResult({ ...result, durationMs: 4 }, null, a),
  )
  expect(screen.queryByRole('menu')).toBeNull()
  click()
  fireEvent.click(screen.getByRole('button', { name: 'Line' }))
  expect(screen.queryByRole('menu')).toBeNull()
  click()
  const retainedClick = chartMock.click
  act(() => {
    useStore.getState().createTab()
    patchActiveTestSession({
      result,
      resultRevision: 1,
      sqlVisualization: { ...configuration, view: 'bar' },
    })
  })
  expect(screen.queryByRole('menu')).toBeNull()
  act(() =>
    retainedClick?.({ componentType: 'series', dataIndex: 0, seriesIndex: 0 }),
  )
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Filter to this category value' }),
  )
  expect(activeTestSession().sqlResultFilters).toEqual([])
  expect(
    useStore.getState().tabs.find((tab) => tab.id === a)?.sqlResultFilters[0],
  ).toMatchObject({ column: 'category', value: 'A' })
  expect(queryMocks.run).not.toHaveBeenCalled()
  cleanup()
  resetTestStore()
})

it('reactivates the brush cursor for repeated valid selections', async () => {
  const temporal = {
    ...result,
    columns: [
      { name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp' },
      result.columns[1],
    ],
    rows: [0, 1, 2].map((hour) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(),
      value: hour,
    })),
    rowCount: 3,
  }
  const onAddFilter = vi.fn()
  render(
    <GenericResultExplorer
      {...props({
        result: temporal,
        configuration: { ...configuration, view: 'line', xColumn: 'timestamp' },
        onAddFilter,
      })}
    />,
  )
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(3))
  chartMock.dispatchAction.mockClear()
  act(() => chartMock.brush?.({ areas: [{ coordRange: [0, 1] }] }))
  act(() => chartMock.brush?.({ areas: [{ coordRange: [2, 1] }] }))
  expect(onAddFilter).toHaveBeenCalledTimes(2)
  expect(chartMock.dispatchAction.mock.calls.map(([action]) => action)).toEqual(
    [
      { type: 'brush', areas: [] },
      {
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: 'lineX', brushMode: 'single' },
      },
      { type: 'brush', areas: [] },
      {
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: 'lineX', brushMode: 'single' },
      },
    ],
  )
})

it('uses hovered source identity in tooltip highlights and clears only matching mouse-out', async () => {
  render(
    <GenericResultExplorer
      {...props({ configuration: { ...configuration, view: 'line' } })}
    />,
  )
  await waitFor(() => expect(chartMock.option?.series[0].data).toHaveLength(1))
  const formatter = (
    chartMock.option as unknown as {
      tooltip: { formatter: (rows: unknown[]) => string }
    }
  ).tooltip.formatter
  const rows = [
    { seriesName: 'value', value: 2, color: '#fff', axisValue: 'A' },
  ]
  act(() =>
    chartMock.mouseover?.({ componentType: 'series', seriesName: 'value' }),
  )
  expect(formatter(rows)).toContain('chart-tooltip-row-hovered')
  act(() =>
    chartMock.mouseout?.({ componentType: 'series', seriesName: 'other' }),
  )
  expect(formatter(rows)).toContain('chart-tooltip-row-hovered')
  act(() =>
    chartMock.mouseout?.({ componentType: 'series', seriesName: 'value' }),
  )
  expect(formatter(rows)).not.toContain('chart-tooltip-row-hovered')
  act(() =>
    chartMock.mouseover?.({
      componentType: 'series',
      data: { aiAnomalyOverlay: true, sourceSeriesName: 'value' },
    }),
  )
  expect(formatter(rows)).toContain('chart-tooltip-row-hovered')
  act(() => chartMock.globalout?.())
  expect(formatter(rows)).not.toContain('chart-tooltip-row-hovered')
})

it('exports the finished visible chart and applies view changes to the owning tab without queries', async () => {
  resetTestStore()
  const a = useStore.getState().activeTabId
  patchActiveTestSession({
    result,
    resultRevision: 1,
    sqlVisualization: { ...configuration, view: 'line' },
  })
  chartMock.save.mockResolvedValue('/chart.png')
  const { container } = render(<ResultExplorer mode="sql" />)
  await waitFor(() => expect(chartMock.option).not.toBeNull())
  act(() => chartMock.finished?.())
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Export PNG' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Export PNG' }))
  await waitFor(() =>
    expect(chartMock.save).toHaveBeenCalledWith({
      defaultName: 'datakoala_chart.png',
      base64: 'VISIBLE',
      extensions: ['png'],
    }),
  )
  for (const view of ['Area', 'Bar', 'Scatter', 'Line']) {
    fireEvent.click(screen.getByRole('button', { name: view }))
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-visual-type]')
          ?.getAttribute('data-visual-type'),
      ).toBe(view.toLowerCase()),
    )
    expect(
      useStore.getState().tabs.find((tab) => tab.id === a)?.sqlVisualization
        .view,
    ).toBe(view.toLowerCase())
  }
  act(() => {
    useStore.getState().createTab()
    patchActiveTestSession({ result, resultRevision: 1 })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Bar' }))
  expect(activeTestSession().sqlVisualization.view).toBe('bar')
  expect(
    useStore.getState().tabs.find((tab) => tab.id === a)?.sqlVisualization.view,
  ).toBe('line')
  expect(queryMocks.run).not.toHaveBeenCalled()
  expect(queryMocks.runLoki).not.toHaveBeenCalled()
})
