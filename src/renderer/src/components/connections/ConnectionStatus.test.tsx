// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'
import { patchActiveTestSession, resetTestStore } from '@test/sessionTestUtils'
import { createQuerySession, useStore } from '@store/useStore'

const postgres = {
  kind: 'postgres' as const,
  version: 2 as const,
  id: 'pg',
  name: 'A very long production database name',
  host: 'db',
  port: 5432,
  database: 'app',
  user: 'app',
  password: '',
  tlsMode: 'disable' as const,
  readonly: true,
}

describe('ConnectionStatus', () => {
  afterEach(() => {
    cleanup()
    resetTestStore()
  })

  it('preserves connected text, glow state, live semantics, and the full accessible label', () => {
    resetTestStore({
      profiles: [postgres],
      connectionStateByProfileId: {
        [postgres.id]: {
          status: 'connected',
          generation: 3,
          error: null,
          serverVersion: '16.4',
        },
      },
    })
    patchActiveTestSession({ connectionProfileId: postgres.id })
    render(<ConnectionStatus />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe(
      'A very long production database name · PostgreSQL 16.4',
    )
    expect(status.dataset.state).toBe('connected')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.title).toBe(status.textContent)
  })

  it('uses the active tab profile state after a renderer reload even when legacy global state is disconnected', () => {
    resetTestStore({
      profiles: [postgres],
      connectionStateByProfileId: {
        [postgres.id]: {
          status: 'connected',
          generation: 4,
          error: null,
          serverVersion: '16.4',
        },
      },
    })
    patchActiveTestSession({ connectionProfileId: postgres.id })

    render(<ConnectionStatus />)

    const status = screen.getByRole('status')
    expect(status.textContent).toBe(
      'A very long production database name · PostgreSQL 16.4',
    )
    expect(status.dataset.state).toBe('connected')
  })

  it('follows the active tab connection when sidebar selection points at another profile', () => {
    const bigQuery = {
      kind: 'bigquery' as const,
      version: 1 as const,
      id: 'bq',
      name: 'Analytics',
      billingProject: 'billing',
      defaultProject: 'warehouse',
      maximumBytesBilled: '1000',
      readonly: true as const,
    }
    const tabA = createQuerySession(1, {
      id: 'tab-a',
      connectionProfileId: postgres.id,
    })
    const tabB = createQuerySession(2, {
      id: 'tab-b',
      connectionProfileId: bigQuery.id,
    })
    resetTestStore({
      profiles: [postgres, bigQuery],
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
      connectionStateByProfileId: {
        [postgres.id]: {
          status: 'connected',
          generation: 4,
          error: null,
          serverVersion: '16.4',
        },
        [bigQuery.id]: {
          status: 'disconnected',
          generation: 8,
          error: null,
          serverVersion: null,
        },
      },
    })

    render(<ConnectionStatus />)
    expect(screen.getByRole('status').textContent).toBe(
      'A very long production database name · PostgreSQL 16.4',
    )

    act(() => useStore.setState({ activeTabId: tabB.id }))
    expect(screen.getByRole('status').textContent).toBe(
      'Analytics · disconnected',
    )

    act(() =>
      useStore.setState((state) => ({
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          [bigQuery.id]: {
            status: 'connected',
            generation: 9,
            error: null,
            serverVersion: null,
          },
        },
      })),
    )
    expect(screen.getByRole('status').textContent).toBe('Analytics · BigQuery')
    act(() => useStore.setState({ activeTabId: tabA.id }))
    expect(screen.getByRole('status').textContent).toBe(
      'A very long production database name · PostgreSQL 16.4',
    )
  })

  it('keeps an unavailable scoped entry pending instead of falling back to legacy state', () => {
    resetTestStore({
      profiles: [postgres],
    })
    useStore.setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, connectionProfileId: postgres.id }
          : tab,
      ),
    }))

    render(<ConnectionStatus />)

    expect(screen.getByRole('status').textContent).toBe('Restoring connection…')
    expect(screen.getByRole('status').dataset.state).toBe('pending')
  })

  it('does not infer a tab connection from sidebar selection when the tab has none', () => {
    resetTestStore({
      profiles: [postgres],
      connectionStateByProfileId: {
        [postgres.id]: {
          status: 'connected',
          generation: 4,
          error: null,
          serverVersion: '16.4',
        },
      },
    })

    render(<ConnectionStatus />)

    expect(screen.getByRole('status').textContent).toBe(
      'No connection selected',
    )
    expect(screen.getByRole('status').dataset.state).toBe('unassigned')
  })

  it('does not leak a profile error into a different tab', () => {
    const tabA = createQuerySession(1, {
      id: 'tab-a',
      connectionProfileId: postgres.id,
    })
    const tabB = createQuerySession(2, {
      id: 'tab-b',
      connectionProfileId: 'b',
    })
    resetTestStore({
      profiles: [postgres],
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
      connectionStateByProfileId: {
        [postgres.id]: {
          status: 'connecting',
          generation: 1,
          error: null,
          serverVersion: null,
        },
        b: {
          status: 'error',
          generation: 2,
          error: 'B connection refused',
          serverVersion: null,
        },
      },
    })

    render(<ConnectionStatus />)
    expect(screen.getByRole('status').textContent).toBe('Connecting…')

    act(() => useStore.setState({ activeTabId: tabB.id }))
    expect(screen.getByRole('status').textContent).toBe('B connection refused')
    expect(screen.getByRole('status').dataset.state).toBe('error')
  })

  it.each([
    [
      {
        connectionStateByProfileId: {
          pg: {
            status: 'reconnecting' as const,
            generation: 1,
            error: null,
            serverVersion: null,
          },
        },
      },
      'Reconnecting…',
      'reconnecting',
    ],
    [
      {
        connectionStateByProfileId: {
          pg: {
            status: 'idle' as const,
            generation: 1,
            error: null,
            serverVersion: null,
          },
        },
      },
      'Idle',
      'connected',
    ],
    [
      {
        profiles: [postgres],
        tabs: [
          createQuerySession(1, {
            id: 'test-tab',
            connectionProfileId: postgres.id,
          }),
        ],
        activeTabId: 'test-tab',
        connectionStateByProfileId: {
          [postgres.id]: {
            status: 'disconnected' as const,
            generation: 1,
            error: null,
            serverVersion: null,
          },
        },
      },
      'A very long production database name · disconnected',
      'disconnected',
    ],
    [
      {
        connectionStateByProfileId: {
          pg: {
            status: 'error' as const,
            generation: 1,
            error: 'Connection refused',
            serverVersion: null,
          },
        },
      },
      'Connection refused',
      'error',
    ],
  ])('renders the non-connected state %#', (patch, text, stateClass) => {
    resetTestStore(patch)
    patchActiveTestSession({ connectionProfileId: 'pg' })
    render(<ConnectionStatus />)
    expect(screen.getByRole('status').textContent).toBe(text)
    expect(screen.getByRole('status').dataset.state).toBe(stateClass)
  })
})
