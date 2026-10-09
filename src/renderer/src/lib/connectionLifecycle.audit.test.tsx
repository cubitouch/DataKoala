// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BigQueryProfile, ConnectResult, TableInfo } from '@shared/types'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  reconnect: vi.fn(),
  disconnect: vi.fn(async () => undefined),
  listObjects: vi.fn(),
}))
vi.mock('./api', () => ({ api: { connections: mocks } }))

import { createQuerySession, useStore } from '@store/useStore'
import { resetTestStore } from '@test/sessionTestUtils'
import { ensureConnectionForTab } from './tabConnection'

const profile = (id: string): BigQueryProfile => ({
  kind: 'bigquery',
  version: 1,
  id,
  name: id,
  billingProject: 'billing',
  maximumBytesBilled: '1073741824',
  readonly: true,
})
const success = (generation: number) => ({
  ok: true as const,
  id: 'a',
  generation,
  serverVersion: `version-${generation}`,
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
const tabA = createQuerySession(1, { id: 'tab-a', connectionProfileId: 'a' })
const tabB = createQuerySession(2, { id: 'tab-b', connectionProfileId: 'b' })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.listObjects.mockResolvedValue([])
  mocks.disconnect.mockResolvedValue(undefined)
  resetTestStore({
    profiles: [profile('a'), profile('b')],
    tabs: [tabA, tabB],
    activeTabId: tabA.id,
    connectionStateByProfileId: {
      a: {
        status: 'disconnected',
        generation: 0,
        error: null,
        serverVersion: null,
      },
      b: {
        status: 'connected',
        generation: 2,
        error: null,
        serverVersion: 'B',
      },
    },
    metadataByProfileId: {
      b: { schemas: [], status: 'loaded', error: null, isStale: false },
    },
  })
})
afterEach(() => {
  resetTestStore()
  vi.restoreAllMocks()
})

function expectBUnchanged(before = tabB) {
  expect(useStore.getState().tabs.find((tab) => tab.id === tabB.id)).toEqual(
    before,
  )
  expect(useStore.getState().connectionStateByProfileId.b).toEqual({
    status: 'connected',
    generation: 2,
    error: null,
    serverVersion: 'B',
  })
  expect(useStore.getState().metadataByProfileId.b).toEqual({
    schemas: [],
    status: 'loaded',
    error: null,
    isStale: false,
  })
}

describe('connection lifecycle consolidation safeguards', () => {
  it('ignores a rejected older lazy request after explicit success on the same profile', async () => {
    const older = deferred<ConnectResult>()
    mocks.connect
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(success(2))
    const lazy = ensureConnectionForTab(tabA.id)
    await useStore.getState().connectProfile(profile('a'))
    older.reject(new Error('late transport failure'))
    expect(await lazy).toBeNull()
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 2,
      error: null,
    })
  })

  it('reuses the newer generation when an older lazy success arrives without disconnecting it', async () => {
    const older = deferred<ConnectResult>()
    mocks.connect
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(success(2))
    const lazy = ensureConnectionForTab(tabA.id)
    await useStore.getState().connectProfile(profile('a'))
    older.resolve(success(1))
    expect(await lazy).toBe('a')
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 2,
      serverVersion: 'version-2',
    })
    expect(mocks.disconnect).not.toHaveBeenCalled()
    expect(mocks.listObjects).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'] as const)(
    'ignores an older explicit %s after a newer lazy connection succeeds',
    async (outcome) => {
      const older = deferred<ConnectResult>()
      mocks.connect
        .mockReturnValueOnce(older.promise)
        .mockResolvedValueOnce(success(2))
      const explicit = useStore.getState().connectProfile(profile('a'))
      // A main-process disconnect event permits on-demand recovery while the IPC response is delayed.
      useStore.getState().applyConnectionEvent({
        profileId: 'a',
        generation: 0,
        state: 'disconnected',
        expected: true,
        code: null,
        message: 'Disconnected',
        timestamp: 1,
        recoverable: true,
        recoverability: 'transient',
        source: 'test',
        activeOperationAffected: false,
      })
      expect(await ensureConnectionForTab(tabA.id)).toBe('a')
      await vi.waitFor(() =>
        expect(useStore.getState().metadataByProfileId.a.status).toBe('loaded'),
      )
      const current = useStore.getState().connectionStateByProfileId.a
      older.resolve(
        outcome === 'success'
          ? success(1)
          : { ok: false, error: 'late failure' },
      )
      await explicit
      expect(useStore.getState().connectionStateByProfileId.a).toBe(current)
      expect(mocks.disconnect).not.toHaveBeenCalled()
      expect(mocks.listObjects).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects an older explicit failure before the newer attempt receives a generation', async () => {
    const older = deferred<ConnectResult>()
    const newer = deferred<ConnectResult>()
    mocks.connect
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const first = useStore.getState().connectProfile(profile('a'))
    const second = useStore.getState().connectProfile(profile('a'))
    older.resolve({ ok: false, error: 'superseded' })
    await first
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connecting',
      generation: 0,
      error: null,
    })
    newer.resolve(success(2))
    await second
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 2,
    })
  })

  it('scopes superseded explicit-success cleanup to the old generation', async () => {
    const older = deferred<ConnectResult>()
    mocks.connect
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(success(2))
    const first = useStore.getState().connectProfile(profile('a'))
    await useStore.getState().connectProfile(profile('a'))
    older.resolve(success(1))
    await first
    expect(mocks.disconnect).toHaveBeenCalledExactlyOnceWith('a', 1)
    expect(useStore.getState().connectionStateByProfileId.a).toMatchObject({
      status: 'connected',
      generation: 2,
    })
    expect(mocks.listObjects).toHaveBeenCalledTimes(1)
  })

  it.each(['failure', 'reconnect'] as const)(
    'keeps live B usable through A %s with equal profile generations',
    async (outcome) => {
      useStore.setState((state) => ({
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          a: { ...state.connectionStateByProfileId.a, generation: 2 },
        },
      }))
      mocks.connect.mockResolvedValue({ ok: false, error: 'A unavailable' })
      await useStore.getState().connectProfile(profile('a'))
      expect(useStore.getState().connectionStateByProfileId.a.status).toBe(
        'error',
      )
      if (outcome === 'reconnect') {
        mocks.reconnect.mockResolvedValue(success(2))
        await useStore.getState().reconnectActiveProfile('a')
        expect(mocks.reconnect).toHaveBeenCalledExactlyOnceWith(profile('a'))
        expect(
          useStore.getState().connectionStateByProfileId.a.generation,
        ).toBe(2)
      }
      expect(await ensureConnectionForTab(tabB.id)).toBe('b')
      expectBUnchanged()
      expect(mocks.disconnect).not.toHaveBeenCalled()
    },
  )

  it.each(['explicit', 'lazy'] as const)(
    'keeps %s completion on A after switching to tab B',
    async (entry) => {
      const request = deferred<ConnectResult>()
      mocks.connect.mockReturnValueOnce(request.promise)
      const attempt =
        entry === 'explicit'
          ? useStore.getState().connectProfile(profile('a'))
          : ensureConnectionForTab(tabA.id)
      useStore.setState({ activeTabId: tabB.id })
      request.resolve(success(2))
      await attempt
      await vi.waitFor(() =>
        expect(useStore.getState().metadataByProfileId.a.status).toBe('loaded'),
      )
      expect(useStore.getState().activeTabId).toBe(tabB.id)
      expectBUnchanged()
    },
  )

  for (const entry of ['explicit', 'lazy'] as const) {
    it.each(['success', 'error'] as const)(
      `discards stale ${entry} metadata %s without touching B`,
      async (outcome) => {
        const metadata = deferred<TableInfo[]>()
        mocks.connect.mockResolvedValue(success(1))
        mocks.listObjects.mockReturnValueOnce(metadata.promise)
        const attempt =
          entry === 'explicit'
            ? useStore.getState().connectProfile(profile('a'))
            : ensureConnectionForTab(tabA.id)
        await vi.waitFor(() =>
          expect(mocks.listObjects).toHaveBeenCalledWith('a'),
        )
        // A replacement can come through the other entry point or a main-process event.
        useStore.setState((state) => ({
          connectionStateByProfileId: {
            ...state.connectionStateByProfileId,
            a: {
              status: 'connected',
              generation: 2,
              error: null,
              serverVersion: 'new',
            },
          },
          metadataByProfileId: {
            ...state.metadataByProfileId,
            a: { schemas: [], status: 'loaded', error: null, isStale: false },
          },
        }))
        const replacement = useStore.getState().metadataByProfileId.a
        if (outcome === 'success')
          metadata.resolve([{ schema: 'public', name: 'stale', kind: 'r' }])
        else metadata.reject(new Error('stale metadata error'))
        await attempt
        // Drain the detached lazy metadata callback as well as the awaited explicit path.
        await Promise.resolve()
        await Promise.resolve()
        expect(useStore.getState().metadataByProfileId.a).toBe(replacement)
        expectBUnchanged()
      },
    )
  }

  it.each([false, true])(
    'characterizes background A confirmation against running active B (accept=%s)',
    async (accept) => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(accept)
      const runningB = { ...tabB, running: true }
      useStore.setState({ tabs: [tabA, runningB], activeTabId: tabB.id })
      mocks.connect.mockResolvedValue(success(2))
      const connected = await ensureConnectionForTab(tabA.id)
      expect(confirm).toHaveBeenCalledExactlyOnceWith(
        'A query is still running on the current connection. Running this action on another connection will stop it. Continue?',
      )
      expect(useStore.getState().activeTabId).toBe(tabB.id)
      expectBUnchanged(runningB)
      expect(mocks.disconnect).not.toHaveBeenCalled()
      if (accept) {
        expect(connected).toBe('a')
        expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(profile('a'))
        await vi.waitFor(() =>
          expect(useStore.getState().metadataByProfileId.a.status).toBe(
            'loaded',
          ),
        )
      } else {
        // Declining B's warning blocks A's unrelated work before its status changes.
        expect(connected).toBeNull()
        expect(mocks.connect).not.toHaveBeenCalled()
        expect(useStore.getState().connectionStateByProfileId.a.status).toBe(
          'disconnected',
        )
      }
    },
  )

  it('bypasses the unrelated active-tab interruption prompt when the caller opts out', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const runningB = { ...tabB, running: true }
    useStore.setState({ tabs: [tabA, runningB], activeTabId: tabB.id })
    mocks.connect.mockResolvedValue(success(2))
    expect(
      await ensureConnectionForTab(tabA.id, { confirmInterrupt: false }),
    ).toBe('a')
    expect(confirm).not.toHaveBeenCalled()
    expectBUnchanged(runningB)
    expect(useStore.getState().activeTabId).toBe(tabB.id)
    expect(mocks.disconnect).not.toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(useStore.getState().metadataByProfileId.a.status).toBe('loaded'),
    )
  })

  it('does not open a session while hydration has not established connection state', async () => {
    useStore.setState({ connectionStateByProfileId: {} })
    expect(await ensureConnectionForTab(tabA.id)).toBeNull()
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(useStore.getState().connectionStateByProfileId.a).toBeUndefined()
  })

  it('returns null to another lazy caller while connecting, then permits retry after failure', async () => {
    const first = deferred<ConnectResult>()
    mocks.connect
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(success(2))
    const pending = ensureConnectionForTab(tabA.id)
    expect(await ensureConnectionForTab(tabA.id)).toBeNull()
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    first.resolve({ ok: false, error: 'offline' })
    await pending
    expect(await ensureConnectionForTab(tabA.id)).toBe('a')
    expect(mocks.connect).toHaveBeenCalledTimes(2)
  })
})
