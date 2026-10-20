import { createQuerySession } from '@store/useStore'
import { serializeWorkspaceDraft, parseWorkspaceDraft } from './workspaceFormat'
import { workspaceRestorePatch } from './workspaceRestoration'
import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
vi.mock('@lib/api', () => ({ api: {} }))
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
      bytesBilled: bytesProcessed,
      slotMs: 0,
      providerDurationMs: 0,
      totalRows: 1,
      statisticsScope: 'script',
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

test('batch4 cold restore preserves the SQL draft but restores neither executed-job statistics nor busy state', () => {
  const tab = createQuerySession(1, {
    id: 'stats',
    sql: 'SELECT 1',
    connectionProfileId: 'bq',
  })
  tab.result = queryResult(1024, false)
  tab.pendingResult = queryResult(2048, true)
  tab.running = true
  const serialized = serializeWorkspaceDraft({
    tabs: [tab],
    activeTabId: tab.id,
  })
  assert.equal(serialized.includes('bytesBilled'), false)
  const draft = parseWorkspaceDraft(serialized)
  assert.ok(draft)
  const restored = workspaceRestorePatch(draft)
  assert.equal(restored.tabs[0].sql, 'SELECT 1')
  assert.equal(restored.tabs[0].connectionProfileId, 'bq')
  assert.equal(restored.tabs[0].result, null)
  assert.equal(restored.tabs[0].pendingResult, null)
  assert.equal(restored.tabs[0].running, false)
})
