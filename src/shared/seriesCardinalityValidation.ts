import {
  MAX_SERIES_PROBE_COLUMNS,
  MAX_SERIES_PROBE_PREDICATES,
  type CardinalityProbePredicate,
  type SeriesCardinalityProbeRequest,
  type SeriesStatisticsRequest
} from './chartLimits.ts'

const MAX_CONNECTION_ID_LENGTH = 512
const MAX_IDENTIFIER_LENGTH = 256
const MAX_TIMESTAMP_LENGTH = 512

function controlledError(message: string): never {
  throw new Error(`Invalid series cardinality request: ${message}`)
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) controlledError(`${field} must be a non-empty bounded string.`)
  return value
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) controlledError('payload must be an object.')
  return value as Record<string, unknown>
}

function scalar(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return controlledError('predicate value must be a finite scalar or null.')
}

function predicate(value: unknown, index: number): CardinalityProbePredicate {
  const input = record(value)
  const column = requiredString(input.column, `predicates[${index}].column`, MAX_IDENTIFIER_LENGTH)
  const operator = input.operator
  const temporalType = input.temporalType === 'date' || input.temporalType === 'datetime' || input.temporalType === 'timestamp' ? input.temporalType : undefined
  if (operator === 'isNull' || operator === 'isNotNull') return { column, operator }
  if (operator === 'equals' || operator === 'notEquals') {
    if (!Object.prototype.hasOwnProperty.call(input, 'value')) controlledError(`predicates[${index}].value is required.`)
    return { column, operator, value: scalar(input.value) }
  }
  if (operator === 'range') {
    return {
      column,
      operator,
      startInclusive: requiredString(input.startInclusive, `predicates[${index}].startInclusive`, MAX_IDENTIFIER_LENGTH),
      endExclusive: requiredString(input.endExclusive, `predicates[${index}].endExclusive`, MAX_IDENTIFIER_LENGTH),
      ...(temporalType ? { temporalType } : {})
    }
  }
  if (operator === 'gte' || operator === 'lt') {
    return {
      column,
      operator,
      value: requiredString(input.value, `predicates[${index}].value`, MAX_TIMESTAMP_LENGTH), ...(temporalType ? { temporalType } : {})
    }
  }
  if (operator === 'rolling') {
    const amount = input.amount
    const unit = input.unit
    const valid = (unit === 'hour' && (amount === 1 || amount === 6 || amount === 12 || amount === 24)) ||
      (unit === 'day' && (amount === 7 || amount === 30)) ||
      (unit === 'month' && (amount === 3 || amount === 6 || amount === 12))
    if (!valid) controlledError(`predicates[${index}] must use an allowed rolling amount and unit.`)
    // Reconstruct the predicate so additional untrusted properties never cross IPC.
    return { column, operator, amount: amount as 1 | 3 | 6 | 7 | 12 | 24 | 30, unit, ...(temporalType ? { temporalType } : {}) }
  }
  return controlledError(`predicates[${index}].operator is unsupported.`)
}

export function validateConnectionId(value: unknown): string {
  return requiredString(value, 'connection/profile ID', MAX_CONNECTION_ID_LENGTH)
}

export function validateSeriesCardinalityRequest(value: unknown): SeriesCardinalityProbeRequest {
  const input = record(value)
  if (!Array.isArray(input.seriesColumns) || input.seriesColumns.length === 0 || input.seriesColumns.length > MAX_SERIES_PROBE_COLUMNS) {
    controlledError(`seriesColumns must contain 1-${MAX_SERIES_PROBE_COLUMNS} identifiers.`)
  }
  if (!Array.isArray(input.predicates) || input.predicates.length > MAX_SERIES_PROBE_PREDICATES) {
    controlledError(`predicates must be an array with at most ${MAX_SERIES_PROBE_PREDICATES} entries.`)
  }
  return {
    schema: requiredString(input.schema, 'schema', MAX_IDENTIFIER_LENGTH),
    table: requiredString(input.table, 'table', MAX_IDENTIFIER_LENGTH),
    seriesColumns: input.seriesColumns.map((column, index) => requiredString(column, `seriesColumns[${index}]`, MAX_IDENTIFIER_LENGTH)),
    predicates: input.predicates.map(predicate)
  }
}

export function validateSeriesStatisticsRequest(value: unknown): SeriesStatisticsRequest {
  const input = record(value)
  return {
    schema: requiredString(input.schema, 'schema', MAX_IDENTIFIER_LENGTH),
    table: requiredString(input.table, 'table', MAX_IDENTIFIER_LENGTH),
    column: requiredString(input.column, 'column', MAX_IDENTIFIER_LENGTH)
  }
}
