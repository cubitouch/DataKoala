// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionProfile } from '@shared/types'

const profiles: ConnectionProfile[] = ['a', 'b'].map((id) => ({
  kind: 'postgres',
  version: 2,
  id,
  name: id.toUpperCase(),
  host: 'localhost',
  port: 5432,
  database: 'test',
  user: 'test',
  password: '',
  tlsMode: 'disable',
  readonly: true,
}))

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function setup(
  connect: ReturnType<typeof vi.fn>,
  disconnect = vi.fn(async () => undefined),
) {
  vi.resetModules()
  Object.defineProperty(window, 'datakoala', {
    configurable: true,
    value: {
      connections: {
        connect,
        reconnect: connect,
        disconnect,
        listObjects: vi.fn(async () => []),
      },
      smokeMode: false,
    },
  })
  const module = await import('./useStore')
  const { useStore, selectActiveSession } = module
  const active = selectActiveSession(useStore.getState())
  useStore.setState({
    profiles,
    tabs: [{ ...active, connectionProfileId: 'a' }],
  })
  return { ...module, disconnect }
}

describe('profile-scoped reconnect attempts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps a successful A reconnect live in the background after switching to B', async () => {
    const request = deferred<any>()
    const connect = vi.fn(() => request.promise)
    const { useStore, disconnect, selectActiveSession } = await setup(connect)
    const reconnect = useStore.getState().reconnectActiveProfile('a')
    useStore.getState().setActive('b')
    request.resolve({ ok: true, serverVersion: '16-a', generation: 7, id: 'a' })
    await reconnect
    expect(selectActiveSession(useStore.getState()).connectionProfileId).toBe(
      'b',
    )
    expect(disconnect).not.toHaveBeenCalled()
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 7,
    })
  })

  it('allows a new profile attempt while stale A is pending and A cannot overwrite it', async () => {
    const a = deferred<any>()
    const b = deferred<any>()
    const connect = vi
      .fn()
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise)
    const { useStore, disconnect, selectActiveSession } = await setup(connect)
    const attemptA = useStore.getState().reconnectActiveProfile('a')
    useStore.getState().setActive('b')
    const attemptB = useStore.getState().reconnectActiveProfile('b')
    b.resolve({ ok: true, serverVersion: '16-b', generation: 22, id: 'b' })
    await attemptB
    a.resolve({ ok: true, serverVersion: '16-a', generation: 11, id: 'a' })
    await attemptA
    expect(selectActiveSession(useStore.getState()).connectionProfileId).toBe(
      'b',
    )
    expect(disconnect).not.toHaveBeenCalled()
    expect(useStore.getState().connectionStateByProfileId).toMatchObject({
      a: { status: 'connected', generation: 11 },
      b: { status: 'connected', generation: 22 },
    })
  })

  it('does not show a stale A failure on B', async () => {
    const request = deferred<any>()
    const { useStore, selectActiveSession } = await setup(
      vi.fn(() => request.promise),
    )
    const reconnect = useStore.getState().reconnectActiveProfile('a')
    useStore.getState().setActive('b')
    request.reject(new Error('A authentication failed'))
    await reconnect
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'error',
      error: 'A authentication failed',
    })
    expect(selectActiveSession(useStore.getState()).connectionProfileId).toBe(
      'b',
    )
  })

  it('deduplicates repeated reconnect entry-point calls', async () => {
    const request = deferred<any>()
    const connect = vi.fn(() => request.promise)
    const { useStore } = await setup(connect)
    const first = useStore.getState().reconnectActiveProfile('a')
    const second = useStore.getState().reconnectActiveProfile('a')
    expect(connect).toHaveBeenCalledTimes(1)
    request.resolve({ ok: false, error: 'offline', id: 'a' })
    await Promise.all([first, second])
  })

  it('treats Idle as usable without making retained tab data or metadata stale', async () => {
    const { useStore, selectActiveSession } = await setup(vi.fn())
    const result = { columns: [], rows: [], rowCount: 0, durationMs: 1 }
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        a: {
          status: 'connected',
          generation: 4,
          error: null,
          serverVersion: '16.4',
        },
      },
      metadataByProfileId: {
        ...state.metadataByProfileId,
        a: { schemas: [], status: 'loaded', error: null, isStale: false },
      },
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, connectionProfileId: 'a', result, isResultStale: false }
          : tab,
      ),
    }))
    useStore.getState().applyConnectionEvent({
      profileId: 'a',
      generation: 4,
      state: 'idle',
      expected: false,
      code: null,
      message: 'Idle',
      timestamp: 1,
      recoverable: true,
      recoverability: 'transient',
      source: 'pool:idle-client-error',
      activeOperationAffected: false,
    })
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'idle',
      generation: 4,
      serverVersion: '16.4',
    })
    expect(selectActiveSession(useStore.getState()).isResultStale).toBe(false)
    expect(useStore.getState().metadataByProfileId.a.isStale).toBe(false)
  })

  it('ignores delayed events per profile without coupling equal generations', async () => {
    const { useStore } = await setup(vi.fn())
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        a: {
          status: 'connected',
          generation: 1,
          error: null,
          serverVersion: '16-a',
        },
        b: {
          status: 'connected',
          generation: 1,
          error: null,
          serverVersion: '16-b',
        },
      },
      tabs: [
        { ...state.tabs[0], id: 'tab-a', connectionProfileId: 'a' },
        { ...state.tabs[0], id: 'tab-b', connectionProfileId: 'b' },
      ],
    }))
    const event = (
      profileId: string,
      generation: number,
      eventState: 'reconnecting' | 'failed',
    ) => ({
      profileId,
      generation,
      state: eventState,
      expected: false,
      code: null,
      message: eventState,
      timestamp: generation,
      recoverable: true,
      recoverability: 'transient' as const,
      source: 'test',
      activeOperationAffected: false,
    })

    useStore.getState().applyConnectionEvent(event('a', 2, 'reconnecting'))
    useStore.getState().applyConnectionEvent(event('a', 1, 'failed'))
    expect(useStore.getState().connectionStateByProfileId).toMatchObject({
      a: { status: 'reconnecting', generation: 2 },
      b: { status: 'connected', generation: 1 },
    })

    useStore.getState().applyConnectionEvent(event('b', 2, 'failed'))
    expect(useStore.getState().connectionStateByProfileId).toMatchObject({
      a: { status: 'reconnecting', generation: 2 },
      b: { status: 'error', generation: 2, error: 'failed' },
    })
  })
})
