import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSourceKind, DataSourceProfile } from '@shared/types'
import { useStore } from '@store/useStore'
import { resetTestStore } from '@test/sessionTestUtils'
import { api } from './api'
import {
  applyPresetToSession,
  createPresetFromSession,
  ExplorationPresetRepository,
} from './explorationPresets'
import { testSession } from './explorationPresets/testUtils'
import {
  parseWorkspaceDraft,
  restoreWorkspaceDraft,
  serializeWorkspaceDraft,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceRestorePatch,
} from './workspacePersistence'

vi.mock('./api', () => ({
  api: {
    query: { run: vi.fn(), explain: vi.fn() },
    connections: { connect: vi.fn() },
  },
}))

const kinds: DataSourceKind[] = [
  'postgres',
  'bigquery',
  'local-files',
  'sqlite-file',
  'prometheus',
  'loki',
  'tempo',
]
const profile = (kind: DataSourceKind, id = 'profile'): DataSourceProfile =>
  ({ id, kind, name: kind, readonly: true, version: 1 }) as DataSourceProfile

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
}
function expectNoExecution() {
  expect(api.query.run).not.toHaveBeenCalled()
  expect(api.query.explain).not.toHaveBeenCalled()
  expect(api.connections.connect).not.toHaveBeenCalled()
}
afterEach(() => resetTestStore())

describe('NON-02 persistence boundaries', () => {
  it.each(kinds)(
    'persists, reads and commits a %s preset only to its target tab without execution',
    (kind) => {
      const p = profile(kind)
      const source = testSession({ sql: `saved ${kind}`, queryMode: 'builder' })
      const target = testSession({ id: 'target', sql: 'keep until load' })
      const other = testSession({ id: 'other', sql: 'unrelated' })
      resetTestStore({
        profiles: [p],
        tabs: [target, other],
        activeTabId: other.id,
      })
      const storage = memoryStorage()
      new ExplorationPresetRepository(storage).create(
        createPresetFromSession({
          name: 'saved',
          profile: p,
          session: source,
          id: 'preset',
          now: () => 1,
        }),
      )
      const preset = new ExplorationPresetRepository(storage).get('preset')!
      const result = applyPresetToSession({
        preset,
        profile: p,
        session: target,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Expected compatible preset')
      useStore.getState().commitLoadedPreset(result.session, target.id)
      expect(useStore.getState().tabs[0]).toMatchObject({
        id: target.id,
        title: target.title,
        connectionProfileId: p.id,
        sql: source.sql,
        queryMode: 'builder',
        running: false,
        result: null,
      })
      expect(useStore.getState().tabs[1]).toBe(other)
      expect(useStore.getState().activeTabId).toBe(other.id)
      expectNoExecution()
    },
  )

  it.each(kinds)(
    'rejects other-profile, cross-kind and malformed %s presets with exact input preservation',
    (kind) => {
      const source = testSession({ sql: 'saved' })
      const preset = createPresetFromSession({
        name: 'saved',
        profile: profile(kind),
        session: source,
      })
      const target = testSession({ sql: 'do not change', queryMode: 'builder' })
      const before = structuredClone(target)
      const wrongProfile = profile(kind, 'other')
      expect(
        applyPresetToSession({
          preset,
          profile: wrongProfile,
          session: target,
        }),
      ).toEqual({ ok: false, reason: 'incompatible' })
      for (const otherKind of kinds.filter((candidate) => candidate !== kind)) {
        expect(
          applyPresetToSession({
            preset,
            profile: profile(otherKind),
            session: target,
          }),
        ).toEqual({ ok: false, reason: 'incompatible' })
      }
      expect(
        applyPresetToSession({
          preset: { ...preset, payload: {} },
          profile: profile(kind),
          session: target,
        }),
      ).toEqual({ ok: false, reason: 'invalid-payload' })
      expect(target).toEqual(before)
      expect(source.sql).toBe('saved')
      expectNoExecution()
    },
  )

  it('restores orphaned and changed-kind references cold without modifying loaded profiles or other store state', () => {
    const a = testSession({
      id: 'a',
      connectionProfileId: 'deleted',
      sql: 'orphan draft',
    })
    const b = testSession({
      id: 'b',
      connectionProfileId: 'changed',
      sql: 'select old_sql',
    })
    const storage = memoryStorage()
    storage.setItem(
      WORKSPACE_STORAGE_KEY,
      serializeWorkspaceDraft({ tabs: [a, b], activeTabId: b.id }),
    )
    storage.setItem.mockClear()
    const profiles = [profile('tempo', 'changed')]
    const metadata = {}
    resetTestStore({ profiles, metadataByProfileId: metadata })
    restoreWorkspaceDraft((patch) => useStore.setState(patch), storage)
    const restored = useStore.getState()
    expect(
      restored.tabs.map((tab) => [tab.id, tab.connectionProfileId, tab.sql]),
    ).toEqual([
      ['a', 'deleted', 'orphan draft'],
      ['b', 'changed', 'select old_sql'],
    ])
    expect(restored.activeTabId).toBe('b')
    expect(restored.profiles).toBe(profiles)
    expect(restored.metadataByProfileId).toBe(metadata)
    expect(restored.connectionStateByProfileId).toEqual({})
    expect(storage.setItem).not.toHaveBeenCalled()
    expectNoExecution()
    restored.detachProfile('deleted')
    expect(useStore.getState().tabs[0]).toMatchObject({
      connectionProfileId: null,
      sql: 'orphan draft',
    })
    expect(useStore.getState().tabs[1]).toBe(restored.tabs[1])
  })

  it('rejects the complete workspace on one invalid required tab without patching unrelated valid state', () => {
    const storage = memoryStorage()
    const raw = JSON.parse(
      serializeWorkspaceDraft({
        tabs: [testSession({ id: 'a' }), testSession({ id: 'b' })],
        activeTabId: 'a',
      }),
    )
    raw.tabs[1].sql = 42
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(raw))
    storage.setItem.mockClear()
    const before = useStore.getState()
    const patch = vi.fn((value: WorkspaceRestorePatch) =>
      useStore.setState(value),
    )
    expect(restoreWorkspaceDraft(patch, storage)).toBeNull()
    expect(patch).not.toHaveBeenCalled()
    expect(useStore.getState()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
    expectNoExecution()
  })

  it.fails.each(['classic', 'native'] as const)(
    'NON02-01: preserves an explicit %s histogram override through workspace parse',
    (override) => {
      const tab = testSession()
      tab.promqlBuilder.histogramKindOverride = override
      const bytes = serializeWorkspaceDraft({
        tabs: [tab],
        activeTabId: tab.id,
      })
      expect(
        JSON.parse(bytes).tabs[0].promqlBuilder.histogramKindOverride,
      ).toBe(override)
      expect(
        parseWorkspaceDraft(bytes)?.tabs[0].promqlBuilder.histogramKindOverride,
      ).toBe(override)
    },
  )
})
