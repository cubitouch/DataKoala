import { queryLanguageForSourceKind, type DataSourceProfile } from '@shared/types'
import type { QuerySession } from '@store/useStore'
import { presetAdapterForSourceKind } from './adapters'
import { isPresetCompatibleWithConnection } from './compatibility'
import type { SavedExplorationPreset } from './types'

interface CreateOptions { name: string; profile: DataSourceProfile; session: QuerySession; now?: () => number; id?: string | (() => string) }

export function createPresetFromSession({ name, profile, session, now = Date.now, id }: CreateOptions): SavedExplorationPreset {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error('Preset name must not be empty.')
  if (session.connectionProfileId !== profile.id) throw new Error('The query session is not attached to the supplied connection.')
  const timestamp = now()
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('Preset timestamp must be a non-negative finite number.')
  const presetId = typeof id === 'function' ? id() : id ?? globalThis.crypto.randomUUID()
  if (!presetId.trim()) throw new Error('Preset ID must not be empty.')
  return { id: presetId, version: 1, name: normalizedName, connectionProfileId: profile.id, sourceKind: profile.kind, queryLanguage: queryLanguageForSourceKind(profile.kind), payloadVersion: 1, payload: presetAdapterForSourceKind(profile.kind).capture(session), createdAt: timestamp, updatedAt: timestamp }
}

export type ApplyPresetResult = { ok: true; session: QuerySession } | { ok: false; reason: 'incompatible' | 'invalid-payload' }
export function applyPresetToSession({ preset, profile, session }: { preset: SavedExplorationPreset; profile: DataSourceProfile; session: QuerySession }): ApplyPresetResult {
  if (!isPresetCompatibleWithConnection(preset, profile) || session.connectionProfileId !== profile.id) return { ok: false, reason: 'incompatible' }
  const adapter = presetAdapterForSourceKind(profile.kind), payload = adapter.parse(preset.payload)
  return payload === null ? { ok: false, reason: 'invalid-payload' } : { ok: true, session: adapter.apply(session, payload) }
}

