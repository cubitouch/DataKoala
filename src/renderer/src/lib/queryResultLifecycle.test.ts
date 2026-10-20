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

const result = (value: number): QueryResult => ({
  columns: [],
  rows: [{ value }],
  rowCount: 1,
  durationMs: 1,
})
const initial = (value = 1): QueryResultLifecycleState => ({
  result: result(value),
  pendingResult: null,
  resultRevision: 1,
  running: false,
  queryError: null,
})

test('completion atomically removes the overlay and promotes one successful revision', () => {
  const a = initial()
  const b = result(2)
  const running = startQueryState(a)
  assert.equal(running.result, a.result)
  assert.equal(running.running, true)
  const completed = completeQueryState(running, b, null)
  assert.equal(completed.result, b)
  assert.equal(completed.resultRevision, 2)
  assert.equal(completed.running, false)
  assert.equal(completed.pendingResult, null)
})

test('separate and out-of-order delivery cannot expose pending data under the overlay', () => {
  const a = startQueryState(initial())
  const b = result(2)
  const pending = deliverQueryResultState(a, b)
  assert.equal(pending.result, a.result)
  assert.equal(pending.resultRevision, 1)
  assert.equal(pending.pendingResult, b)
  assert.equal(pending.running, true)
  const promoted = stopQueryState(pending)
  assert.equal(promoted.result, b)
  assert.equal(promoted.resultRevision, 2)
  assert.equal(promoted.running, false)
})

test('failed completion clears visible and pending data and invalidates the revision', () => {
  const a = startQueryState(initial())
  const failed = completeQueryState(a, null, 'failed')
  assert.equal(failed.result, null)
  assert.equal(failed.resultRevision, 2)
  assert.equal(failed.running, false)
  assert.equal(failed.queryError, 'failed')
})

test('success A → failure B → success C, including failure before any result', () => {
  const failed = completeQueryState(
    startQueryState(initial()),
    null,
    'B failed',
  )
  const recovered = completeQueryState(startQueryState(failed), result(3), null)
  assert.deepEqual(recovered.result, result(3))
  assert.equal(recovered.queryError, null)
  assert.equal(recovered.resultRevision, 3)
  const empty = completeQueryState(
    { ...initial(), result: null },
    null,
    'first failure',
  )
  assert.equal(empty.result, null)
  assert.equal(empty.queryError, 'first failure')
})

test('abandonment retains previous data while failure discards pending data', () => {
  const running = startQueryState(initial())
  assert.equal(completeQueryState(running, null, null).result, running.result)
  assert.equal(stopQueryState(running).result, running.result)
  const failed = completeQueryState(
    deliverQueryResultState(running, result(2)),
    null,
    'failed',
  )
  assert.equal(failed.result, null)
  assert.equal(failed.pendingResult, null)
})
