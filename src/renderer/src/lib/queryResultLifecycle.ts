import type { QueryResult } from '../../../shared/types.ts'

export interface QueryResultLifecycleState {
  result: QueryResult | null
  pendingResult: QueryResult | null
  resultRevision: number
  running: boolean
  queryError: string | null
}

export function startQueryState(state: QueryResultLifecycleState): QueryResultLifecycleState {
  return { ...state, running: true, pendingResult: null, queryError: null }
}

export function deliverQueryResultState(state: QueryResultLifecycleState, result: QueryResult): QueryResultLifecycleState {
  if (state.running) return { ...state, pendingResult: result, queryError: null }
  return { ...state, result, resultRevision: state.resultRevision + 1, queryError: null }
}

export function completeQueryState(state: QueryResultLifecycleState, result: QueryResult | null, error: string | null): QueryResultLifecycleState {
  return {
    ...state, running: false, pendingResult: null, result: result ?? state.result,
    resultRevision: result ? state.resultRevision + 1 : state.resultRevision,
    queryError: error
  }
}

export function stopQueryState(state: QueryResultLifecycleState): QueryResultLifecycleState {
  return state.pendingResult
    ? completeQueryState(state, state.pendingResult, null)
    : { ...state, running: false }
}
