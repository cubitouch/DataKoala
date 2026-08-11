import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '../../../shared/types.ts'
import { completeQueryState, deliverQueryResultState, startQueryState, stopQueryState, type QueryResultLifecycleState } from './queryResultLifecycle.ts'

const result = (value: number): QueryResult => ({ columns: [], rows: [{ value }], rowCount: 1, durationMs: 1 })
const initial = (value = 1): QueryResultLifecycleState => ({ result: result(value), pendingResult: null, resultRevision: 1, running: false, queryError: null })

test('completion atomically removes the overlay and promotes one successful revision', () => {
  const a = initial(); const b = result(2)
  const running = startQueryState(a)
  assert.equal(running.result, a.result); assert.equal(running.running, true)
  const completed = completeQueryState(running, b, null)
  assert.equal(completed.result, b); assert.equal(completed.resultRevision, 2)
  assert.equal(completed.running, false); assert.equal(completed.pendingResult, null)
})

test('separate and out-of-order delivery cannot expose pending data under the overlay', () => {
  const a = startQueryState(initial()); const b = result(2)
  const pending = deliverQueryResultState(a, b)
  assert.equal(pending.result, a.result); assert.equal(pending.resultRevision, 1)
  assert.equal(pending.pendingResult, b); assert.equal(pending.running, true)
  const promoted = stopQueryState(pending)
  assert.equal(promoted.result, b); assert.equal(promoted.resultRevision, 2); assert.equal(promoted.running, false)
})

test('failed completion preserves the displayed revision', () => {
  const a = startQueryState(initial())
  const failed = completeQueryState(a, null, 'failed')
  assert.equal(failed.result, a.result); assert.equal(failed.resultRevision, 1)
  assert.equal(failed.running, false); assert.equal(failed.queryError, 'failed')
})
