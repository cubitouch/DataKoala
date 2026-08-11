import assert from 'node:assert/strict'
import test from 'node:test'
import { QUERY_LOADING_DELAY_MS, shouldShowQueryLoading } from './loadingIndicator.ts'

test('fast queries never show visual loading while slow queries show it once', () => {
  assert.equal(shouldShowQueryLoading(true, QUERY_LOADING_DELAY_MS - 1), false)
  assert.equal(shouldShowQueryLoading(false, QUERY_LOADING_DELAY_MS + 1), false)
  assert.equal(shouldShowQueryLoading(true, QUERY_LOADING_DELAY_MS), true)
  assert.equal(shouldShowQueryLoading(true, QUERY_LOADING_DELAY_MS + 500), true)
})
