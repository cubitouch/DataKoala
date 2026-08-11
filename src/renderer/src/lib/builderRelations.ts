import type { DatabaseColumnNode, DatabaseRelationNode, DatabaseSchemaNode } from '@shared/types'
import type { VisualizationConfiguration } from './resultVisualization.ts'
import type { BuilderQueryState } from '../store/useStore'

/** A collision-safe identity for a relation (qualified names are not collision-safe). */
export function relationIdentity(relation: { schema: string; name: string }): string {
  return JSON.stringify([relation.schema, relation.name])
}

export function relationsForSchema(schemas: DatabaseSchemaNode[], schemaName: string): DatabaseRelationNode[] {
  return schemas.find((schema) => schema.name === schemaName)?.relations ?? []
}

/**
 * Loaded metadata is also eligible here because choosing a relation must reconcile
 * its cached columns with Builder state immediately. Callers that already hold the
 * cached columns may skip the server describe and apply them directly.
 */
export function canLoadRelationColumns(status: DatabaseRelationNode['columnsStatus'], explicitRetry = false): boolean {
  return status === 'idle' || status === 'loaded' || (status === 'error' && explicitRetry)
}

type BuilderRelationState = {
  builder: BuilderQueryState
  builderHasRun: boolean
  builderVisualization?: VisualizationConfiguration
}

export function selectBuilderRelationState<T extends BuilderRelationState>(
  state: T,
  table: NonNullable<BuilderQueryState['table']>
): T {
  if (state.builder.table && relationIdentity(state.builder.table) === relationIdentity(table)) return state
  const visualization = state.builderVisualization
    ? { ...state.builderVisualization, xColumn: null, valueColumn: null, aggregation: 'count' as const, seriesColumn: null, seriesColumns: [] }
    : undefined
  return {
    ...state,
    builder: { ...state.builder, table, timeColumn: null, timeBucket: 'day', timeRange: undefined, seriesColumns: [] },
    builderHasRun: false,
    ...(visualization ? { builderVisualization: visualization } : {})
  }
}

/**
 * Reconcile relation-dependent Builder state after column metadata loads.
 * `timeColumn` is the independent time-filter source; the X axis lives in the
 * Builder visualization configuration and is validated separately by BuilderPanel.
 * A missing/invalid time-filter source is cleared rather than silently replaced so
 * the user can choose the intended timestamp/date column explicitly.
 */
export function selectionPatchForColumns(
  requested: { schema: string; name: string },
  selected: BuilderQueryState['table'],
  builder: BuilderQueryState,
  columns: DatabaseColumnNode[],
  isTimeColumn: (column: DatabaseColumnNode) => boolean
): Partial<BuilderQueryState> | null {
  if (!selected || relationIdentity(requested) !== relationIdentity(selected)) return null
  const timeColumn = builder.timeColumn && columns.some((column) => column.name === builder.timeColumn && isTimeColumn(column))
    ? builder.timeColumn
    : null
  return {
    timeColumn,
    timeRange: timeColumn ? builder.timeRange : undefined,
    seriesColumns: builder.seriesColumns.filter((selectedColumn) => columns.some((column) => column.name === selectedColumn))
  }
}
