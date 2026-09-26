import type { DataSourceKind, QueryLanguage } from '@shared/types'
import type { QuerySession } from '@store/useStore'

export const PRESET_RECORD_VERSION = 1 as const
export const PRESET_PAYLOAD_VERSION = 1 as const

export interface SavedExplorationPreset<TPayload = unknown> {
  id: string
  version: typeof PRESET_RECORD_VERSION
  name: string
  connectionProfileId: string
  sourceKind: DataSourceKind
  queryLanguage: QueryLanguage
  payloadVersion: typeof PRESET_PAYLOAD_VERSION
  payload: TPayload
  createdAt: number
  updatedAt: number
}

export interface ExplorationPresetAdapter<TPayload = unknown> {
  capture(session: QuerySession): TPayload
  parse(value: unknown): TPayload | null
  apply(session: QuerySession, payload: TPayload): QuerySession
}
