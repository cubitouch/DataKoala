import {
  DatabaseConnectionError,
  QueryValidationError,
} from './adapters/postgres.ts'
import type { QueryFailureKind } from '../shared/types.ts'

export function queryFailureKind(error: unknown): QueryFailureKind {
  if (error instanceof DatabaseConnectionError) return 'connection'
  if (error instanceof QueryValidationError) return 'validation'
  return 'query'
}

export function queryFailureMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The query could not be completed. Please try again.'
}
