// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'

const profiles: DataSourceProfile[] = [
  { kind: 'postgres', version: 1, id: 'pg', name: 'Orders', host: 'db.internal', port: 5432, database: 'orders', user: 'reader', password: '', ssl: false, readonly: true },
  { kind: 'bigquery', version: 1, id: 'bq', name: 'Analytics', billingProject: 'billing', defaultProject: 'data', maximumBytesBilled: '1000', readonly: true },
  { kind: 'local-files', version: 1, id: 'files', name: 'Exports', files: [{ path: '/tmp/export.csv', alias: 'export' }], readonly: true },
  { kind: 'sqlite-file', version: 1, id: 'sqlite', name: 'Archive', path: '/tmp/archive.sqlite', readonly: true },
  { kind: 'loki', version: 1, id: 'loki', name: 'Production logs', transport: { kind: 'gcx', context: 'production' }, readonly: true },
  { kind: 'tempo', version: 1, id: 'tempo', name: 'Production traces', transport: { kind: 'gcx', context: 'production' }, readonly: true }
]

vi.mock('../lib/api', () => ({ api: { connections: {
  list: vi.fn(async () => profiles), listObjects: vi.fn(async () => []), describeTable: vi.fn(async () => []),
  refreshMetadata: vi.fn(async () => {}),
  connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn(), loki: {
    labels: vi.fn(async () => ['service_name', 'namespace', '__stream_shard__']),
    labelValues: vi.fn(async () => ['checkout-api', 'checkout-api'])
  }
} } }))

import { Sidebar } from './Sidebar'
import styles from './Sidebar.module.css'
import { api } from '@lib/api'
import { resetTestStore } from '@test/sessionTestUtils'
import { createQuerySession, useStore } from '@store/useStore'

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
  expect(within(item).queryByRole('button', { name: 'Refresh metadata for Orders' })).toBeNull()
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
  expect(within(liveItem).getByRole('button', { name: 'Refresh metadata for Orders' })).toBeTruthy()
  expect(within(item).queryByRole('button', { name: 'Refresh metadata for Analytics' })).toBeNull()
})

it('keeps only the live profile refresh action pending and does not switch connections', async () => {
  let finish!: () => void
  vi.mocked(api.connections.refreshMetadata).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
  vi.mocked(api.connections.listObjects).mockResolvedValueOnce([{ schema: 'public', name: 'new_orders', kind: 'r' }])
  const tab = createQuerySession(1, { id: 'live-tab', connectionProfileId: 'pg' })
  useStore.setState({
    profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'pg', connected: true, connectionGeneration: 4,
    metadataByProfileId: { pg: { schemas: [{ name: 'public', isSystem: false, relations: [{ schema: 'public', name: 'old_orders', qualifiedName: 'public.old_orders', kind: 'r', columnsStatus: 'idle' }] }], status: 'loaded', error: null, isStale: false } }
  })
  render(<Sidebar />)
  const filter = screen.getByRole('textbox', { name: 'Filter database objects' }) as HTMLInputElement
  fireEvent.change(filter, { target: { value: 'orders' } })
  expect(screen.getByText('old_orders')).toBeTruthy()
  const refresh = await screen.findByRole('button', { name: 'Refresh metadata for Orders' })
  expect(screen.queryByRole('button', { name: 'Refresh metadata for Analytics' })).toBeNull()
  fireEvent.click(refresh)
  await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(true))
  expect(refresh.getAttribute('aria-busy')).toBe('true')
  expect(refresh.querySelector('span')?.className).toBe('')
  const refreshing = screen.getByText('Refreshing metadata…')
  expect(refreshing).toBeTruthy()
  expect(filter.value).toBe('orders')
  const viewport = document.querySelector<HTMLElement>('[data-object-tree-viewport]')!
  expect(viewport.hidden).toBe(true)
  expect(filter.closest(`.${styles.objectFilter}`)?.contains(viewport)).toBe(false)
  expect(filter.compareDocumentPosition(refreshing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(api.connections.connect).not.toHaveBeenCalled()
  expect(api.connections.disconnect).not.toHaveBeenCalled()
  finish()
  await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(false))
  await waitFor(() => expect(screen.getByText('new_orders')).toBeTruthy())
  await Promise.resolve()
  expect(filter.value).toBe('orders')
  expect(viewport.hidden).toBe(false)
})

it('restores the previous filtered tree and reports a failed manual refresh', async () => {
  await Promise.resolve()
  vi.mocked(api.connections.refreshMetadata).mockRejectedValueOnce(new Error('provider unavailable'))
  const tab = createQuerySession(1, { id: 'live-tab', connectionProfileId: 'pg' })
  useStore.setState({
    profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'pg', connected: true, connectionGeneration: 4,
    metadataByProfileId: { pg: { schemas: [{ name: 'public', isSystem: false, relations: [{ schema: 'public', name: 'old_orders', qualifiedName: 'public.old_orders', kind: 'r', columnsStatus: 'idle' }] }], status: 'loaded', error: null, isStale: false } }
  })
  render(<Sidebar />)
  const filter = screen.getByRole('textbox', { name: 'Filter database objects' }) as HTMLInputElement
  fireEvent.change(filter, { target: { value: 'orders' } })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh metadata for Orders' }))
  await waitFor(() => expect(screen.getByText('Could not refresh metadata.')).toBeTruthy())
  expect(screen.getByText('old_orders')).toBeTruthy()
  expect(filter.value).toBe('orders')
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

it('filters Tempo services with multiple partial tokens', async () => {
  const tab = createQuerySession(1, { id: 'tempo-tab', connectionProfileId: 'tempo' })
  useStore.setState({
    profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'tempo', connected: true,
    metadataByProfileId: { tempo: { schemas: [{ name: 'Tempo', isSystem: false, relations: [
      { schema: 'Tempo', name: 'payment-service', qualifiedName: 'Tempo.payment-service', kind: 'service', columnsStatus: 'idle', details: { kind: 'service' } },
      { schema: 'Tempo', name: 'payment-service-worker', qualifiedName: 'Tempo.payment-service-worker', kind: 'service', columnsStatus: 'idle', details: { kind: 'service' } }
    ] }], status: 'loaded', error: null, isStale: false } }
  })
  render(<Sidebar />)

  const filter = screen.getByRole('textbox', { name: 'Filter services' })
  fireEvent.change(filter, { target: { value: 'pay worker' } })

  expect(screen.getByText('payment-service-worker')).toBeTruthy()
  expect(screen.queryByText('payment-service')).toBeNull()
})

it('keeps the Loki filter visible and uses the generic refresh status while labels reload', async () => {
  let finishLabels!: (labels: string[]) => void
  vi.mocked(api.connections.loki.labels)
    .mockResolvedValueOnce(['service_name', 'namespace'])
    .mockReturnValueOnce(new Promise<string[]>((resolve) => { finishLabels = resolve }))
  const tab = createQuerySession(1, { id: 'loki-refresh-tab', connectionProfileId: 'loki' })
  useStore.setState({
    profiles, tabs: [tab], activeTabId: tab.id, activeProfileId: 'loki', connected: true, connectionGeneration: 3,
    metadataByProfileId: { loki: { schemas: [], status: 'loaded', error: null, isStale: false } }
  })
  render(<Sidebar />)
  const filter = await screen.findByRole('textbox', { name: 'Filter Loki objects' })
  await screen.findByRole('tree', { name: 'Loki labels' })

  fireEvent.click(screen.getByRole('button', { name: 'Refresh metadata for Production logs' }))

  const refreshing = await screen.findByText('Refreshing metadata…')
  expect(filter).toBeTruthy()
  expect(filter.compareDocumentPosition(refreshing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.queryByText('Loading indexed labels…')).toBeNull()
  expect(document.querySelector<HTMLElement>('[data-object-tree-viewport]')?.hidden).toBe(true)

  finishLabels(['service_name', 'namespace', 'cluster'])
  await waitFor(() => expect(screen.queryByText('Refreshing metadata…')).toBeNull())
  expect(screen.getByRole('textbox', { name: 'Filter Loki objects' })).toBeTruthy()
  expect(screen.getByRole('tree', { name: 'Loki labels' })).toBeTruthy()
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
