// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BigQueryProfile, ConnectResult, QueryResult } from '@shared/types'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  reconnect: vi.fn(),
  listObjects: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock('./api', () => ({ api: { connections: mocks } }))

import {
  beginQueryOperation,
  createQuerySession,
  isQueryOperationCurrent,
  selectSession,
  useStore,
} from '@store/useStore'
import { resetTestStore } from '@test/sessionTestUtils'
import {
  beginConnectedQueryOperation,
  bindTabConnection,
  ensureConnectionForTab,
} from './tabConnection'

const profile = (id: string): BigQueryProfile => ({
  kind: 'bigquery',
  version: 1,
  id,
  name: id,
  billingProject: 'synthetic-billing',
  maximumBytesBilled: '1073741824',
  readonly: true,
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const result = (value: string): QueryResult => ({
  columns: [{ name: 'value', type: 'text' }],
  rows: [{ value }],
  rowCount: 1,
  durationMs: 1,
})

const connection = (generation: number) => ({
  status: 'connected' as const,
  generation,
  error: null,
  serverVersion: 'synthetic',
})

const event = (generation: number) => ({
  profileId: 'a',
  generation,
  state: 'disconnected' as const,
  expected: true,
  code: null,
  message: 'Synthetic disconnect',
  timestamp: generation,
  recoverable: true,
  recoverability: 'transient' as const,
  source: 'NON-01',
  activeOperationAffected: true,
})

function tab(id: string) {
  return selectSession(useStore.getState(), id)!
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.listObjects.mockResolvedValue([])
  mocks.disconnect.mockResolvedValue(undefined)
  resetTestStore({
    profiles: [profile('a'), profile('b')],
    tabs: [
      createQuerySession(1, { id: 'tab-a', connectionProfileId: 'a' }),
      createQuerySession(2, { id: 'tab-b', connectionProfileId: 'b' }),
    ],
    activeTabId: 'tab-b',
    connectionStateByProfileId: {
      a: connection(4),
      b: connection(4),
    },
  })
})
afterEach(() => {
  resetTestStore()
  vi.restoreAllMocks()
})

describe('NON-01 generation and query ownership characterization', () => {
  it.each(['success', 'failure'] as const)(
    'discards generation A stale %s without changing B or a newer query',
    async (outcome) => {
      const old = deferred<QueryResult>()
      const first = beginQueryOperation('tab-a', 'a', 4)
      const concurrentB = beginQueryOperation('tab-b', 'b', 4)
      expect(first).not.toBeNull()
      expect(concurrentB).not.toBeNull()
      const completion = old.promise.then(
        (received) =>
          useStore.getState().completeQuery(received, null, 'tab-a', undefined, first!),
        (reason: Error) =>
          useStore.getState().completeQuery(null, reason.message, 'tab-a', undefined, first!),
      )
      useStore.setState((state) => ({
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          a: connection(5),
        },
      }))
      expect(isQueryOperationCurrent(useStore.getState(), first!)).toBe(false)
      expect(tab('tab-a').running).toBe(false)
      expect(tab('tab-a').queryOperation).toBeNull()
      expect(tab('tab-b').queryOperation?.token).toBe(concurrentB!.token)
      expect(tab('tab-b').running).toBe(true)

      const second = beginQueryOperation('tab-a', 'a', 5)
      expect(second).not.toBeNull()
      const beforeLate = tab('tab-a')
      if (outcome === 'success') old.resolve(result('stale'))
      else old.reject(new Error('stale failure'))
      await completion
      expect(tab('tab-a')).toBe(beforeLate)
      expect(tab('tab-b').queryOperation?.token).toBe(concurrentB!.token)
      useStore.getState().completeQuery(result('fresh'), null, 'tab-a', undefined, second!)
      expect(tab('tab-a').result).toEqual(result('fresh'))
      expect(tab('tab-a').queryError).toBeNull()
      expect(tab('tab-a').running).toBe(false)
    },
  )

  it('disconnects during a primary query, preserves stale data, rejects late completion and allows new generation', () => {
    useStore.getState().setResult(result('retained'), null, 'tab-a')
    const old = beginQueryOperation('tab-a', 'a', 4)!
    useStore.getState().applyConnectionEvent(event(4))
    expect(useStore.getState().connectionStateByProfileId.a.status).toBe('disconnected')
    expect(tab('tab-a')).toMatchObject({
      running: false,
      queryOperation: null,
      pendingResult: null,
      isResultStale: true,
    })
    useStore.getState().completeQuery(result('obsolete'), null, 'tab-a', undefined, old)
    expect(tab('tab-a').result).toEqual(result('retained'))
    expect(tab('tab-a').running).toBe(false)
    expect(useStore.getState().connectionStateByProfileId.b).toEqual(connection(4))
    useStore.setState((state) => ({
      connectionStateByProfileId: { ...state.connectionStateByProfileId, a: connection(5) },
    }))
    const next = beginQueryOperation('tab-a', 'a', 5)!
    useStore.getState().completeQuery(result('recovered'), null, 'tab-a', undefined, next)
    expect(tab('tab-a').result).toEqual(result('recovered'))
    expect(tab('tab-a').isResultStale).toBe(false)
  })

  it('rejects an awaited connection preflight after its tab was rebound away and back', async () => {
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        a: { ...connection(4), status: 'disconnected' },
      },
    }))
    const pending = deferred<ConnectResult>()
    mocks.connect.mockReturnValueOnce(pending.promise)
    const operation = beginConnectedQueryOperation('tab-a', 'a')
    bindTabConnection('tab-a', 'b')
    bindTabConnection('tab-a', 'a')
    pending.resolve({ ok: true, id: 'a', generation: 5 })
    expect(await operation).toBeNull()
    expect(tab('tab-a').queryOperation).toBeNull()
    expect(tab('tab-a').running).toBe(false)
    expect(tab('tab-b').connectionProfileId).toBe('b')
  })

  it('keeps B active while first activation of disconnected A connects on demand', async () => {
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        a: { ...connection(4), status: 'disconnected' },
      },
    }))
    const pending = deferred<ConnectResult>()
    mocks.connect.mockReturnValueOnce(pending.promise)
    const activation = useStore.getState().activateTab('tab-a')
    useStore.getState().activateTab('tab-b')
    expect(useStore.getState().activeTabId).toBe('tab-b')
    pending.resolve({ ok: true, id: 'a', generation: 5 })
    await activation
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(useStore.getState().activeTabId).toBe('tab-b')
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 5,
    })
    expect(useStore.getState().connectionStateByProfileId.b).toEqual(connection(4))
  })

  it('deduplicates concurrent reconnects, reports failure, then permits a successful retry', async () => {
    const first = deferred<ConnectResult>()
    mocks.reconnect.mockReturnValueOnce(first.promise).mockResolvedValueOnce({
      ok: true,
      id: 'a',
      generation: 5,
      serverVersion: 'new',
    })
    const pending = useStore.getState().reconnectActiveProfile('a')
    await useStore.getState().reconnectActiveProfile('a')
    expect(mocks.reconnect).toHaveBeenCalledTimes(1)
    first.resolve({ ok: false, error: 'synthetic auth rejection' })
    await pending
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'error',
      error: 'synthetic auth rejection',
      generation: 4,
    })
    await useStore.getState().reconnectActiveProfile('a')
    expect(mocks.reconnect).toHaveBeenCalledTimes(2)
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 5,
      error: null,
    })
    expect(useStore.getState().connectionStateByProfileId.b).toEqual(connection(4))
  })

  it('invalidates a primary token after profile rebind even when the original generation stays usable', () => {
    const first = beginQueryOperation('tab-a', 'a', 4)!
    bindTabConnection('tab-a', 'b')
    bindTabConnection('tab-a', 'a')
    expect(isQueryOperationCurrent(useStore.getState(), first)).toBe(false)
    useStore.getState().completeQuery(result('wrong-tab'), null, 'tab-a', undefined, first)
    expect(tab('tab-a').result).toBeNull()
    expect(tab('tab-a').running).toBe(false)
    expect(tab('tab-b').connectionProfileId).toBe('b')
  })

  it('does not connect a profile before hydration has established its state', async () => {
    useStore.setState({ connectionStateByProfileId: {} })
    expect(await ensureConnectionForTab('tab-a')).toBeNull()
    expect(mocks.connect).not.toHaveBeenCalled()
  })
})
