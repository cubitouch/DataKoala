import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConnectionProfile, QueryResult } from '@shared/types'

const { connect, disconnect, listObjects } = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(async () => undefined),
  listObjects: vi.fn(async () => [])
}))

vi.mock('../lib/api', () => ({
  api: {
    connections: {
      list: vi.fn(async () => [
        { kind: 'postgres', version: 1, id: 'profile-a', name: 'Database A', host: 'a.local', port: 5432, database: 'a', user: 'reader', password: 'secret-a', ssl: false, readonly: true },
        { kind: 'postgres', version: 1, id: 'profile-b', name: 'Database B', host: 'b.local', port: 5432, database: 'b', user: 'reader', password: 'secret-b', ssl: false, readonly: true }
      ]),
      connect,
      disconnect,
      listObjects,
      describeTable: vi.fn(async () => []),
      remove: vi.fn(async () => undefined)
    }
  }
}))

import { Sidebar } from './Sidebar'
import { selectActiveSession, useStore } from '../store/useStore'
import { patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

const profiles: ConnectionProfile[] = [
  { kind: 'postgres', version: 1, id: 'profile-a', name: 'Database A', host: 'a.local', port: 5432, database: 'a', user: 'reader', password: 'secret-a', ssl: false, readonly: true },
  { kind: 'postgres', version: 1, id: 'profile-b', name: 'Database B', host: 'b.local', port: 5432, database: 'b', user: 'reader', password: 'secret-b', ssl: false, readonly: true }
]

const result: QueryResult = {
  columns: [{ name: 'value', dataTypeID: 23, dataTypeName: 'int4' }],
  rows: [{ value: 42 }],
  rowCount: 1,
  durationMs: 3
}

beforeEach(() => {
  connect.mockImplementation(async (profile: ConnectionProfile) => ({
    ok: true as const,
    id: profile.id,
    generation: profile.id === 'profile-a' ? 1 : 2,
    serverVersion: '16'
  }))
})

describe('Sidebar connection changes', () => {
  afterEach(() => {
    cleanup()
    resetTestStore()
    vi.clearAllMocks()
  })

  it('clears result-derived state when the active tab changes connection but preserves its draft', async () => {
    resetTestStore({
      profiles,
      activeProfileId: 'profile-a',
      connected: true,
      connectionStatus: 'connected',
      connectionGeneration: 1
    })
    patchActiveTestSession({
      connectionProfileId: 'profile-a',
      sql: 'select keep_this_draft;',
      result,
      pendingResult: result,
      queryError: 'old error',
      explainText: 'old plan',
      showExplain: true,
      sqlResultFilters: [{ id: 'local-value', column: 'value', operator: 'equals', value: 42, execution: 'client' }],
      seriesVisibility: { old: false }
    })

    render(<Sidebar />)
    fireEvent.click(screen.getByText('Database B'))

    await waitFor(() => expect(selectActiveSession(useStore.getState()).connectionProfileId).toBe('profile-b'))
    const session = selectActiveSession(useStore.getState())
    expect(session.sql).toBe('select keep_this_draft;')
    expect(session.result).toBeNull()
    expect(session.pendingResult).toBeNull()
    expect(session.queryError).toBeNull()
    expect(session.explainText).toBeNull()
    expect(session.showExplain).toBe(false)
    expect(session.sqlResultFilters).toEqual([])
    expect(session.seriesVisibility).toEqual({})
    expect(disconnect).toHaveBeenCalledWith('profile-a', 1)
    expect(connect).toHaveBeenCalledWith(profiles[1])
  })
})
