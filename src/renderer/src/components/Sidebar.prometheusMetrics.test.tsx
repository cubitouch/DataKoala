import React from 'react'
void React
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrometheusProfile } from '@shared/types'
import { normalizeDatabaseObjects } from '../lib/databaseObjects'
import { resetTestStore } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

const mocks = vi.hoisted(() => ({ list: vi.fn(), describeTable: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: {
  list: mocks.list, describeTable: mocks.describeTable, listObjects: vi.fn(),
  connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn()
} } }))

import { Sidebar } from './Sidebar'

const profile: PrometheusProfile = { id: 'prom-1', name: 'Cloud metrics', version: 1, kind: 'prometheus', readonly: true, transport: { kind: 'gcx' } }
const objects = normalizeDatabaseObjects([
  { schema: 'Metrics', name: 'process_cpu_seconds_total', kind: 'metric', details: { kind: 'metric', type: 'counter', help: 'Total user and system CPU time spent in seconds.', unit: 'seconds' } },
  { schema: 'Metrics', name: 'http_requests_total', kind: 'metric', details: { kind: 'metric', type: 'counter', help: 'Total HTTP requests.', unit: 'requests' } }
])

beforeEach(() => {
  mocks.list.mockResolvedValue([profile])
  mocks.describeTable.mockReset()
  resetTestStore({
    profiles: [profile], activeProfileId: profile.id, connected: true, connectionStatus: 'connected',
    metadataByProfileId: { [profile.id]: { schemas: objects, status: 'loaded', error: null, isStale: false } }
  })
  const state = useStore.getState()
  useStore.setState({ tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: profile.id })) })
})
afterEach(() => { cleanup(); resetTestStore() })

describe('Prometheus metric object tree', () => {
  it('shows a Metrics namespace and expands normalized metric details without loading SQL columns', async () => {
    render(<Sidebar />)
    expect(await screen.findByText('Metrics')).toBeTruthy()
    const metric = await screen.findByRole('button', { name: 'View details for http_requests_total' })
    fireEvent.click(metric)

    expect(screen.getByText('Total HTTP requests.')).toBeTruthy()
    expect(screen.getByText('requests')).toBeTruthy()
    expect(screen.getAllByText('counter').length).toBeGreaterThan(0)
    expect(mocks.describeTable).not.toHaveBeenCalled()
  })

  it('uses existing filtering to find metrics by name', async () => {
    render(<Sidebar />)
    const filter = await screen.findByLabelText('Filter database objects')
    fireEvent.change(filter, { target: { value: 'process_cpu' } })
    expect(screen.getByText('process_cpu_seconds_total')).toBeTruthy()
    expect(screen.queryByText('http_requests_total')).toBeNull()
  })
})
