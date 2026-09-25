import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), listObjects: vi.fn() }))
vi.mock('./api', () => ({ api: { connections: {
  refreshMetadata: mocks.refresh,
  listObjects: mocks.listObjects
} } }))

import { createQuerySession, useStore } from '@store/useStore'

const oldSchemas = [{ name: 'public', isSystem: false, relations: [{ schema: 'public', name: 'old_table', qualifiedName: 'public.old_table', kind: 'r' as const, columnsStatus: 'idle' as const }] }]

function connectedState() {
  const tab = createQuerySession(1, { connectionProfileId: 'profile-a', sql: 'select 42' })
  useStore.setState({
    ...useStore.getInitialState(), activeProfileId: 'profile-a', connected: true, connectionGeneration: 7,
    tabs: [{ ...tab, result: { columns: [], rows: [], rowCount: 0, durationMs: 1 } }], activeTabId: tab.id,
    metadataByProfileId: { 'profile-a': { schemas: oldSchemas, status: 'loaded', error: null, isStale: false } }
  }, true)
}

afterEach(() => { vi.clearAllMocks(); connectedState() })

it('atomically replaces top-level metadata while leaving editor, result, and session state unchanged', async () => {
  connectedState()
  mocks.refresh.mockResolvedValue(undefined)
  mocks.listObjects.mockResolvedValue([{ schema: 'public', name: 'new_table', kind: 'r' }])
  const before = useStore.getState().tabs[0]
  await useStore.getState().refreshMetadata('profile-a')
  const state = useStore.getState()
  expect(state.metadataByProfileId['profile-a'].schemas[0].relations[0].name).toBe('new_table')
  expect(state.metadataByProfileId['profile-a'].revision).toBe(1)
  expect(state.tabs[0]).toEqual(before)
  expect(state.connected).toBe(true)
  expect(state.connectionGeneration).toBe(7)
})

it('keeps previous metadata after failure and permits a retry', async () => {
  connectedState()
  mocks.refresh.mockRejectedValueOnce(new Error('discovery unavailable')).mockResolvedValueOnce(undefined)
  mocks.listObjects.mockResolvedValue([{ schema: 'public', name: 'new_table', kind: 'r' }])
  await useStore.getState().refreshMetadata('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a']).toMatchObject({ schemas: oldSchemas, refreshing: false, refreshError: 'discovery unavailable' })
  expect(useStore.getState().metadataByProfileId['profile-a'].revision).toBeUndefined()
  await useStore.getState().refreshMetadata('profile-a')
  expect(useStore.getState().metadataByProfileId['profile-a'].schemas[0].relations[0].name).toBe('new_table')
})

it('deduplicates concurrent refreshes for one profile', async () => {
  connectedState()
  let resolve!: () => void
  mocks.refresh.mockReturnValue(new Promise<void>((done) => { resolve = done }))
  mocks.listObjects.mockResolvedValue([])
  const first = useStore.getState().refreshMetadata('profile-a')
  const second = useStore.getState().refreshMetadata('profile-a')
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
  resolve()
  await Promise.all([first, second])
  expect(mocks.listObjects).toHaveBeenCalledTimes(1)
})

it('discards metadata that resolves after the live connection generation changes', async () => {
  connectedState()
  let resolveObjects!: (objects: Array<{ schema: string; name: string; kind: 'r' }>) => void
  mocks.refresh.mockResolvedValue(undefined)
  mocks.listObjects.mockReturnValue(new Promise((done) => { resolveObjects = done }))
  const pending = useStore.getState().refreshMetadata('profile-a')
  await vi.waitFor(() => expect(mocks.listObjects).toHaveBeenCalled())
  useStore.setState({ activeProfileId: 'profile-b', connectionGeneration: 8 })
  resolveObjects([{ schema: 'public', name: 'stale_table', kind: 'r' }])
  await pending
  expect(useStore.getState().metadataByProfileId['profile-a'].schemas).toEqual(oldSchemas)
  expect(useStore.getState().metadataByProfileId['profile-b']).toBeUndefined()
})