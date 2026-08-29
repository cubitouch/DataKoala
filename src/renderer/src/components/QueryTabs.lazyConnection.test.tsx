// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { connect, disconnect } = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: {
    connections: {
      connect,
      disconnect,
      list: vi.fn(async () => []),
      listObjects: vi.fn(async () => []),
      describeTable: vi.fn(async () => [])
    }
  }
}))

import { QueryTabs } from './QueryTabs'
import { createQuerySession, useStore } from '../store/useStore'
import { resetTestStore } from '../test/sessionTestUtils'

describe('QueryTabs lazy connection switching', () => {
  afterEach(() => {
    cleanup()
    resetTestStore()
    vi.clearAllMocks()
  })

  it('switches tabs locally without disconnecting or connecting database pools', () => {
    const a = createQuerySession(1, { id: 'tab-a', title: 'A query', connectionProfileId: 'profile-a' })
    const b = createQuerySession(2, { id: 'tab-b', title: 'B query', connectionProfileId: 'profile-b' })
    resetTestStore({
      tabs: [a, b],
      activeTabId: a.id,
      activeProfileId: 'profile-a',
      connected: true,
      connectionStatus: 'connected',
      profiles: [
        { kind: 'postgres', version: 1, id: 'profile-a', name: 'Database A', host: 'a', port: 5432, database: 'a', user: 'reader', password: '', ssl: false, readonly: true },
        { kind: 'postgres', version: 1, id: 'profile-b', name: 'Database B', host: 'b', port: 5432, database: 'b', user: 'reader', password: '', ssl: false, readonly: true }
      ]
    })

    render(<QueryTabs />)
    fireEvent.click(screen.getByTitle('B query — Database B'))

    const state = useStore.getState()
    expect(state.activeTabId).toBe('tab-b')
    expect(state.activeProfileId).toBe('profile-a')
    expect(state.connected).toBe(true)
    expect(disconnect).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('keeps new and close tab controls usable in the chrome tablist', () => {
    const a = createQuerySession(1, { id: 'tab-a', title: 'A query' })
    resetTestStore({ tabs: [a], activeTabId: a.id })
    render(<QueryTabs />)

    expect(screen.getByRole('tablist', { name: 'Query tabs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New query tab' }))
    expect(useStore.getState().tabs).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Close A query' }))
    expect(useStore.getState().tabs).toHaveLength(1)
    expect(useStore.getState().tabs[0].id).not.toBe('tab-a')
  })

  it('accepts a parent-owned placement class without replacing its component styling', () => {
    const a = createQuerySession(1, { id: 'tab-a', title: 'A query' })
    resetTestStore({ tabs: [a], activeTabId: a.id })
    render(<QueryTabs className="titlebar-placement" />)
    expect(screen.getByRole('tablist', { name: 'Query tabs' }).classList.contains('titlebar-placement')).toBe(true)
  })

  it('renders active, running, connection, and rename semantics', () => {
    const a = { ...createQuerySession(1, { id: 'tab-a', title: 'Original', connectionProfileId: 'profile-a' }), running: true }
    resetTestStore({
      tabs: [a], activeTabId: a.id,
      profiles: [{ kind: 'postgres', version: 1, id: 'profile-a', name: 'Database A', host: 'a', port: 5432, database: 'a', user: 'reader', password: '', ssl: false, readonly: true }]
    })
    render(<QueryTabs />)
    expect(screen.getByRole('tab', { selected: true })).toBeTruthy()
    expect(screen.getByLabelText('Query running')).toBeTruthy()
    expect(screen.getByText('Database A')).toBeTruthy()
    fireEvent.doubleClick(screen.getByTitle('Original — Database A'))
    const input = screen.getByDisplayValue('Original')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useStore.getState().tabs[0].title).toBe('Renamed')
  })
})
