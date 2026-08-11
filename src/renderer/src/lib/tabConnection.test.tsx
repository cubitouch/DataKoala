// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionProfile, QueryResult } from '@shared/types'

const { connect, disconnect, listObjects } = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(async () => undefined),
  listObjects: vi.fn(async () => [])
}))
vi.mock('./api', () => ({
  api: {
    connections: {
      connect,
      disconnect,
      list: vi.fn(async () => []),
      listObjects
    }
  }
}))

import { bindTabConnection, ensureConnectionForTab } from './tabConnection'
import { selectActiveSession, useStore } from '../store/useStore'
import { patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

const profiles: ConnectionProfile[] = [
  { kind: 'postgres', version: 1, id: 'profile-a', name: 'A', host: 'a', port: 5432, database: 'a', user: 'reader', password: '', ssl: false, readonly: true },
  { kind: 'postgres', version: 1, id: 'profile-b', name: 'B', host: 'b', port: 5432, database: 'b', user: 'reader', password: '', ssl: false, readonly: true }
]
const result: QueryResult = {
  columns: [{ name: 'value', dataTypeID: 23, dataTypeName: 'int4' }], rows: [{ value: 1 }], rowCount: 1, durationMs: 1
}

beforeEach(() => {
  connect.mockImplementation(async (profile: ConnectionProfile) => ({ ok: true as const, id: profile.id, generation: 2, serverVersion: '16' }))
})
afterEach(() => {
  resetTestStore()
  vi.clearAllMocks()
})

describe('tab connection lifecycle', () => {
  it('rebinding a tab clears result-derived state but preserves editable work and promoted Builder predicates', () => {
    resetTestStore({ profiles, activeProfileId: 'profile-a', connected: true, connectionStatus: 'connected' })
    patchActiveTestSession({
      connectionProfileId: 'profile-a',
      sql: 'select keep_me;',
      result,
      pendingResult: result,
      builderHasRun: true,
      explainText: 'old plan',
      sqlResultFilters: [{ id: 'local', column: 'value', operator: 'equals', value: 1, execution: 'client' }],
      builderResultFilters: [
        { id: 'promoted', column: 'country', operator: 'equals', value: 'FR', execution: 'query' },
        { id: 'client', column: 'device', operator: 'equals', value: 'mobile', execution: 'client' }
      ],
      seriesVisibility: { FR: false }
    })

    const id = useStore.getState().activeTabId
    bindTabConnection(id, 'profile-b')
    const session = selectActiveSession(useStore.getState())
    expect(session.connectionProfileId).toBe('profile-b')
    expect(session.sql).toBe('select keep_me;')
    expect(session.result).toBeNull()
    expect(session.pendingResult).toBeNull()
    expect(session.builderHasRun).toBe(false)
    expect(session.explainText).toBeNull()
    expect(session.sqlResultFilters).toEqual([])
    expect(session.builderResultFilters.map((filter) => filter.id)).toEqual(['promoted'])
    expect(session.seriesVisibility).toEqual({})
  })

  it('activates the tab connection only when requested and replaces the previous live pool', async () => {
    resetTestStore({ profiles, activeProfileId: 'profile-a', connected: true, connectionStatus: 'connected', connectionGeneration: 1 })
    const id = useStore.getState().activeTabId
    patchActiveTestSession({ connectionProfileId: 'profile-b' })

    const profileId = await ensureConnectionForTab(id)

    expect(profileId).toBe('profile-b')
    expect(disconnect).toHaveBeenCalledWith('profile-a', 1)
    expect(connect).toHaveBeenCalledWith(profiles[1])
    expect(useStore.getState().activeProfileId).toBe('profile-b')
    expect(useStore.getState().connected).toBe(true)
  })

  it('reuses an already-live matching pool without reconnecting', async () => {
    resetTestStore({ profiles, activeProfileId: 'profile-a', connected: true, connectionStatus: 'connected' })
    const id = useStore.getState().activeTabId
    patchActiveTestSession({ connectionProfileId: 'profile-a' })

    expect(await ensureConnectionForTab(id)).toBe('profile-a')
    expect(connect).not.toHaveBeenCalled()
    expect(disconnect).not.toHaveBeenCalled()
  })
})
