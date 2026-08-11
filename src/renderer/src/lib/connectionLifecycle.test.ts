import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConnectionStateEvent } from '../../../shared/types.ts'
import { unexpectedDisconnectPatch } from './connectionLifecycle.ts'

const event = (profileId: string, generation: number): ConnectionStateEvent => ({ profileId, generation,
  state: 'failed', expected: false, message: 'Disconnected — connection terminated unexpectedly',
  code: 'CONNECTION_LOST', timestamp: 1, recoverable: true })
const state = { activeProfileId: 'a', connectionGeneration: 4, sql: 'select pg_sleep(10)',
  connected: true, running: true, connectionError: null, result: { columns: [], rows: [], rowCount: 0, durationMs: 1 } }

test('disconnect clears in-flight state while preserving SQL', () => {
  assert.deepEqual(unexpectedDisconnectPatch(state, event('a', 4)), {
    connectionGeneration: 4, connected: false, running: false,
    connectionError: 'Disconnected — connection terminated unexpectedly', pendingResult: null,
    isResultStale: true, isMetadataStale: true, disconnectedAt: 1
  })
  assert.equal(state.sql, 'select pg_sleep(10)')
  assert.ok(state.result, 'last successful result is retained')
})

test('disconnect without a result does not invent stale data', () => {
  const patch = unexpectedDisconnectPatch({ ...state, result: null }, event('a', 4))
  assert.equal(patch?.isResultStale, false)
})

test('stale generations and unrelated profiles are ignored', () => {
  assert.equal(unexpectedDisconnectPatch(state, event('b', 5)), null)
  assert.equal(unexpectedDisconnectPatch(state, event('a', 3)), null)
})
