import { describe, expect, it } from 'vitest'
import { ExplorationPresetRepository, PRESET_STORAGE_KEY, parseSavedExplorationPreset, type PresetStorage } from './persistence'
import type { SavedExplorationPreset } from './types'

class MemoryStorage implements PresetStorage {
  values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}
const preset = (overrides: Partial<SavedExplorationPreset> = {}): SavedExplorationPreset => ({
  id: 'one', version: 1, name: 'Errors', connectionProfileId: 'connection-a', sourceKind: 'postgres', queryLanguage: { kind: 'sql', dialect: 'postgres' }, payloadVersion: 1,
  payload: { intentionally: 'opaque', futureShape: [1, 2] }, createdAt: 10, updatedAt: 10, ...overrides
})

describe('ExplorationPresetRepository', () => {
  it('handles empty, malformed, and unsupported envelopes', () => {
    const storage = new MemoryStorage(), repository = new ExplorationPresetRepository(storage)
    expect(repository.loadAll()).toEqual([])
    storage.setItem(PRESET_STORAGE_KEY, '{nope')
    expect(repository.loadAll()).toEqual([])
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ version: 2, presets: [preset()] }))
    expect(repository.loadAll()).toEqual([])
  })

  it('round-trips multiple opaque payloads and lists by connection', () => {
    const storage = new MemoryStorage(), repository = new ExplorationPresetRepository(storage)
    repository.create(preset())
    repository.save(preset({ id: 'two', connectionProfileId: 'connection-b', createdAt: 20, updatedAt: 20 }))
    expect(repository.loadAll()).toHaveLength(2)
    expect(repository.listForConnection('connection-a')).toEqual([preset()])
    expect(repository.get('one')).toEqual(preset())
    expect(repository.get('missing')).toBeNull()
  })

  it('renames and deletes without changing identity or creation time', () => {
    const storage = new MemoryStorage(), repository = new ExplorationPresetRepository(storage, () => 50)
    repository.create(preset())
    expect(repository.rename('one', '  New name  ')).toMatchObject({ id: 'one', name: 'New name', createdAt: 10, updatedAt: 50 })
    expect(repository.rename('one', '   ')).toBeNull()
    expect(repository.delete('missing')).toBe(false)
    expect(repository.delete('one')).toBe(true)
    expect(repository.loadAll()).toEqual([])
  })

  it('isolates malformed records and deterministically rejects duplicate IDs', () => {
    const storage = new MemoryStorage(), repository = new ExplorationPresetRepository(storage)
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ version: 1, presets: [
      preset(), preset({ id: '', name: '' }), preset({ id: 'one', name: 'duplicate' }), preset({ id: 'two', createdAt: Number.NaN })
    ] }))
    expect(repository.loadAll()).toEqual([preset()])
  })

  it.each([
    { name: '' }, { connectionProfileId: '' }, { sourceKind: 'unknown' }, { queryLanguage: { kind: 'logql' } },
    { createdAt: -1 }, { updatedAt: Number.POSITIVE_INFINITY }, { version: 2 }, { payloadVersion: 2 }
  ])('rejects malformed records: %o', (override) => expect(parseSavedExplorationPreset({ ...preset(), ...override })).toBeNull())
})
