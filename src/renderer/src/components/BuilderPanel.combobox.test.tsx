// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <pre>{value}</pre> }))

const { seriesStatistics, probeSeriesCardinality } = vi.hoisted(() => ({
  seriesStatistics: vi.fn(async () => ({ available: true, estimatedDistinct: 2, source: 'pg_stats' as const })),
  probeSeriesCardinality: vi.fn(async () => ({ exceedsHardLimit: false }))
}))
vi.mock('../lib/api', () => ({
  api: {
    query: { seriesStatistics, probeSeriesCardinality },
    connections: { describeTable: vi.fn() }
  }
}))
import { BuilderPanel } from './BuilderPanel'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'
import type { DatabaseSchemaNode } from '@shared/types'
import { useStore } from '../store/useStore'

const schemas: DatabaseSchemaNode[] = [
  { name: 'demo_shop', isSystem: false, relations: [
    { schema: 'demo_shop', name: 'orders', kind: 'r', qualifiedName: 'demo_shop.orders', columnsStatus: 'loaded', columns: [
      { name: 'created_at', dataTypeName: 'timestamp with time zone' },
      { name: 'customer_id', dataTypeName: 'text' },
      { name: 'region', dataTypeName: 'text' },
      { name: 'status', dataTypeName: 'text' },
      { name: 'revenue', dataTypeName: 'numeric' },
      { name: 'created_day', dataTypeName: 'date' }
    ] }
  ] },
  { name: 'analytics', isSystem: false, relations: [
    { schema: 'analytics', name: 'monthly_sales', kind: 'v', qualifiedName: 'analytics.monthly_sales', columnsStatus: 'loaded', columns: [
      { name: 'created_at', dataTypeName: 'timestamp with time zone' },
      { name: 'market', dataTypeName: 'text' },
      { name: 'revenue', dataTypeName: 'numeric' }
    ] }
  ] }
]

afterEach(() => {
  cleanup()
  resetTestStore()
  seriesStatistics.mockReset()
  seriesStatistics.mockImplementation(async () => ({ available: true, estimatedDistinct: 2, source: 'pg_stats' as const }))
  probeSeriesCardinality.mockReset()
  probeSeriesCardinality.mockImplementation(async () => ({ exceedsHardLimit: false }))
})

const arrange = () => {
  resetTestStore({ connected: true, activeProfileId: 'p1', connectionStatus: 'connected' })
  setActiveTestMetadata(schemas, 'loaded', null, 'p1')
  patchActiveTestSession({
    connectionProfileId: 'p1',
    builder: { table: null, timeColumn: null, timeBucket: 'day', seriesColumns: [], timeRange: undefined },
    builderVisualization: { ...activeTestSession().builderVisualization, xColumn: null, valueColumn: null, aggregation: 'count', seriesColumn: null, seriesColumns: [] }
  })
  return render(<BuilderPanel />)
}

const chooseOrders = () => {
  fireEvent.click(screen.getByRole('combobox', { name: /Schema/ }))
  fireEvent.click(screen.getByRole('option', { name: /demo_shop/ }))
  fireEvent.click(screen.getByRole('combobox', { name: /Table or view/ }))
  fireEvent.click(screen.getByRole('option', { name: /orders/ }))
}

const chooseXAxis = (name: RegExp) => {
  fireEvent.click(screen.getByRole('combobox', { name: /X axis/ }))
  fireEvent.click(screen.getByRole('option', { name }))
}

const comboboxLabels = (container: Element) => Array.from(container.querySelectorAll('[role="combobox"]'))
  .map((control) => control.getAttribute('aria-label')?.split(':')[0])

describe('BuilderPanel axis-first controls', () => {
  it('groups dimensions before their aligned transformations', () => {
    const view = arrange()
    chooseOrders()
    chooseXAxis(/created_at/)
    const dimensions = view.container.querySelector('[data-builder-control-row="dimensions"]')!
    const transformations = view.container.querySelector('[data-builder-control-row="transformations"]')!
    expect(comboboxLabels(dimensions)).toEqual(['X axis', 'Y axis', 'Series'])
    expect(comboboxLabels(transformations)).toEqual(['Time bucket', 'Aggregation'])
  })

  it('omits only Time bucket for a categorical X and retains Count without Y', () => {
    const view = arrange()
    chooseOrders()
    chooseXAxis(/region, text/)
    const transformations = view.container.querySelector('[data-builder-control-row="transformations"]')!
    expect(screen.queryByRole('combobox', { name: /Time bucket/ })).toBeNull()
    expect(comboboxLabels(transformations)).toEqual(['Aggregation'])
    expect(screen.getByRole('combobox', { name: /Y axis: Count rows \(no Y axis\)/ })).toBeTruthy()
    expect(activeTestSession().builderVisualization.aggregation).toBe('count')
  })

  it('updates schema selection and invalidates the selected relation', () => {
    arrange()
    fireEvent.click(screen.getByRole('combobox', { name: /Schema: Select a schema/ }))
    fireEvent.click(screen.getByRole('option', { name: /demo_shop, schema/ }))
    expect(activeTestSession().builder.table).toBeNull()
    expect(screen.getByRole('combobox', { name: /Schema: demo_shop/ })).toBeTruthy()
  })

  it('updates table/view selection and renders two-line metadata subtitles', () => {
    arrange()
    fireEvent.click(screen.getByRole('combobox', { name: /Schema/ }))
    fireEvent.click(screen.getByRole('option', { name: /demo_shop/ }))
    fireEvent.click(screen.getByRole('combobox', { name: /Table or view/ }))
    const option = screen.getByRole('option', { name: /orders, table · demo_shop/ })
    expect(option.querySelector('[data-combobox-option-label]')?.textContent).toBe('orders')
    expect(option.querySelector('[data-combobox-option-subtitle]')?.textContent).toBe('table · demo_shop')
    fireEvent.click(option)
    expect(activeTestSession().builder.table).toMatchObject({ schema: 'demo_shop', name: 'orders' })
  })

  it('uses a searchable X axis combobox for temporal and non-temporal columns and removes X from Series', () => {
    const view = arrange()
    expect(view.container.querySelector('select[aria-label="X axis"]')).toBeNull()
    chooseOrders()
    patchActiveTestSession({ builder: { ...activeTestSession().builder, seriesColumns: ['created_at', 'customer_id'] } })
    fireEvent.click(screen.getByRole('combobox', { name: /X axis/ }))
    const timestamp = screen.getByRole('option', { name: /created_at, timestamp with time zone/ })
    expect(timestamp.querySelector('[data-combobox-option-subtitle]')?.textContent).toBe('timestamp with time zone')
    expect(screen.getByRole('option', { name: /status, text/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /Search X axis/ }), { target: { value: 'AT' } })
    expect(screen.getByRole('option', { name: /created_day, date/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /Search X axis/ }), { target: { value: 'created' } })
    fireEvent.click(timestamp)
    expect(activeTestSession().builder.timeColumn).toBe('created_at')
    expect(activeTestSession().builderVisualization.xColumn).toBe('created_at')
    expect(activeTestSession().builder.seriesColumns).toEqual(['customer_id'])
  })

  it('lets Time column drive Time range independently from X while keeping the temporal-X fast path', () => {
    arrange()
    chooseOrders()
    expect(screen.queryByRole('combobox', { name: /Time bucket/ })).toBeNull()
    expect(activeTestSession().builder.timeColumn).toBeNull()
    expect(screen.getByText('Select a time column')).toBeTruthy()

    const timeColumn = screen.getByRole('combobox', { name: /Time column: Select a time column/ })
    fireEvent.click(timeColumn)
    expect(screen.getByRole('option', { name: /created_at, timestamp with time zone/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /created_day, date/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /created_day, date/ }))
    expect(activeTestSession().builder.timeColumn).toBe('created_day')
    expect(activeTestSession().builder.timeRange).toBeTruthy()

    chooseXAxis(/status, text/)
    expect(screen.queryByRole('combobox', { name: /Time bucket/ })).toBeNull()
    expect(activeTestSession().builder.timeColumn).toBe('created_day')
    expect(activeTestSession().builder.timeRange).toBeTruthy()

    chooseXAxis(/created_at/)
    expect(screen.getByRole('combobox', { name: /Time bucket: Day/ })).toBeTruthy()
    expect(activeTestSession().builder.timeColumn).toBe('created_day')
  })

  it('uses the temporal X as the time filter when no explicit Time column has been chosen', () => {
    arrange()
    chooseOrders()
    expect(activeTestSession().builder.timeColumn).toBeNull()
    chooseXAxis(/created_at/)
    expect(activeTestSession().builder.timeColumn).toBe('created_at')
    expect(activeTestSession().builder.timeRange).toBeTruthy()
  })

  it('exposes Y axis and Aggregation and enforces compatible selections', () => {
    arrange()
    chooseOrders()
    chooseXAxis(/region, text/)

    fireEvent.click(screen.getByRole('combobox', { name: /Y axis/ }))
    expect(screen.queryByRole('option', { name: /region, text/ })).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: /revenue, numeric/ }))
    expect(activeTestSession().builderVisualization.valueColumn).toBe('revenue')
    expect(activeTestSession().builderVisualization.aggregation).toBe('sum')

    fireEvent.click(screen.getByRole('combobox', { name: /Aggregation/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Average' }))
    expect(activeTestSession().builderVisualization.aggregation).toBe('average')

    fireEvent.click(screen.getByRole('combobox', { name: /Aggregation/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Count' }))
    expect(activeTestSession().builderVisualization.valueColumn).toBeNull()
    expect(activeTestSession().builderVisualization.aggregation).toBe('count')
  })

  it('uses a time bucket combobox after selecting a temporal X', async () => {
    const view = arrange()
    expect(view.container.querySelector('select[aria-label="Time bucket"]')).toBeNull()
    chooseOrders()
    chooseXAxis(/created_at/)
    fireEvent.click(screen.getByRole('combobox', { name: /Time bucket: Day/ }))
    expect(screen.getByRole('option', { name: /^Minute,/ })).toBeTruthy()
    for (const bucket of ['Hour', 'Day', 'Week', 'Month', 'Quarter', 'Year']) expect(screen.getByRole('option', { name: bucket })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: 'Hour' }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(activeTestSession().builder.timeBucket).toBe('hour')
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: /Time bucket: Hour/ }))
  })

  it('resets an incompatible BigQuery minute/hour bucket when X changes to DATE', () => {
    arrange()
    useStore.setState({ profiles: [{ kind: 'bigquery', version: 1, id: 'p1', name: 'BQ', billingProject: 'billing', maximumBytesBilled: '1073741824', readonly: true }] })
    chooseOrders()
    chooseXAxis(/created_at/)
    fireEvent.click(screen.getByRole('combobox', { name: /Time bucket: Day/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Hour' }))
    expect(activeTestSession().builder.timeBucket).toBe('hour')
    chooseXAxis(/created_day/)
    expect(activeTestSession().builder.timeBucket).toBe('day')
    expect(screen.getByText(/BigQuery DATE does not support minute or hour buckets/)).toBeTruthy()
  })

  it('keeps Series multi-select ordered, removable and mutually exclusive with X and Y', async () => {
    const view = arrange()
    expect(view.container.querySelector('.multi-select')).toBeNull()
    chooseOrders()
    chooseXAxis(/created_at/)
    const openSeries = async () => {
      const control = screen.getByRole('combobox', { name: /Series/ })
      if (control.getAttribute('aria-expanded') !== 'true') fireEvent.click(control)
      await screen.findByRole('listbox', { name: 'Series' })
    }
    await openSeries()
    expect(screen.queryByRole('option', { name: /created_at/ })).toBeNull()
    const region = screen.getByRole('option', { name: /region, text/ })
    expect(region.querySelector('[data-combobox-option-subtitle]')?.textContent).toBe('text')
    fireEvent.click(region)
    await waitFor(() => {
      expect(activeTestSession().builder.seriesColumns).toEqual(['region'])
      expect((screen.getByRole('combobox', { name: /Series/ }) as HTMLButtonElement).disabled).toBe(false)
    })
    await openSeries()
    fireEvent.click(await screen.findByRole('option', { name: /customer_id, text/ }))
    await waitFor(() => {
      expect(activeTestSession().builder.seriesColumns).toEqual(['region', 'customer_id'])
      expect((screen.getByRole('combobox', { name: /Series/ }) as HTMLButtonElement).disabled).toBe(false)
    })
    expect(Array.from(view.container.querySelectorAll('[data-combobox-chip]')).map((chip) => chip.textContent?.replace('×', ''))).toEqual(['region', 'customer_id'])
    await openSeries()
    fireEvent.click(await screen.findByRole('option', { name: /region, text/ }))
    await waitFor(() => expect(activeTestSession().builder.seriesColumns).toEqual(['customer_id']))
  })

  it('clears Series through the existing transition path', () => {
    arrange()
    chooseOrders()
    chooseXAxis(/created_at/)
    act(() => patchActiveTestSession({ builder: { ...activeTestSession().builder, seriesColumns: ['region'] } }))
    fireEvent.click(screen.getByRole('combobox', { name: /Series/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(activeTestSession().builder.seriesColumns).toEqual([])
  })

  it('closes invalidated X axis and Series menus when changing table', async () => {
    arrange()
    chooseOrders()
    fireEvent.click(screen.getByRole('combobox', { name: /X axis/ }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    act(() => patchActiveTestSession({ builder: { ...activeTestSession().builder, table: { schema: 'analytics', name: 'monthly_sales' } } }))
    await new Promise((resolve) => setTimeout(resolve))
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: /Series/ }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    act(() => patchActiveTestSession({ builder: { ...activeTestSession().builder, table: { schema: 'demo_shop', name: 'orders' } } }))
    await new Promise((resolve) => setTimeout(resolve))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('disables Series while cardinality checking is in progress', async () => {
    seriesStatistics.mockImplementationOnce(() => new Promise(() => undefined))
    arrange()
    chooseOrders()
    chooseXAxis(/created_at/)
    fireEvent.click(screen.getByRole('combobox', { name: /Series/ }))
    fireEvent.click(screen.getByRole('option', { name: /customer_id/ }))
    await act(async () => { await Promise.resolve() })
    expect((screen.getByRole('combobox', { name: /Series/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('searches relations by schema, name, and object type without resetting relation state', () => {
    arrange()
    fireEvent.click(screen.getByRole('combobox', { name: /Schema/ }))
    fireEvent.click(screen.getByRole('option', { name: /analytics/ }))
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Table or view/ }), { key: 'v' })
    expect(screen.getByRole('option', { name: /monthly_sales, view · analytics/ })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /Search Table or view/ }), { target: { value: 'analytics' } })
    expect(screen.getByRole('option', { name: /monthly_sales/ })).toBeTruthy()
    expect(activeTestSession().builder.table).toBeNull()
  })
})