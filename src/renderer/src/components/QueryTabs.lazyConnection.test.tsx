import React from 'react'
void React
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
    const { container } = render(<QueryTabs />)

    expect(container.querySelector('.query-tabs-shell')).toBeNull()
    expect(screen.getByRole('tablist', { name: 'Query tabs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New query tab' }))
    expect(useStore.getState().tabs).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Close A query' }))
    expect(useStore.getState().tabs).toHaveLength(1)
    expect(useStore.getState().tabs[0].id).not.toBe('tab-a')
  })
})
