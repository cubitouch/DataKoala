import {
  type AiBuilderColumnContext,
  type AiBuilderPatch,
  type AiBuilderState,
} from './ai.ts'
import { isBuilderTemporalDataType } from './builderCapabilities.ts'
import { SEVEN_DAYS } from './builderTimeRange.ts'

const hasPatchField = (
  patch: AiBuilderPatch,
  field: keyof AiBuilderPatch,
): boolean => Object.prototype.hasOwnProperty.call(patch, field)

export function materializeAiBuilderTargetState(
  state: AiBuilderState,
  patch: AiBuilderPatch,
  columns: readonly AiBuilderColumnContext[],
): AiBuilderState {
  const target: AiBuilderState = { ...state, ...patch }
  const dataType = new Map(
    columns.map((column) => [column.name, column.dataType]),
  )

  if (
    hasPatchField(patch, 'valueColumn') &&
    !hasPatchField(patch, 'aggregation')
  ) {
    if (patch.valueColumn === null) target.aggregation = 'count'
    else if (patch.valueColumn && state.aggregation === 'count')
      target.aggregation = 'sum'
  }
  if (patch.aggregation === 'count') target.valueColumn = null

  const minimalXConflict =
    hasPatchField(patch, 'xColumn') &&
    patch.xColumn !== null &&
    patch.xColumn !== state.xColumn &&
    patch.xColumn === state.valueColumn &&
    !hasPatchField(patch, 'valueColumn') &&
    !hasPatchField(patch, 'aggregation')
  if (minimalXConflict) {
    target.valueColumn = null
    target.aggregation = 'count'
  }

  if (hasPatchField(patch, 'xColumn') && patch.xColumn !== state.xColumn) {
    const previousTemporal = state.xColumn
      ? isBuilderTemporalDataType(dataType.get(state.xColumn))
      : false
    const nextTemporal = patch.xColumn
      ? isBuilderTemporalDataType(dataType.get(patch.xColumn))
      : false

    if (
      !hasPatchField(patch, 'timeBucket') &&
      (!nextTemporal || !previousTemporal)
    )
      target.timeBucket = 'day'

    if (
      nextTemporal &&
      patch.xColumn &&
      !state.timeColumn &&
      !hasPatchField(patch, 'timeColumn')
    ) {
      target.timeColumn = patch.xColumn
      if (!hasPatchField(patch, 'timeRange'))
        target.timeRange = state.timeRange ?? SEVEN_DAYS
    }
  }

  if (hasPatchField(patch, 'timeColumn')) {
    if (patch.timeColumn === null) delete target.timeRange
    else if (!target.timeRange) target.timeRange = SEVEN_DAYS
  }

  if (target.aggregation === 'count') target.valueColumn = null
  if (!target.timeColumn) delete target.timeRange
  return target
}
