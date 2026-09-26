import type { BuilderQueryState, QueryMode } from '@store/useStore'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import { deserializeResultFilters, type ResultFilter } from '@lib/resultFilters'
import type { ExplorationPresetAdapter } from './types'
import { clone, isRecord, parseBuilder, parseQueryMode, parseVisualization } from './validation'

export interface SqlPresetPayload {
  queryMode: QueryMode
  sql: string
  builder: BuilderQueryState
  sqlVisualization: VisualizationConfiguration
  builderVisualization: VisualizationConfiguration
  builderQueryFilters: ResultFilter[]
}

function parseBuilderQueryFilters(value: unknown): ResultFilter[] | null {
  if (!Array.isArray(value)) return null
  try {
    const filters = deserializeResultFilters(JSON.stringify(value))
    return filters.length === value.length && filters.every((filter) => filter.execution === 'query') ? filters : null
  } catch {
    return null
  }
}

export const sqlPresetAdapter: ExplorationPresetAdapter<SqlPresetPayload> = {
  capture: (session) => clone({
    queryMode: session.queryMode,
    sql: session.sql,
    builder: session.builder,
    sqlVisualization: session.sqlVisualization,
    builderVisualization: session.builderVisualization,
    builderQueryFilters: session.builderResultFilters.filter((filter) => filter.execution === 'query')
  }),
  parse(value) {
    if (!isRecord(value) || typeof value.sql !== 'string') return null
    const queryMode = parseQueryMode(value.queryMode), builder = parseBuilder(value.builder)
    const sqlVisualization = parseVisualization(value.sqlVisualization), builderVisualization = parseVisualization(value.builderVisualization)
    const builderQueryFilters = parseBuilderQueryFilters(value.builderQueryFilters)
    if (!builderQueryFilters) return null
    return queryMode && builder && sqlVisualization && builderVisualization ? clone({ queryMode, sql: value.sql, builder, sqlVisualization, builderVisualization, builderQueryFilters }) : null
  },
  apply(session, payload) {
    const { builderQueryFilters, ...definition } = clone(payload)
    return { ...session, ...definition, builderResultFilters: [...session.builderResultFilters.filter((filter) => filter.execution !== 'query'), ...builderQueryFilters] }
  }
}
