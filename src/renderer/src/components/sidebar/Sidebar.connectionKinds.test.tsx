// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'

const profiles: DataSourceProfile[] = [
  {
    kind: 'postgres',
    version: 2,
    id: 'pg',
    name: 'Orders',
    host: 'db.internal',
    port: 5432,
    database: 'orders',
    user: 'reader',
    password: '',
    tlsMode: 'disable',
    readonly: true,
  },
  {
    kind: 'bigquery',
    version: 1,
    id: 'bq',
    name: 'Analytics',
    billingProject: 'billing',
    defaultProject: 'data',
    maximumBytesBilled: '1000',
    readonly: true,
  },
  {
    kind: 'local-files',
    version: 1,
    id: 'files',
    name: 'Exports',
    files: [{ path: '/tmp/export.csv', alias: 'export' }],
    readonly: true,
  },
  {
    kind: 'sqlite-file',
    version: 1,
    id: 'sqlite',
    name: 'Archive',
    path: '/tmp/archive.sqlite',
    readonly: true,
  },
  {
    kind: 'loki',
    version: 1,
    id: 'loki',
    name: 'Production logs',
    transport: { kind: 'gcx', context: 'production' },
    readonly: true,
  },
  {
    kind: 'tempo',
    version: 1,
    id: 'tempo',
    name: 'Production traces',
    transport: { kind: 'gcx', context: 'production' },
    readonly: true,
  },
  {
    kind: 'prometheus',
    version: 1,
    id: 'prom',
    name: 'Metrics',
    transport: { kind: 'gcx' },
    readonly: true,
  },
]

vi.mock('@lib/api', () => ({
  api: {
    connections: {
      list: vi.fn(async () => profiles),
      listLive: vi.fn(async () => []),
      listObjects: vi.fn(async () => []),
      describeTable: vi.fn(async () => []),
      refreshMetadata: vi.fn(async () => {}),
      connect: vi.fn(),
      disconnect: vi.fn(),
      remove: vi.fn(),
      loki: {
        labels: vi.fn(async () => [
          'service_name',
          'namespace',
          '__stream_shard__',
        ]),
        labelValues: vi.fn(async () => ['checkout-api', 'checkout-api']),
      },
    },
  },
}))

import { Sidebar } from './Sidebar'
import { ConnectionStatus } from '@components/connections/ConnectionStatus'
import styles from './Sidebar.module.css'
import { api } from '@lib/api'
import { resetTestStore } from '@test/sessionTestUtils'
import { createQuerySession, useStore } from '@store/useStore'

const liveConnection = (
  generation = 1,
  serverVersion: string | null = null,
) => ({
  status: 'connected' as const,
  generation,
  error: null,
  serverVersion,
})

afterEach(() => {
  cleanup()
  resetTestStore()
  vi.clearAllMocks()
})

it('rehydrates metadata for a restored background live session after renderer reload', async () => {
  vi.mocked(api.connections.listLive!).mockResolvedValueOnce([
    { id: 'pg', generation: 4, serverVersion: '16' },
  ])
  vi.mocked(api.connections.listObjects).mockResolvedValueOnce([
    { schema: 'public', name: 'orders', kind: 'r' },
  ])
  const postgresTab = createQuerySession(1, {
    id: 'postgres-tab',
    connectionProfileId: 'pg',
  })
  const otherTab = createQuerySession(2, {
    id: 'other-tab',
    connectionProfileId: 'bq',
  })
  useStore.setState({
    profiles,
    tabs: [postgresTab, otherTab],
    activeTabId: otherTab.id,
    metadataByProfileId: {},
    connectionStateByProfileId: {},
  })

  const { container } = render(
    <>
      <ConnectionStatus />
      <Sidebar />
    </>,
  )

  await waitFor(() =>
    expect(useStore.getState().connectionStateByProfileId.pg).toMatchObject({
      status: 'connected',
      generation: 4,
    }),
  )
  await waitFor(() =>
    expect(useStore.getState().metadataByProfileId.pg).toMatchObject({
      status: 'loaded',
      schemas: [{ name: 'public', relations: [{ name: 'orders' }] }],
    }),
  )
  const postgresRow = screen.getByLabelText('Orders, live, background')
  expect(postgresRow.getAttribute('data-connection-state')).toBe(
    'live, background',
  )
  expect(container.querySelector('[data-state]')?.textContent).toBe(
    'Analytics · disconnected',
  )
  expect(api.connections.listObjects).toHaveBeenCalledWith('pg')
  expect(api.connections.connect).not.toHaveBeenCalled()

  act(() => useStore.setState({ activeTabId: postgresTab.id }))
  expect(container.querySelector('[data-state]')?.textContent).toBe(
    'Orders · PostgreSQL 16',
  )
  expect(
    screen
      .getByLabelText('Orders, live, current tab')
      .getAttribute('data-connection-state'),
  ).toBe('live, current tab')
  expect(await screen.findByText('orders')).toBeTruthy()
})

it('keeps restored profile indicators pending until live-session hydration completes', async () => {
  let finishLive!: (
    sessions: Array<{ id: string; generation: number; serverVersion?: string }>,
  ) => void
  vi.mocked(api.connections.listLive!).mockReturnValueOnce(
    new Promise((resolve) => {
      finishLive = resolve
    }),
  )
  const tab = createQuerySession(1, {
    id: 'restored-tab',
    connectionProfileId: 'pg',
  })
  useStore.setState({
    profiles: [],
    tabs: [tab],
    activeTabId: tab.id,
    connectionStateByProfileId: {},
  })

  const { container } = render(
    <>
      <ConnectionStatus />
      <Sidebar />
    </>,
  )

  const postgresRow = await screen.findByLabelText(
    'Orders, restoring connection',
  )
  expect(postgresRow.getAttribute('data-connection-state')).toBe('pending')
  expect(container.querySelector('[data-state]')?.textContent).toBe(
    'Restoring connection…',
  )
  expect(api.connections.connect).not.toHaveBeenCalled()

  act(() => finishLive([]))
  await waitFor(() =>
    expect(useStore.getState().connectionStateByProfileId.pg?.status).toBe(
      'disconnected',
    ),
  )
  expect(screen.getByLabelText('Orders, disconnected')).toBeTruthy()
  expect(container.querySelector('[data-state]')?.textContent).toBe(
    'Orders · disconnected',
  )
  expect(api.connections.connect).not.toHaveBeenCalled()
})

it.each(['loaded', 'loading'] as const)(
  'does not rehydrate live metadata that is already %s',
  async (status) => {
    vi.mocked(api.connections.listLive!).mockResolvedValueOnce([
      { id: 'pg', generation: 4 },
    ])
    const tab = createQuerySession(1, {
      id: 'postgres-tab',
      connectionProfileId: 'pg',
    })
    useStore.setState({
      profiles,
      tabs: [tab],
      activeTabId: tab.id,
      metadataByProfileId: {
        pg: { schemas: [], status, error: null, isStale: false },
      },
    })

    render(<Sidebar />)
    await waitFor(() =>
      expect(
        useStore.getState().connectionStateByProfileId.pg?.generation,
      ).toBe(4),
    )
    expect(api.connections.listObjects).not.toHaveBeenCalled()
  },
)

it('derives every connection badge from the saved profile kind', async () => {
  render(<Sidebar />)
  for (const [name, label] of [
    ['Orders', 'PostgreSQL'],
    ['Analytics', 'BigQuery'],
    ['Exports', 'Local files'],
    ['Archive', 'SQLite'],
  ]) {
    const item = (await screen.findByText(name)).closest<HTMLElement>(
      '[data-connection-item]',
    )!
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
  const trailing = within(item)
    .getByText('PostgreSQL')
    .closest<HTMLElement>('[data-connection-trailing]')!
  const edit = within(item).getByRole('button', {
    name: 'Edit connection Orders',
  })
  const remove = within(item).getByRole('button', {
    name: 'Delete connection Orders',
  })

  expect(name.hasAttribute('data-connection-name')).toBe(true)
  expect(trailing.contains(edit)).toBe(true)
  expect(trailing.contains(remove)).toBe(true)
  expect(
    within(item).queryByRole('button', { name: 'Refresh metadata for Orders' }),
  ).toBeNull()
  expect(edit.getAttribute('title')).toBe('Edit connection')
  expect(remove.getAttribute('title')).toBe('Delete connection')
  expect(edit.getAttribute('tabindex')).not.toBe('-1')
  expect(remove.getAttribute('tabindex')).not.toBe('-1')

  fireEvent.click(edit)
  expect(api.connections.connect).not.toHaveBeenCalled()
})

it('shows a selected non-live profile without persistent connect-on-run copy', async () => {
  const tab = createQuerySession(1, {
    id: 'bound-tab',
    connectionProfileId: 'bq',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'pg',
    connected: true,
    connectionStateByProfileId: { pg: liveConnection() },
  })
  render(<Sidebar />)

  const item = (await screen.findByText('Analytics')).closest<HTMLElement>(
    '[data-connection-item]',
  )!
  expect(item.getAttribute('aria-current')).toBe('true')
  expect(item.classList.contains(styles.selected)).toBe(true)
  expect(item.hasAttribute('data-connection-live')).toBe(false)
  expect(within(item).getByText('BigQuery')).toBeTruthy()
  expect(screen.queryByText(/connect on run/i)).toBeNull()

  const liveItem = screen
    .getByText('Orders')
    .closest<HTMLElement>('[data-connection-item]')!
  expect(liveItem.hasAttribute('data-connection-live')).toBe(true)
  expect(liveItem.classList.contains(styles.backgroundLive)).toBe(true)
  expect(liveItem.classList.contains(styles.selected)).toBe(false)
  expect(liveItem.hasAttribute('aria-current')).toBe(false)
  expect(
    within(liveItem).getByRole('button', {
      name: 'Refresh metadata for Orders',
    }),
  ).toBeTruthy()
  expect(
    within(item).queryByRole('button', {
      name: 'Refresh metadata for Analytics',
    }),
  ).toBeNull()
})

it('keeps only the live profile refresh action pending and does not switch connections', async () => {
  let finish!: () => void
  vi.mocked(api.connections.refreshMetadata).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  vi.mocked(api.connections.listObjects).mockResolvedValueOnce([
    { schema: 'public', name: 'new_orders', kind: 'r' },
  ])
  const tab = createQuerySession(1, {
    id: 'live-tab',
    connectionProfileId: 'pg',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'pg',
    connected: true,
    connectionGeneration: 4,
    connectionStateByProfileId: { pg: liveConnection(4) },
    metadataByProfileId: {
      pg: {
        schemas: [
          {
            name: 'public',
            isSystem: false,
            relations: [
              {
                schema: 'public',
                name: 'old_orders',
                qualifiedName: 'public.old_orders',
                kind: 'r',
                columnsStatus: 'idle',
              },
            ],
          },
        ],
        status: 'loaded',
        error: null,
        isStale: false,
      },
    },
  })
  render(<Sidebar />)
  const filter = screen.getByRole('textbox', {
    name: 'Filter database objects',
  }) as HTMLInputElement
  fireEvent.change(filter, { target: { value: 'orders' } })
  expect(screen.getByText('old_orders')).toBeTruthy()
  const refresh = await screen.findByRole('button', {
    name: 'Refresh metadata for Orders',
  })
  expect(
    screen.queryByRole('button', { name: 'Refresh metadata for Analytics' }),
  ).toBeNull()
  fireEvent.click(refresh)
  await waitFor(() =>
    expect((refresh as HTMLButtonElement).disabled).toBe(true),
  )
  expect(refresh.getAttribute('aria-busy')).toBe('true')
  expect(refresh.querySelector('span')?.className).toBe('')
  const refreshing = screen.getByText('Refreshing metadata…')
  expect(refreshing).toBeTruthy()
  expect(filter.value).toBe('orders')
  const viewport = document.querySelector<HTMLElement>(
    '[data-object-tree-viewport]',
  )!
  expect(viewport.hidden).toBe(true)
  expect(filter.closest(`.${styles.objectFilter}`)?.contains(viewport)).toBe(
    false,
  )
  expect(
    filter.compareDocumentPosition(refreshing) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(api.connections.connect).not.toHaveBeenCalled()
  expect(api.connections.disconnect).not.toHaveBeenCalled()
  finish()
  await waitFor(() =>
    expect((refresh as HTMLButtonElement).disabled).toBe(false),
  )
  await waitFor(() => expect(screen.getByText('new_orders')).toBeTruthy())
  await Promise.resolve()
  expect(filter.value).toBe('orders')
  expect(viewport.hidden).toBe(false)
})

it('restores the previous filtered tree and reports a failed manual refresh', async () => {
  await Promise.resolve()
  vi.mocked(api.connections.refreshMetadata).mockRejectedValueOnce(
    new Error('provider unavailable'),
  )
  const tab = createQuerySession(1, {
    id: 'live-tab',
    connectionProfileId: 'pg',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'pg',
    connected: true,
    connectionGeneration: 4,
    connectionStateByProfileId: { pg: liveConnection(4) },
    metadataByProfileId: {
      pg: {
        schemas: [
          {
            name: 'public',
            isSystem: false,
            relations: [
              {
                schema: 'public',
                name: 'old_orders',
                qualifiedName: 'public.old_orders',
                kind: 'r',
                columnsStatus: 'idle',
              },
            ],
          },
        ],
        status: 'loaded',
        error: null,
        isStale: false,
      },
    },
  })
  render(<Sidebar />)
  const filter = screen.getByRole('textbox', {
    name: 'Filter database objects',
  }) as HTMLInputElement
  fireEvent.change(filter, { target: { value: 'orders' } })
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh metadata for Orders' }),
  )
  await waitFor(() =>
    expect(screen.getByText('Could not refresh metadata.')).toBeTruthy(),
  )
  expect(screen.getByText('old_orders')).toBeTruthy()
  expect(filter.value).toBe('orders')
})

it('retains compact progress feedback during an active connection attempt', async () => {
  const tab = createQuerySession(1, {
    id: 'connecting-tab',
    connectionProfileId: 'bq',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'bq',
    connected: false,
    connecting: true,
    connectionStateByProfileId: {
      bq: {
        status: 'connecting',
        generation: 0,
        error: null,
        serverVersion: null,
      },
    },
  })
  render(<Sidebar />)

  const item = (await screen.findByText('Analytics')).closest<HTMLElement>(
    '[data-connection-item]',
  )!
  expect(within(item).getByLabelText('Connecting')).toBeTruthy()
  expect(
    within(item).getByText('Connecting…').closest('[data-connection-trailing]'),
  ).toBeTruthy()
  expect(screen.queryByText(/connect on run/i)).toBeNull()
})

it('selecting a Tempo service seeds the structured Builder and clears stale service-specific filters', async () => {
  const tab = createQuerySession(1, {
    id: 'tempo-builder-tab',
    connectionProfileId: 'tempo',
  })
  tab.sql = '{ resource.service.name = "manual-query" }'
  tab.tempoBuilder = {
    ...tab.tempoBuilder,
    serviceNamespace: 'old',
    service: 'old-service',
    protocol: 'http',
    httpMethod: 'POST',
    endpoint: '/old',
    status: 'error',
    minDurationMs: '900',
    advancedFilters: [
      {
        attribute: 'deployment.environment',
        scope: 'resource',
        mode: 'include',
        values: ['production'],
      },
    ],
  }
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'tempo',
    connected: true,
    connectionStateByProfileId: { tempo: liveConnection() },
    metadataByProfileId: {
      tempo: {
        schemas: [
          {
            name: 'Tempo',
            isSystem: false,
            relations: [
              {
                schema: 'Tempo',
                name: 'payment-service',
                qualifiedName: 'Tempo.payment-service',
                kind: 'service',
                columnsStatus: 'idle',
                details: { kind: 'service', serviceNamespace: 'payments' },
              },
            ],
          },
        ],
        status: 'loaded',
        error: null,
        isStale: false,
      },
    },
  })
  render(<Sidebar />)

  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Explore traces for payment-service',
    }),
  )

  const session = useStore.getState().tabs[0]
  expect(session.queryMode).toBe('builder')
  expect(session.tempoBuilder).toMatchObject({
    serviceNamespace: 'payments',
    service: 'payment-service',
    protocol: 'any',
    httpMethod: '',
    endpoint: '',
    status: 'any',
    minDurationMs: '',
    advancedFilters: [],
  })
  expect(session.sql).toBe('{ resource.service.name = "manual-query" }')
})

it('selecting a Prometheus metric updates Builder state without replacing raw PromQL', async () => {
  const tab = createQuerySession(1, {
    id: 'prom-builder-tab',
    connectionProfileId: 'prom',
  })
  tab.sql = 'manual_query_that_must_survive'
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'prom',
    connected: true,
    connectionStateByProfileId: { prom: liveConnection() },
    metadataByProfileId: {
      prom: {
        schemas: [
          {
            name: 'Prometheus',
            isSystem: false,
            relations: [
              {
                schema: 'Prometheus',
                name: 'up',
                qualifiedName: 'up',
                kind: 'metric',
                columnsStatus: 'idle',
              },
            ],
          },
        ],
        status: 'loaded',
        error: null,
        isStale: false,
      },
    },
  })
  render(<Sidebar />)

  fireEvent.click(
    await screen.findByRole('button', { name: 'Select up for Builder' }),
  )

  expect(useStore.getState().tabs[0].promqlBuilder.metric).toBe('up')
  expect(useStore.getState().tabs[0].sql).toBe('manual_query_that_must_survive')
})

it('filters Tempo services with multiple partial tokens', async () => {
  const tab = createQuerySession(1, {
    id: 'tempo-tab',
    connectionProfileId: 'tempo',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'tempo',
    connected: true,
    connectionStateByProfileId: { tempo: liveConnection() },
    metadataByProfileId: {
      tempo: {
        schemas: [
          {
            name: 'Tempo',
            isSystem: false,
            relations: [
              {
                schema: 'Tempo',
                name: 'payment-service',
                qualifiedName: 'Tempo.payment-service',
                kind: 'service',
                columnsStatus: 'idle',
                details: { kind: 'service' },
              },
              {
                schema: 'Tempo',
                name: 'payment-service-worker',
                qualifiedName: 'Tempo.payment-service-worker',
                kind: 'service',
                columnsStatus: 'idle',
                details: { kind: 'service' },
              },
            ],
          },
        ],
        status: 'loaded',
        error: null,
        isStale: false,
      },
    },
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
    .mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        finishLabels = resolve
      }),
    )
  const tab = createQuerySession(1, {
    id: 'loki-refresh-tab',
    connectionProfileId: 'loki',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'loki',
    connected: true,
    connectionGeneration: 3,
    connectionStateByProfileId: { loki: liveConnection(3) },
    metadataByProfileId: {
      loki: { schemas: [], status: 'loaded', error: null, isStale: false },
    },
  })
  render(<Sidebar />)
  const filter = await screen.findByRole('textbox', {
    name: 'Filter Loki objects',
  })
  await screen.findByRole('tree', { name: 'Loki labels' })

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Refresh metadata for Production logs',
    }),
  )

  const refreshing = await screen.findByText('Refreshing metadata…')
  expect(filter).toBeTruthy()
  expect(
    filter.compareDocumentPosition(refreshing) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(screen.queryByText('Loading indexed labels…')).toBeNull()
  expect(
    document.querySelector<HTMLElement>('[data-object-tree-viewport]')?.hidden,
  ).toBe(true)

  finishLabels(['service_name', 'namespace', 'cluster'])
  await waitFor(() =>
    expect(screen.queryByText('Refreshing metadata…')).toBeNull(),
  )
  expect(
    screen.getByRole('textbox', { name: 'Filter Loki objects' }),
  ).toBeTruthy()
  expect(screen.getByRole('tree', { name: 'Loki labels' })).toBeTruthy()
})

it('shows useful Loki labels, hides internal labels, and lazily seeds a value filter', async () => {
  const tab = createQuerySession(1, {
    id: 'loki-tab',
    connectionProfileId: 'loki',
  })
  useStore.setState({
    profiles,
    tabs: [tab],
    activeTabId: tab.id,
    activeProfileId: 'loki',
    connected: true,
    connectionStateByProfileId: { loki: liveConnection() },
  })
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
  await waitFor(() =>
    expect(useStore.getState().tabs[0].lokiBuilder.labelMatchers).toEqual([
      {
        label: 'service_name',
        operator: '=',
        value: 'checkout-api',
        values: ['checkout-api'],
      },
    ]),
  )
})
