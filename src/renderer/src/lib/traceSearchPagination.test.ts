import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeTraceSearchRows,
  nextTraceSearchLimit,
  TRACE_SEARCH_PAGE_SIZE,
  traceSearchHasMore
} from './traceSearchPagination.ts'

test('trace search grows in fixed pages', () => {
  assert.equal(TRACE_SEARCH_PAGE_SIZE, 20)
  assert.equal(nextTraceSearchLimit(20), 40)
  assert.equal(nextTraceSearchLimit(40), 60)
  assert.equal(nextTraceSearchLimit(Number.NaN), 40)
})

test('progressive merge de-duplicates traces and preserves already-resolved status', () => {
  const existing = [
    { traceId: 'a', status: 'error', durationMs: 100 },
    { traceId: 'b', status: 'ok', durationMs: 200 }
  ]
  const incoming = [
    { traceId: 'c', status: 'unknown', durationMs: 300 },
    { traceId: 'a', status: 'unknown', durationMs: 110 },
    { traceId: 'c', status: 'unknown', durationMs: 300 }
  ]

  assert.deepEqual(mergeTraceSearchRows(existing, incoming), [
    { traceId: 'c', status: 'unknown', durationMs: 300 },
    { traceId: 'a', status: 'error', durationMs: 110 },
    { traceId: 'b', status: 'ok', durationMs: 200 }
  ])
})

test('progressive search only offers another page when the upstream window filled', () => {
  assert.equal(traceSearchHasMore(20, 20), true)
  assert.equal(traceSearchHasMore(39, 40), false)
})
