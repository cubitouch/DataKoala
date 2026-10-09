import { afterEach, expect, it, vi } from 'vitest'
import type { BigQueryProfile, ConnectResult } from '../../shared/types'
import type { DataSourceAdapter, DataSourceSession } from '../data-source'
import { AdapterRegistry } from '../data-source'
import { SessionManager } from '../db'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  listObjects: vi.fn(async () => []),
}))
vi.mock('@lib/api', () => ({ api: { connections: mocks } }))

import { useStore } from '@store/useStore'
import { resetTestStore } from '@test/sessionTestUtils'

const profile: BigQueryProfile = {
  id: 'same',
  name: 'Same',
  version: 1,
  kind: 'bigquery',
  billingProject: 'billing',
  maximumBytesBilled: '1073741824',
  readonly: true,
}
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
afterEach(() => {
  resetTestStore()
  vi.resetAllMocks()
})

// Passing characterization of an unsafe current behavior; Slice 2 must change
// the final absence assertion to preservation after fixing stale cleanup.
it.each(['older-first', 'newer-first'] as const)(
  'characterizes shared-generation cleanup with %s IPC delivery using the real SessionManager',
  async (order) => {
    mocks.listObjects.mockResolvedValue([])
    const close = vi.fn(async () => undefined)
    const session: DataSourceSession = {
      info: { profileId: profile.id, provider: 'bigquery' },
      capabilities: { explain: false, analyze: false },
      query: vi.fn(async () => ({
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: 0,
      })),
      listNamespaces: vi.fn(async () => []),
      listRelations: vi.fn(async () => []),
      describeRelation: vi.fn(async () => []),
      close,
    }
    const adapter: DataSourceAdapter = {
      kind: 'bigquery',
      test: vi.fn(async () => ({ ok: true as const })),
      connect: vi.fn(async () => ({
        result: { ok: true as const, generation: 7 },
        session,
      })),
    }
    const manager = new SessionManager(new AdapterRegistry().register(adapter))
    try {
      const liveResult = await manager.connect(profile)
      const olderReady = deferred<ConnectResult>()
      const newerReady = deferred<ConnectResult>()
      const releaseOlder = deferred<void>()
      const releaseNewer = deferred<void>()
      // Keep the real reuse/disconnect semantics; only IPC delivery timing is controlled.
      mocks.connect
        .mockImplementationOnce(async () => {
          const result = await manager.connect(profile)
          olderReady.resolve(result)
          await releaseOlder.promise
          return { ...result, id: profile.id }
        })
        .mockImplementationOnce(async () => {
          const result = await manager.connect(profile)
          newerReady.resolve(result)
          await releaseNewer.promise
          return { ...result, id: profile.id }
        })
      mocks.disconnect.mockImplementation((id: string, generation: number) =>
        manager.disconnect(id, generation),
      )
      resetTestStore({
        profiles: [profile],
        connectionStateByProfileId: {
          same: {
            status: 'connected',
            generation: 7,
            error: null,
            serverVersion: null,
          },
        },
      })
      const older = useStore.getState().connectProfile(profile)
      expect(await olderReady.promise).toBe(liveResult)
      const newer = useStore.getState().connectProfile(profile)
      expect(await newerReady.promise).toBe(liveResult)
      expect(adapter.connect).toHaveBeenCalledTimes(1)
      if (order === 'newer-first') {
        releaseNewer.resolve()
        await newer
        expect(manager.get(profile.id)).toBe(session)
      }
      releaseOlder.resolve()
      await older
      if (order === 'older-first') {
        expect(useStore.getState().connectionStateByProfileId.same.status).toBe(
          'connecting',
        )
        releaseNewer.resolve()
        await newer
      }
      expect(mocks.disconnect).toHaveBeenCalledExactlyOnceWith(profile.id, 7)
      expect(close).toHaveBeenCalledTimes(1)
      expect(manager.get(profile.id)).toBeUndefined()
      expect(manager.listLive()).toEqual([])
      expect(useStore.getState().connectionStateByProfileId.same).toMatchObject(
        { status: 'connected', generation: 7 },
      )
    } finally {
      await manager.disconnectAll()
    }
  },
)
