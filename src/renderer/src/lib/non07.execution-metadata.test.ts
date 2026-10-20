import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { QueryResult } from '@shared/types.ts'
import {
  completeQueryState,
  deliverQueryResultState,
  startQueryState,
  stopQueryState,
  type QueryResultLifecycleState,
} from './queryResultLifecycle.ts'

function queryResult(
  bytesProcessed: number | undefined,
  cacheHit: boolean | undefined,
): QueryResult {
  return {
    columns: [],
    rows: [{ metric: 1 }],
    rowCount: 1,
    durationMs: 8,
    execution: {
      provider: 'bigquery',
      durationMs: 8,
      rowCount: 1,
      truncated: false,
      bytesProcessed,
      cacheHit,
    },
  }
}

function state(result: QueryResult | null): QueryResultLifecycleState {
  return {
    result,
    pendingResult: null,
    resultRevision: result ? 1 : 0,
    running: false,
    queryError: null,
  }
}

test('NON07 BigQuery metadata survives a successful query-result lifecycle unchanged', () => {
  const original = queryResult(0, true)
  const complete = completeQueryState(
    startQueryState(state(null)),
    original,
    null,
  )
  assert.equal(complete.result, original)
  assert.deepEqual(complete.result?.execution, original.execution)
  assert.equal(complete.result?.execution?.bytesProcessed, 0)
  assert.equal(complete.result?.execution?.cacheHit, true)
  assert.equal(complete.resultRevision, 1)
})

test('NON07 pending BigQuery metadata stays attached to the pending result until promotion', () => {
  const previous = queryResult(20, false)
  const incoming = queryResult(90, true)
  const pending = deliverQueryResultState(
    startQueryState(state(previous)),
    incoming,
  )
  assert.equal(pending.result, previous)
  assert.equal(pending.pendingResult, incoming)
  assert.equal(pending.result?.execution?.bytesProcessed, 20)
  assert.equal(pending.pendingResult?.execution?.bytesProcessed, 90)
  const promoted = stopQueryState(pending)
  assert.equal(promoted.result, incoming)
  assert.equal(promoted.pendingResult, null)
  assert.equal(promoted.resultRevision, 2)
})

test('NON07 failed query clears active data and statistics while preserving the original object', () => {
  const previous = queryResult(13, false)
  const failed = completeQueryState(
    startQueryState(state(previous)),
    null,
    'query failed',
  )
  assert.equal(failed.result, null)
  // The separate original object is intact; active failed data is not exportable.
  assert.equal(previous.execution?.bytesProcessed, 13)
  assert.equal(failed.queryError, 'query failed')
  assert.equal(failed.resultRevision, 2)
})

test('NON07 absent and unsafe provider statistics survive as optional metadata, not UI claims', () => {
  const incoming = queryResult(undefined, undefined)
  const completed = completeQueryState(state(null), incoming, null)
  assert.equal(completed.result?.execution?.bytesProcessed, undefined)
  assert.equal(completed.result?.execution?.cacheHit, undefined)
  assert.equal(completed.result?.durationMs, 8)
})
