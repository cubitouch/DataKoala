import type { QueryFailureKind } from '../shared/types.ts'

export class ClassifiedQueryError extends Error {
  readonly kind: QueryFailureKind

  constructor(kind: QueryFailureKind, message: string) {
    super(message)
    this.name = 'ClassifiedQueryError'
    this.kind = kind
  }
}

export class QueryConnectionError extends ClassifiedQueryError {
  constructor(message: string) {
    super('connection', message)
    this.name = 'QueryConnectionError'
  }
}

export class QueryValidationError extends ClassifiedQueryError {
  constructor(message: string) {
    super('validation', message)
    this.name = 'QueryValidationError'
  }
}

export function queryFailureKind(error: unknown): QueryFailureKind {
  if (error instanceof ClassifiedQueryError) return error.kind
  return 'query'
}

export function queryFailureMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The query could not be completed. Please try again.'
}
