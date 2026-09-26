import { describe, expect, it } from 'vitest'
import type { DataSourceProfile } from '@shared/types'
import type { SavedExplorationPreset } from './types'
import { isPresetCompatibleWithConnection } from './compatibility'

const profile = { id: 'a', kind: 'postgres' } as DataSourceProfile
const value = { connectionProfileId: 'a', sourceKind: 'postgres', queryLanguage: { kind: 'sql', dialect: 'postgres' } } as SavedExplorationPreset

describe('isPresetCompatibleWithConnection', () => {
  it('requires connection identity, source kind, and exact language', () => {
    expect(isPresetCompatibleWithConnection(value, profile)).toBe(true)
    expect(isPresetCompatibleWithConnection({ ...value, connectionProfileId: 'b' }, profile)).toBe(false)
    expect(isPresetCompatibleWithConnection(value, { id: 'b', kind: 'postgres' } as DataSourceProfile)).toBe(false)
    expect(isPresetCompatibleWithConnection({ ...value, sourceKind: 'bigquery' }, profile)).toBe(false)
    expect(isPresetCompatibleWithConnection({ ...value, queryLanguage: { kind: 'sql', dialect: 'duckdb' } }, profile)).toBe(false)
  })
})
