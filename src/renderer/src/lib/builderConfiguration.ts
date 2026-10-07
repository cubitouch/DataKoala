import type { AiBuilderState } from '@shared/ai'
import { SEVEN_DAYS } from '@shared/builderTimeRange'
import type { QuerySession } from '@store/useStore'
import {
  clearedBuilderFiltersMessage,
  transitionBuilderState,
} from './builderTransitions.ts'

export interface BuilderConfigurationTransition {
  builder: QuerySession['builder']
  builderVisualization: QuerySession['builderVisualization']
  builderResultFilters: QuerySession['builderResultFilters']
  queryFilterRevision: QuerySession['queryFilterRevision']
  removedDescriptions: string[]
}

export function normalizedAiBuilderState(
  session: Pick<QuerySession, 'builder' | 'builderVisualization'>,
): AiBuilderState | null {
  if (!session.builder.table) return null
  const aggregation =
    session.builderVisualization.valueColumn === 'count' &&
    session.builderVisualization.aggregation === 'sum'
      ? 'count'
      : session.builderVisualization.aggregation
  const xColumn =
    session.builderVisualization.xColumn === 'time_bucket'
      ? session.builder.timeColumn
      : session.builderVisualization.xColumn
  const valueColumn =
    aggregation === 'count' ? null : session.builderVisualization.valueColumn
  return {
    relation: { ...session.builder.table },
    xColumn,
    valueColumn,
    aggregation,
    timeColumn: session.builder.timeColumn,
    timeBucket: session.builder.timeBucket,
    ...(session.builder.timeColumn
      ? { timeRange: session.builder.timeRange ?? SEVEN_DAYS }
      : {}),
  }
}

const sameState = (a: AiBuilderState | null, b: AiBuilderState | null) =>
  JSON.stringify(a) === JSON.stringify(b)

export const aiBuilderStatesEqual = sameState

export function transitionBuilderConfiguration(
  session: Pick<
    QuerySession,
    | 'builder'
    | 'builderVisualization'
    | 'builderResultFilters'
    | 'queryFilterRevision'
  >,
  target: AiBuilderState,
): BuilderConfigurationTransition {
  const current = normalizedAiBuilderState(session)
  if (
    !current ||
    current.relation.schema !== target.relation.schema ||
    current.relation.name !== target.relation.name
  )
    throw new Error('Builder relation changed before the proposal was applied.')

  const nextSeries = session.builder.seriesColumns.filter(
    (column) => column !== target.xColumn && column !== target.valueColumn,
  )
  const transition = transitionBuilderState(session, {
    timeColumn: target.timeColumn,
    timeBucket: target.timeBucket,
    timeRange: target.timeColumn ? (target.timeRange ?? SEVEN_DAYS) : undefined,
    seriesColumns: nextSeries,
  })

  const xChanged = current.xColumn !== target.xColumn
  const metricChanged =
    current.valueColumn !== target.valueColumn ||
    current.aggregation !== target.aggregation
  const additionallyRemoved = transition.builderResultFilters.filter(
    (filter) =>
      (xChanged &&
        (filter.column === 'time_bucket' ||
          filter.column === current.xColumn ||
          filter.provenance?.sourceColumn === current.xColumn)) ||
      (metricChanged &&
        (filter.column === 'count' || filter.column === 'value')),
  )
  const removedIds = new Set(additionallyRemoved.map((filter) => filter.id))
  const builderResultFilters = transition.builderResultFilters.filter(
    (filter) => !removedIds.has(filter.id),
  )
  const queryFilterRevision = additionallyRemoved.some(
    (filter) => filter.execution === 'query',
  )
    ? {
        ...transition.queryFilterRevision!,
        builder: (transition.queryFilterRevision?.builder ?? 0) + 1,
      }
    : (transition.queryFilterRevision ?? session.queryFilterRevision)

  const removedDescriptions = [...transition.removedDescriptions]
  if (nextSeries.length !== session.builder.seriesColumns.length)
    removedDescriptions.push(
      'Removed Series columns that conflict with the proposed X or Y axis.',
    )
  if (additionallyRemoved.length)
    removedDescriptions.push(
      'Cleared result filters tied to Builder fields changed by the proposal.',
    )

  return {
    builder: transition.builder,
    builderVisualization: {
      ...session.builderVisualization,
      xColumn: target.xColumn,
      valueColumn: target.aggregation === 'count' ? null : target.valueColumn,
      aggregation: target.aggregation,
      seriesColumn: null,
      seriesColumns: nextSeries,
    },
    builderResultFilters,
    queryFilterRevision,
    removedDescriptions,
  }
}

export function transitionNotice(
  transition: BuilderConfigurationTransition,
): string | null {
  return clearedBuilderFiltersMessage(transition.removedDescriptions)
}
