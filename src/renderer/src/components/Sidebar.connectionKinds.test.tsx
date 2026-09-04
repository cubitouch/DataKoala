import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'

const profiles: DataSourceProfile[] = [
  { kind: 'postgres', version: 1, id: 'pg', name: 'Orders', host: 'db.internal', port: 5432, database: 'orders', user: 'reader', password: '', ssl: false, readonly: true },
  { kind: 'bigquery', version: 1, id: 'bq', name: 'Analytics', billingProject: 'billing', defaultProject: 'data', maximumBytesBilled: '1000', readonly: true },
  { kind: 'local-files', version: 1, id: 'files', name: 'Exports', files: [{ path: '/tmp/export.csv', alias: 'export' }], readonly: true },
  { kind: 'sqlite-file', version: 1, id: 'sqlite', name: 'Archive', path: '/tmp/archive.sqlite', readonly: true },
  { kind: 'loki', version: 1, id: 'loki', name: 'Production logs', transport: { kind: 'gcx', context: 'production' }, readonly: true }
]

vi.mock('../lib/api', () => ({ api: { connections: {
  list: vi.fn(async () => profiles), listObjects: vi.fn(async () => []), describeTable: vi.fn(async () => []),
  connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn(), loki: {
    labels: vi.fn(async () => ['service_name', 'namespace', '__stream_shard__']),
    labelValues: vi.fn(async () => ['checkout-api', 'checkout-api'])
  }
} } }))

import { Sidebar } from './Sidebar'
import styles from './Sidebar.module.css'
import { api } from '../lib/api'
import { resetTestStore } from '../test/sessionTestUtils'
import { createQuerySession, useStore } from '../store/useStore'

afterEach(() => { cleanup(); resetTestStore(); vi.clearAllMocks() })

it('derives every connection badge from the saved profile kind', async () => {
  render(<Sidebar />)
  for (const [name, label] of [['Orders', 'PostgreSQL'], ['Analytics', 'BigQuery'], ['Exports', 'Local files'], ['Archive', 'SQLite']]) {
    const item = (await screen.findByText(name)).closest<HTMLElement>('[data-connection-item]')!
    expect(within(item).getByText(label)).toBeTruthy()
  }
  expect(screen.queryByText('pg')).toBeNull()
  expect(document.body.textContent).not.toContain('db.internal')
  expect(document.body.textContent).not.toContain('orders @')
})

it('keeps the kind and keyboard-reachable actions in one trailing slot', async () => {
  render(<Sidebar />)
  const name = await screen.findByText('Orders')
  const item = name.closest<HTMLElement>('[data-connection-item]')!
  const trailing = within(item).getByText('PostgreSQL').closest<HTMLElement>('[data-connection-trailing]')!
  const edit = within(item).getByRole('button', { name: 'Edit connection Orders' })
  const remove = within(item).getByRole('button', { name: 'Delete connection Orders' })

  expect(name.hasAttribute('data-connection-name')).toBe(true)
  expect(trailing.contains(edit)).toBe(true)
  expect(trailing.contains(remove)).toBe(true)
  expect(edit.getAttribute('title')).toBe('Edit connection')
  expect(remove.getAttribute('title')).toBe('Delete connection')
  expect(edit.getAttribute('tabindex')).not.toBe('-1')
  expect(remove.getAttribute('tabindex')).not.toBe('-1')

  fireEvent.click(edit)
  expect(api.connections.connect).not.toHaveBeenCalled()
})

it('shows a selected non-live profile without persistent connect-on-run copy', async () => {
  const tab = createQuerySession(1, { id: 'bound-tab', connectionProfileId: 'bq' })
  useStore.setState({ profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'pg', connected: true })
  render(<Sidebar />)

  const item = (await screen.findByText('Analytics')).closest<HTMLElement>('[data-connection-item]')!
  expect(item.getAttribute('aria-current')).toBe('true')
  expect(item.classList.contains(styles.selected)).toBe(true)
  expect(item.hasAttribute('data-connection-live')).toBe(false)
  expect(within(item).getByText('BigQuery')).toBeTruthy()
  expect(screen.queryByText(/connect on run/i)).toBeNull()

  const liveItem = screen.getByText('Orders').closest<HTMLElement>('[data-connection-item]')!
  expect(liveItem.hasAttribute('data-connection-live')).toBe(true)
  expect(liveItem.classList.contains(styles.active)).toBe(true)
  expect(liveItem.classList.contains(styles.selected)).toBe(false)
  expect(liveItem.hasAttribute('aria-current')).toBe(false)
})

it('retains compact progress feedback during an active connection attempt', async () => {
  const tab = createQuerySession(1, { id: 'connecting-tab', connectionProfileId: 'bq' })
  useStore.setState({ profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'bq', connected: false, connecting: true })
  render(<Sidebar />)

  const item = (await screen.findByText('Analytics')).closest<HTMLElement>('[data-connection-item]')!
  expect(within(item).getByLabelText('Connecting')).toBeTruthy()
  expect(within(item).getByText('Connecting…').closest('[data-connection-trailing]')).toBeTruthy()
  expect(screen.queryByText(/connect on run/i)).toBeNull()
})

it('shows useful Loki labels, hides internal labels, and lazily seeds a value filter', async () => {
  const tab = createQuerySession(1, { id: 'loki-tab', connectionProfileId: 'loki' })
  useStore.setState({ profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'loki', connected: true })
  render(<Sidebar />)
  await screen.findByText('Production logs')
  expect(screen.getByRole('heading', { name: 'Objects' })).toBeTruthy()
  expect(await screen.findByRole('tree', { name: 'Loki labels' })).toBeTruthy()
  expect(screen.queryByText('__stream_shard__')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Expand service_name' }))
  await screen.findByRole('treeitem', { name: 'checkout-api' })
  const objectFilter = screen.getByPlaceholderText('Filter objects…')
  fireEvent.change(objectFilter, { target: { value: 'checkout' } })
  expect(screen.getByText('service_name')).toBeTruthy()
  expect(screen.queryByText('namespace')).toBeNull()
  fireEvent.change(objectFilter, { target: { value: '' } })
  fireEvent.click(await screen.findByRole('button', { name: 'checkout-api' }))
  await waitFor(() => expect(useStore.getState().tabs[0].lokiBuilder.labelMatchers).toEqual([{ label: 'service_name', operator: '=', value: 'checkout-api', values: ['checkout-api'] }]))
})
