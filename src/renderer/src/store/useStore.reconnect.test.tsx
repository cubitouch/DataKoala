// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionProfile } from '@shared/types'

const profiles: ConnectionProfile[] = ['a', 'b'].map((id) => ({ kind: 'postgres', version: 1, id, name: id.toUpperCase(), host: 'localhost',
  port: 5432, database: 'test', user: 'test', password: '', ssl: false, readonly: true }))

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function setup(connect: ReturnType<typeof vi.fn>, disconnect = vi.fn(async () => undefined)) {
  vi.resetModules()
  Object.defineProperty(window, 'datakoala', { configurable: true, value: {
    connections: { connect, disconnect, listObjects: vi.fn(async () => []) }, smokeMode: false
  } })
  const module = await import('./useStore')
  const { useStore, selectActiveSession } = module
  const active = selectActiveSession(useStore.getState())
  useStore.setState({
    profiles,
    activeProfileId: 'a',
    connected: false,
    connecting: false,
    connectionStatus: 'error',
    connectionError: 'lost',
    reconnectAttemptId: 0,
    activeReconnectAttempt: null,
    tabs: [{ ...active, connectionProfileId: 'a' }]
  })
  return { ...module, disconnect }
}

describe('profile-scoped reconnect attempts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('does not apply A success after switching to B and cleans only A generation', async () => {
    const request = deferred<any>()
    const connect = vi.fn(() => request.promise)
    const { useStore, disconnect } = await setup(connect)
    const reconnect = useStore.getState().reconnectActiveProfile()
    useStore.getState().setActive('b')
    request.resolve({ ok: true, serverVersion: '16-a', generation: 7, id: 'a' })
    await reconnect
    expect(useStore.getState()).toMatchObject({ activeProfileId: 'b', connected: false,
      connectionStatus: 'disconnected', serverVersion: null, connectionError: null })
    expect(disconnect).toHaveBeenCalledWith('a', 7)
  })

  it('allows a new profile attempt while stale A is pending and A cannot overwrite it', async () => {
    const a = deferred<any>(); const b = deferred<any>()
    const connect = vi.fn().mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    const { useStore, disconnect } = await setup(connect)
    const attemptA = useStore.getState().reconnectActiveProfile()
    useStore.getState().setActive('b')
    const attemptB = useStore.getState().reconnectActiveProfile()
    b.resolve({ ok: true, serverVersion: '16-b', generation: 22, id: 'b' }); await attemptB
    a.resolve({ ok: true, serverVersion: '16-a', generation: 11, id: 'a' }); await attemptA
    expect(useStore.getState()).toMatchObject({ activeProfileId: 'b', connected: true,
      connectionStatus: 'connected', serverVersion: '16-b', connectionGeneration: 22 })
    expect(disconnect).toHaveBeenCalledWith('a', 11)
  })

  it('does not show a stale A failure on B', async () => {
    const request = deferred<any>()
    const { useStore } = await setup(vi.fn(() => request.promise))
    const reconnect = useStore.getState().reconnectActiveProfile()
    useStore.getState().setActive('b')
    request.reject(new Error('A authentication failed'))
    await reconnect
    expect(useStore.getState()).toMatchObject({ activeProfileId: 'b', connectionError: null,
      connectionStatus: 'disconnected' })
  })

  it('deduplicates repeated reconnect entry-point calls', async () => {
    const request = deferred<any>(); const connect = vi.fn(() => request.promise)
    const { useStore } = await setup(connect)
    const first = useStore.getState().reconnectActiveProfile()
    const second = useStore.getState().reconnectActiveProfile()
    expect(connect).toHaveBeenCalledTimes(1)
    request.resolve({ ok: false, error: 'offline', id: 'a' })
    await Promise.all([first, second])
  })

  it('treats Idle as usable without making retained tab data or metadata stale', async () => {
    const { useStore, selectActiveSession } = await setup(vi.fn())
    const result = { columns: [], rows: [], rowCount: 0, durationMs: 1 }
    useStore.setState((state) => ({
      activeProfileId: 'a',
      connectionGeneration: 4,
      serverVersion: '16.4',
      metadataByProfileId: { ...state.metadataByProfileId, a: { schemas: [], status: 'loaded', error: null, isStale: false } },
      tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, connectionProfileId: 'a', result, isResultStale: false } : tab)
    }))
    useStore.getState().applyConnectionEvent({ profileId: 'a', generation: 4, state: 'idle', expected: false,
      code: null, message: 'Idle', timestamp: 1, recoverable: true, recoverability: 'transient',
      source: 'pool:idle-client-error', activeOperationAffected: false })
    expect(useStore.getState()).toMatchObject({ connected: true, connecting: false, connectionStatus: 'idle', connectionError: null, serverVersion: '16.4' })
    expect(selectActiveSession(useStore.getState()).isResultStale).toBe(false)
    expect(useStore.getState().metadataByProfileId.a.isStale).toBe(false)
  })
})
