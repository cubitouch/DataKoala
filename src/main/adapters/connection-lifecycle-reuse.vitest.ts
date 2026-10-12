import { afterEach, expect, it, vi } from 'vitest'
import type {
  BigQueryProfile,
  ConnectResult,
  DataSourceProfile,
} from '../../shared/types'
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

// Real SessionManager reuse must survive obsolete renderer response delivery.
it.each(['older-first', 'newer-first'] as const)(
  'preserves the reused session with %s IPC delivery using the real SessionManager',
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
    const otherClose = vi.fn(async () => undefined)
    const otherSession: DataSourceSession = {
      ...session,
      info: { profileId: 'other', provider: 'bigquery' },
      close: otherClose,
    }
    const adapter: DataSourceAdapter = {
      kind: 'bigquery',
      test: vi.fn(async () => ({ ok: true as const })),
      connect: vi.fn(async (value: DataSourceProfile) => ({
        result: { ok: true as const, generation: 7 },
        session: value.id === profile.id ? session : otherSession,
      })),
    }
    const manager = new SessionManager(new AdapterRegistry().register(adapter))
    try {
      const liveResult = await manager.connect(profile)
      await manager.connect({ ...profile, id: 'other' })
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
      expect(adapter.connect).toHaveBeenCalledTimes(2)
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
      expect(mocks.disconnect).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
      expect(otherClose).not.toHaveBeenCalled()
      expect(manager.get(profile.id)).toBe(session)
      expect(manager.get('other')).toBe(otherSession)
      expect(manager.listLive()).toEqual([
        { id: profile.id, generation: 7, serverVersion: undefined },
        { id: 'other', generation: 7, serverVersion: undefined },
      ])
      await manager.get(profile.id)!.query({ sql: 'select 1' })
      expect(useStore.getState().connectionStateByProfileId.same).toMatchObject(
        { status: 'connected', generation: 7 },
      )
    } finally {
      await manager.disconnectAll()
    }
  },
)
