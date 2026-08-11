import type { BuilderQueryState } from '../store/useStore'
import { compatibleTimeBucket, MINUTE_BUCKET_UNAVAILABLE_REASON, normalizeBuilderTimeRange } from './builderTimeRange.ts'
import { decodeBuilderSeriesTuple } from './resultVisualization.ts'
import type { ResultFilter } from './resultFilters'

export interface BuilderTransitionState {
  builder: BuilderQueryState
  builderResultFilters: ResultFilter[]
  queryFilterRevision?: { builder: number; sql: number }
}
export interface BuilderTransitionResult extends BuilderTransitionState { removedDescriptions: string[] }

const sameTable = (a: BuilderQueryState['table'], b: BuilderQueryState['table']) => a?.schema === b?.schema && a?.name === b?.name
const sameColumns = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index])
const seriesName = (columns: readonly string[]) => columns.join(' + ') || 'Series'

/**
 * Reconcile query-promoted filters when relation, time-filter or Series state changes.
 * X-axis transitions are handled by BuilderPanel because X lives in the visualization
 * configuration while `timeColumn` is now the independent dataset time-filter source.
 */
export function transitionBuilderState(state: BuilderTransitionState, patch: Partial<BuilderQueryState>): BuilderTransitionResult {
  let builder = { ...state.builder, ...patch }
  if (builder.timeRange) builder = { ...builder, timeRange: normalizeBuilderTimeRange(builder.timeRange) }
  const tableChanged = !sameTable(state.builder.table, builder.table)
  if (tableChanged) {
    builder = {
      ...builder,
      timeColumn: 'timeColumn' in patch ? builder.timeColumn : null,
      timeRange: 'timeRange' in patch ? builder.timeRange : undefined,
      timeBucket: 'timeBucket' in patch ? builder.timeBucket : 'day'
    }
  }

  let minuteFallback = false
  if (builder.timeRange) {
    const requestedBucket = builder.timeBucket
    const compatibleBucket = compatibleTimeBucket(requestedBucket, builder.timeRange)
    minuteFallback = requestedBucket === 'minute' && compatibleBucket !== requestedBucket
    if (minuteFallback) builder = { ...builder, timeBucket: compatibleBucket }
  }
  const timeBucketChanged = state.builder.timeBucket !== builder.timeBucket

  const removed: ResultFilter[] = []
  const builderResultFilters = state.builderResultFilters.filter((filter) => {
    if (tableChanged) { removed.push(filter); return false }
    if (filter.column === 'series') {
      const encoded = filter.operator === 'equals' || filter.operator === 'notEquals' ? ('value' in filter ? filter.value : undefined) : undefined
      const tuple = decodeBuilderSeriesTuple(encoded)
      const provenance = filter.provenance
      const compatible = Boolean(tuple) && (
        provenance?.targetKind === 'source-column'
          ? Boolean(provenance.sourceColumn && builder.seriesColumns.includes(provenance.sourceColumn) && sameColumns(tuple!.map((entry) => entry.column), [provenance.sourceColumn]))
          : provenance?.targetKind === 'series-tuple'
            ? sameColumns(provenance.sourceColumns, builder.seriesColumns) && sameColumns(tuple!.map((entry) => entry.column), builder.seriesColumns)
            : sameColumns(tuple!.map((entry) => entry.column), builder.seriesColumns)
      )
      if (!compatible) { removed.push(filter); return false }
      return true
    }
    const sourceColumn = filter.provenance?.targetKind === 'source-column' ? filter.provenance.sourceColumn : filter.column
    const isSeriesSource = Boolean(sourceColumn && state.builder.seriesColumns.includes(sourceColumn))
    if (isSeriesSource && !builder.seriesColumns.includes(sourceColumn!)) {
      removed.push(filter)
      return false
    }
    if (filter.column === 'time_bucket' && timeBucketChanged) {
      removed.push(filter)
      return false
    }
    return true
  })
  const hadPromoted = removed.some((filter) => filter.execution === 'query')
  const queryFilterRevision = hadPromoted && state.queryFilterRevision
    ? { ...state.queryFilterRevision, builder: state.queryFilterRevision.builder + 1 }
    : state.queryFilterRevision
  const removedDescriptions = removed.map((filter) => {
    if (tableChanged) return `Removed filter on ${filter.provenance?.sourceColumn || filter.column} because the table changed.`
    if (filter.column === 'series') {
      const encoded = filter.operator === 'equals' || filter.operator === 'notEquals' ? ('value' in filter ? filter.value : undefined) : undefined
      const tuple = decodeBuilderSeriesTuple(encoded)
      if (filter.provenance?.targetKind === 'source-column') {
        return `Removed filter on ${filter.provenance.sourceColumn || filter.provenance.displayLabel} because that Series column is no longer selected.`
      }
      return tuple
        ? `Removed filter on ${filter.provenance?.sourceColumns.join(' + ') || tuple.map((entry) => entry.column).join(' + ')} because the Series dimensions changed to ${seriesName(builder.seriesColumns)}.`
        : 'Removed a legacy combined Series filter because it cannot be mapped safely to the independent Series columns.'
    }
    if (filter.column === 'time_bucket') {
      return `Removed ${filter.provenance?.timeBucket || state.builder.timeBucket} filter because the Time bucket changed to ${builder.timeBucket}.`
    }
    return `Removed filter on ${filter.provenance?.sourceColumn || filter.column} because that Series column is no longer selected.`
  })
  if (minuteFallback) removedDescriptions.unshift(`Changed Time bucket to Hour. ${MINUTE_BUCKET_UNAVAILABLE_REASON}`)
  return { builder, builderResultFilters, queryFilterRevision, removedDescriptions }
}

export const clearedBuilderFiltersMessage = (descriptions: string[]): string | null => descriptions.length ? descriptions.join(' ') : null
