import { ExplorationPresetRepository } from './explorationPresets'

/** The application-owned preset repository. Presets deliberately remain outside Zustand. */
export function explorationPresetRepository(): ExplorationPresetRepository {
  return new ExplorationPresetRepository(window.localStorage)
}
