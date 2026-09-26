import { queryLanguageForSourceKind, type DataSourceProfile } from '@shared/types'
import type { SavedExplorationPreset } from './types'
import { equalQueryLanguages } from './validation'

export function isPresetCompatibleWithConnection(preset: SavedExplorationPreset, profile: Pick<DataSourceProfile, 'id' | 'kind'>): boolean {
  return preset.connectionProfileId === profile.id && preset.sourceKind === profile.kind && equalQueryLanguages(preset.queryLanguage, queryLanguageForSourceKind(profile.kind))
}

