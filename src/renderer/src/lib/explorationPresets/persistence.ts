import { queryLanguageForSourceKind, type DataSourceKind } from '@shared/types'
import type { SavedExplorationPreset } from './types'
import { equalQueryLanguages, finiteTimestamp, isRecord, nonEmptyString, parseQueryLanguage } from './validation'

export const PRESET_STORAGE_KEY = 'datakoala.presets.v1'
const ENVELOPE_VERSION = 1
const SOURCE_KINDS: readonly DataSourceKind[] = ['postgres', 'local-files', 'sqlite-file', 'bigquery', 'prometheus', 'loki', 'tempo']

export interface PresetStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Envelope { version: 1; presets: SavedExplorationPreset[] }

export function parseSavedExplorationPreset(value: unknown): SavedExplorationPreset | null {
  if (!isRecord(value) || value.version !== 1 || value.payloadVersion !== 1 || !nonEmptyString(value.id) || !nonEmptyString(value.name) || value.name !== value.name.trim() || !nonEmptyString(value.connectionProfileId) || !SOURCE_KINDS.includes(value.sourceKind as DataSourceKind) || !finiteTimestamp(value.createdAt) || !finiteTimestamp(value.updatedAt) || value.updatedAt < value.createdAt || !Object.hasOwn(value, 'payload')) return null
  const queryLanguage = parseQueryLanguage(value.queryLanguage)
  const sourceKind = value.sourceKind as DataSourceKind
  if (!queryLanguage || !equalQueryLanguages(queryLanguage, queryLanguageForSourceKind(sourceKind))) return null
  return { id: value.id, version: 1, name: value.name, connectionProfileId: value.connectionProfileId, sourceKind, queryLanguage, payloadVersion: 1, payload: value.payload, createdAt: value.createdAt, updatedAt: value.updatedAt }
}

export class ExplorationPresetRepository {
  constructor(private readonly storage: PresetStorage, private readonly now: () => number = Date.now) {}

  loadAll(): SavedExplorationPreset[] {
    const serialized = this.storage.getItem(PRESET_STORAGE_KEY)
    if (!serialized) return []
    try {
      const envelope: unknown = JSON.parse(serialized)
      if (!isRecord(envelope) || envelope.version !== ENVELOPE_VERSION || !Array.isArray(envelope.presets)) return []
      const seen = new Set<string>()
      return envelope.presets.flatMap((candidate) => {
        const preset = parseSavedExplorationPreset(candidate)
        if (!preset || seen.has(preset.id)) return []
        seen.add(preset.id)
        return [preset]
      })
    } catch { return [] }
  }

  listForConnection(connectionProfileId: string): SavedExplorationPreset[] { return this.loadAll().filter((preset) => preset.connectionProfileId === connectionProfileId) }
  get(id: string): SavedExplorationPreset | null { return this.loadAll().find((preset) => preset.id === id) ?? null }

  create<T>(preset: SavedExplorationPreset<T>): SavedExplorationPreset<T> {
    const parsed = parseSavedExplorationPreset(preset)
    if (!parsed) throw new Error('Cannot persist an invalid exploration preset.')
    const presets = this.loadAll()
    if (presets.some((item) => item.id === preset.id)) throw new Error(`An exploration preset with ID "${preset.id}" already exists.`)
    this.write([...presets, parsed])
    return preset
  }
  save<T>(preset: SavedExplorationPreset<T>): SavedExplorationPreset<T> { return this.create(preset) }

  rename(id: string, name: string): SavedExplorationPreset | null {
    const normalized = name.trim()
    if (!normalized) return null
    const presets = this.loadAll(), index = presets.findIndex((preset) => preset.id === id)
    if (index < 0) return null
    presets[index] = { ...presets[index], name: normalized, updatedAt: Math.max(this.now(), presets[index].createdAt) }
    this.write(presets)
    return presets[index]
  }

  delete(id: string): boolean {
    const presets = this.loadAll(), remaining = presets.filter((preset) => preset.id !== id)
    if (remaining.length === presets.length) return false
    this.write(remaining)
    return true
  }

  private write(presets: SavedExplorationPreset[]): void {
    const envelope: Envelope = { version: 1, presets }
    this.storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(envelope))
  }
}
