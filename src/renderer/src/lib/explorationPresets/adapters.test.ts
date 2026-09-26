import { describe, expect, it } from 'vitest'
import type { DataSourceKind, DataSourceProfile } from '@shared/types'
import { PRESET_ADAPTERS } from './adapters'
import { applyPresetToSession, createPresetFromSession } from './createPreset'
import { testSession } from './testUtils'

const kinds: DataSourceKind[] = ['postgres', 'local-files', 'sqlite-file', 'bigquery', 'prometheus', 'loki', 'tempo']
const profile = (kind: DataSourceKind, id = 'profile'): DataSourceProfile => ({ id, kind, name: kind, version: 1, readonly: true } as DataSourceProfile)

describe('preset adapter registry and orchestration', () => {
  it('has an adapter for every supported datasource', () => {
    expect(Object.keys(PRESET_ADAPTERS).sort()).toEqual([...kinds].sort())
    for (const kind of kinds) expect(PRESET_ADAPTERS[kind]).toMatchObject({ capture: expect.any(Function), parse: expect.any(Function), apply: expect.any(Function) })
  })

  it.each(kinds)('creates and applies a valid %s preset without changing session identity', (kind) => {
    const source = testSession({ connectionProfileId: 'profile', sql: `query for ${kind}` })
    const target = testSession({ id: 'target', title: 'Target', connectionProfileId: 'profile', sql: 'old' })
    const preset = createPresetFromSession({ name: ' Saved ', profile: profile(kind), session: source, id: 'preset', now: () => 123 })
    const result = applyPresetToSession({ preset, profile: profile(kind), session: target })
    expect(preset).toMatchObject({ id: 'preset', name: 'Saved', sourceKind: kind, createdAt: 123, updatedAt: 123 })
    expect(result).toMatchObject({ ok: true, session: { id: 'target', title: 'Target', connectionProfileId: 'profile', sql: `query for ${kind}` } })
  })

  it('returns typed failures for incompatible connections and corrupt payloads', () => {
    const source = testSession({ connectionProfileId: 'profile' }), p = profile('postgres')
    const preset = createPresetFromSession({ name: 'x', profile: p, session: source, id: 'x' })
    expect(applyPresetToSession({ preset, profile: profile('postgres', 'other'), session: source })).toEqual({ ok: false, reason: 'incompatible' })
    expect(applyPresetToSession({ preset: { ...preset, payload: {} }, profile: p, session: source })).toEqual({ ok: false, reason: 'invalid-payload' })
  })
})
