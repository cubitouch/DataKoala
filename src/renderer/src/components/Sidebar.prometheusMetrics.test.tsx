import React from 'react'
void React
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrometheusProfile } from '@shared/types'
import { normalizeDatabaseObjects } from '../lib/databaseObjects'
import { resetTestStore } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

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
  it('shows type on the metric row and keeps help in an accessible tooltip', async () => {
    render(<Sidebar />)
    expect(await screen.findByText('Metrics')).toBeTruthy()
    const metric = await screen.findByRole('button', { name: 'View details for http_requests_total' })
    const row = metric.closest<HTMLElement>('.relation-row')!
    expect(within(row).getByText('counter')).toBeTruthy()
    expect(within(row).queryByText('metric')).toBeNull()
    const tooltip = screen.getByRole('tooltip', { name: 'Total HTTP requests.' })
    expect(metric.getAttribute('aria-describedby')).toBe(tooltip.id)
    fireEvent.click(metric)

    expect(screen.getByText('requests')).toBeTruthy()
    const details = document.querySelector<HTMLElement>('.metric-details')!
    expect(within(details).queryByText('Name')).toBeNull()
    expect(within(details).queryByText('Type')).toBeNull()
    expect(within(details).queryByText('Help')).toBeNull()
    expect(within(details).getByText('Labels')).toBeTruthy()
    expect(mocks.describeTable).not.toHaveBeenCalled()
    expect(mocks.labelsForMetric).toHaveBeenCalledWith('prom-1', 'http_requests_total')
    expect(mocks.labelValues).not.toHaveBeenCalled()
  })

  it('renders no generic fallback or empty tooltip when metric metadata is absent', async () => {
    render(<Sidebar />)
    const missing = await screen.findByRole('button', { name: 'View details for metric_without_metadata' })
    expect(within(missing.closest<HTMLElement>('.relation-row')!).queryByText('metric')).toBeNull()
    expect(missing.hasAttribute('aria-describedby')).toBe(false)
    const withoutHelp = screen.getByRole('button', { name: 'View details for gauge_without_help' })
    expect(within(withoutHelp.closest<HTMLElement>('.relation-row')!).getByText('gauge')).toBeTruthy()
    expect(withoutHelp.hasAttribute('aria-describedby')).toBe(false)
    expect(screen.getAllByRole('tooltip')).toHaveLength(2)
    expect(mocks.labelsForMetric).not.toHaveBeenCalled()
  })

  it('leaves SQL relation type rendering unchanged', async () => {
    const sqlObjects = normalizeDatabaseObjects([{ schema: 'public', name: 'orders', kind: 'r' }])
    useStore.setState({ metadataByProfileId: { [profile.id]: { schemas: sqlObjects, status: 'loaded', error: null, isStale: false } } })
    render(<Sidebar />)
    const relation = await screen.findByRole('button', { name: 'Select public.orders for Builder' })
    expect(within(relation.closest<HTMLElement>('.relation-row')!).getByText('table')).toBeTruthy()
    expect(relation.getAttribute('title')).toBe('public.orders')
  })

  it('discovers label values only when a label is expanded', async () => {
    render(<Sidebar />)
    fireEvent.click(await screen.findByRole('button', { name: 'View details for http_requests_total' }))
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
    const filter = await screen.findByLabelText('Filter database objects')
    fireEvent.change(filter, { target: { value: 'process_cpu' } })
    expect(screen.getByRole('button', { name: 'View details for process_cpu_seconds_total' })).toBeTruthy()
    expect(screen.queryByText('http_requests_total')).toBeNull()
    expect(mocks.labelsForMetric).not.toHaveBeenCalled()
  })
})
