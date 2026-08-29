import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrometheusProfile } from '@shared/types'
import { normalizeDatabaseObjects } from '../lib/databaseObjects'
import { resetTestStore } from '../test/sessionTestUtils'
import { selectActiveSession, useStore } from '../store/useStore'

const mocks = vi.hoisted(() => ({ list: vi.fn(), describeTable: vi.fn(), labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: {
  list: mocks.list, describeTable: mocks.describeTable, listObjects: vi.fn(),
  connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn(), prometheus: { labelsForMetric: mocks.labelsForMetric, labelValues: mocks.labelValues }
} } }))

import { Sidebar } from './Sidebar'

const profile: PrometheusProfile = { id: 'prom-1', name: 'Cloud metrics', version: 1, kind: 'prometheus', readonly: true, transport: { kind: 'gcx' } }
const objects = normalizeDatabaseObjects([
  { schema: 'Metrics', name: 'process_cpu_seconds_total', kind: 'metric', details: { kind: 'metric', type: 'counter', help: 'Total user and system CPU time spent in seconds.', unit: 'seconds' } },
  { schema: 'Metrics', name: 'http_requests_total', kind: 'metric', details: { kind: 'metric', type: 'counter', help: 'Total HTTP requests.', unit: 'requests' } },
  { schema: 'Metrics', name: 'metric_without_metadata', kind: 'metric', details: { kind: 'metric' } },
  { schema: 'Metrics', name: 'gauge_without_help', kind: 'metric', details: { kind: 'metric', type: 'gauge' } }
])

beforeEach(() => {
  mocks.list.mockResolvedValue([profile])
  mocks.describeTable.mockReset()
  mocks.labelsForMetric.mockReset().mockResolvedValue(['method', 'service', 'status'])
  mocks.labelValues.mockReset().mockResolvedValue(['success', 'failure'])
  resetTestStore({
    profiles: [profile], activeProfileId: profile.id, connected: true, connectionStatus: 'connected',
    metadataByProfileId: { [profile.id]: { schemas: objects, status: 'loaded', error: null, isStale: false } }
  })
  const state = useStore.getState()
  useStore.setState({ tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: profile.id })) })
})
afterEach(() => { cleanup(); resetTestStore() })

describe('Prometheus metric object tree', () => {
  it('selects a metric for Builder without taking over metadata expansion', async () => {
    render(<Sidebar />)
    expect(await screen.findByText('Metrics')).toBeTruthy()
    const metric = await screen.findByRole('button', { name: 'Select http_requests_total for Builder' })
    const row = metric.closest<HTMLElement>('[role=treeitem]')!
    expect(within(row).getByText('counter')).toBeTruthy()
    expect(within(row).queryByText('metric')).toBeNull()
    const tooltip = screen.getByRole('tooltip', { name: 'Total HTTP requests.' })
    expect(metric.getAttribute('aria-describedby')).toBe(tooltip.id)

    fireEvent.click(metric)

    const session = selectActiveSession(useStore.getState())
    expect(session.promqlBuilder.metric).toBe('http_requests_total')
    expect(session.sql).toBe('http_requests_total')
    expect(metric.getAttribute('aria-current')).toBe('true')
    expect(mocks.labelsForMetric).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Expand http_requests_total' }))
    expect(screen.getByText('requests')).toBeTruthy()
    const details = screen.getByRole('group', { name: 'http_requests_total metric metadata' })
    expect(within(details).queryByText('Name')).toBeNull()
    expect(within(details).queryByText('Type')).toBeNull()
    expect(within(details).queryByText('Help')).toBeNull()
    expect(within(details).getByText('Labels')).toBeTruthy()
    expect(mocks.describeTable).not.toHaveBeenCalled()
    expect(mocks.labelsForMetric).toHaveBeenCalledWith('prom-1', 'http_requests_total')
    expect(mocks.labelValues).not.toHaveBeenCalled()
  })

  it('uses the same metric-selection reset behavior as the PromQL Builder picker', async () => {
    useStore.getState().setPromqlBuilder({
      metric: 'process_cpu_seconds_total',
      calculation: 'rate',
      aggregation: 'sum',
      filterBy: ['service'],
      groupBy: ['status'],
      labelValues: { service: ['api'], status: ['500'] }
    })
    render(<Sidebar />)

    fireEvent.click(await screen.findByRole('button', { name: 'Select http_requests_total for Builder' }))

    const session = selectActiveSession(useStore.getState())
    expect(session.promqlBuilder).toMatchObject({
      metric: 'http_requests_total',
      calculation: 'rate',
      aggregation: 'sum',
      histogramKindOverride: 'auto',
      filterBy: [],
      groupBy: [],
      labelValues: {}
    })
    expect(session.sql).toBe('sum(rate(http_requests_total[5m]))')
  })

  it('renders no generic fallback or empty tooltip when metric metadata is absent', async () => {
    render(<Sidebar />)
    const missing = await screen.findByRole('button', { name: 'Select metric_without_metadata for Builder' })
    expect(within(missing.closest<HTMLElement>('[role=treeitem]')!).queryByText('metric')).toBeNull()
    expect(missing.hasAttribute('aria-describedby')).toBe(false)
    const withoutHelp = screen.getByRole('button', { name: 'Select gauge_without_help for Builder' })
    expect(within(withoutHelp.closest<HTMLElement>('[role=treeitem]')!).getByText('gauge')).toBeTruthy()
    expect(withoutHelp.hasAttribute('aria-describedby')).toBe(false)
    expect(screen.getAllByRole('tooltip')).toHaveLength(2)
    expect(mocks.labelsForMetric).not.toHaveBeenCalled()
  })

  it('leaves SQL relation type rendering unchanged', async () => {
    const sqlObjects = normalizeDatabaseObjects([{ schema: 'public', name: 'orders', kind: 'r' }])
    useStore.setState({ metadataByProfileId: { [profile.id]: { schemas: sqlObjects, status: 'loaded', error: null, isStale: false } } })
    render(<Sidebar />)
    const relation = await screen.findByRole('button', { name: 'Select public.orders for Builder' })
    expect(within(relation.closest<HTMLElement>('[role=treeitem]')!).getByText('table')).toBeTruthy()
    expect(relation.getAttribute('title')).toBe('public.orders')
  })

  it('discovers label values only when a label is expanded', async () => {
    render(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: 'Expand http_requests_total' }))
    const status = (await screen.findByText('status')).closest('button')!
    expect(mocks.labelValues).not.toHaveBeenCalled()
    fireEvent.click(status)
    const children = await screen.findByRole('group', { name: 'status values' })
    expect(within(children).getAllByRole('treeitem').map((item) => item.textContent)).toEqual(['success', 'failure'])
    expect(status.parentElement?.contains(children)).toBe(true)
    expect(mocks.labelValues).toHaveBeenCalledTimes(1)
    expect(mocks.labelValues).toHaveBeenCalledWith('prom-1', 'http_requests_total', 'status')
  })

  it('uses existing filtering to find metrics by name', async () => {
    render(<Sidebar />)
    const filter = await screen.findByLabelText('Filter metrics')
    expect(filter.closest('[data-field]')?.getAttribute('data-label-visibility')).toBe('sr-only')
    fireEvent.change(filter, { target: { value: 'process_cpu' } })
    expect(screen.getByRole('button', { name: 'Select process_cpu_seconds_total for Builder' })).toBeTruthy()
    expect(screen.queryByText('http_requests_total')).toBeNull()
    expect(mocks.labelsForMetric).not.toHaveBeenCalled()
  })
})
