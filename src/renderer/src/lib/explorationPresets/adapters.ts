import type { DataSourceKind } from '@shared/types'
import type { ExplorationPresetAdapter } from './types'
import { sqlPresetAdapter } from './sqlPresetAdapter'
import { prometheusPresetAdapter } from './prometheusPresetAdapter'
import { lokiPresetAdapter } from './lokiPresetAdapter'
import { tempoPresetAdapter } from './tempoPresetAdapter'

export const PRESET_ADAPTERS = {
  postgres: sqlPresetAdapter,
  'local-files': sqlPresetAdapter,
  'sqlite-file': sqlPresetAdapter,
  bigquery: sqlPresetAdapter,
  prometheus: prometheusPresetAdapter,
  loki: lokiPresetAdapter,
  tempo: tempoPresetAdapter
} satisfies Record<DataSourceKind, ExplorationPresetAdapter<unknown>>

export function presetAdapterForSourceKind(kind: DataSourceKind): ExplorationPresetAdapter<unknown> {
  return PRESET_ADAPTERS[kind] as ExplorationPresetAdapter<unknown>
}
