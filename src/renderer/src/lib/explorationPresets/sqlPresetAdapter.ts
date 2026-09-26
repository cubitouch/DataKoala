import type { BuilderQueryState, QueryMode } from '@store/useStore'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import type { ExplorationPresetAdapter } from './types'
import { clone, isRecord, parseBuilder, parseQueryMode, parseVisualization } from './validation'

export interface SqlPresetPayload {
  queryMode: QueryMode
  sql: string
  builder: BuilderQueryState
  sqlVisualization: VisualizationConfiguration
  builderVisualization: VisualizationConfiguration
}

export const sqlPresetAdapter: ExplorationPresetAdapter<SqlPresetPayload> = {
  capture: (session) => clone({ queryMode: session.queryMode, sql: session.sql, builder: session.builder, sqlVisualization: session.sqlVisualization, builderVisualization: session.builderVisualization }),
  parse(value) {
    if (!isRecord(value) || typeof value.sql !== 'string') return null
    const queryMode = parseQueryMode(value.queryMode), builder = parseBuilder(value.builder)
    const sqlVisualization = parseVisualization(value.sqlVisualization), builderVisualization = parseVisualization(value.builderVisualization)
    return queryMode && builder && sqlVisualization && builderVisualization ? clone({ queryMode, sql: value.sql, builder, sqlVisualization, builderVisualization }) : null
  },
  apply: (session, payload) => ({ ...session, ...clone(payload) })
}

