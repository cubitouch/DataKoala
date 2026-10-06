import assert from 'node:assert/strict'
import test from 'node:test'
import { __testing, DatabaseConnectionError } from './adapters/postgres.ts'
import type { ConnectionProfile } from '../shared/types.ts'
import { queryFailureKind } from './query-failure.ts'

test('classifies datasource SQL errors as repairable query failures', () => {
  assert.equal(
    queryFailureKind(new Error('column orders.device_id does not exist')),
    'query',
  )
  assert.equal(queryFailureKind(new Error('operator does not exist')), 'query')
})

test('classifies structured connection errors without matching messages', () => {
  for (const code of [
    'CONNECTION_LOST',
    'RECONNECT_FAILED',
    'NOT_CONNECTED',
  ] as const)
    assert.equal(
      queryFailureKind(new DatabaseConnectionError(code, 'opaque detail')),
      'connection',
    )
})

test('classifies the PostgreSQL read-only guard as local validation', () => {
  const profile: ConnectionProfile = {
    kind: 'postgres',
    version: 2,
    id: 'pg-readonly',
    name: 'Read-only PostgreSQL',
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'user',
    password: '',
    tlsMode: 'disable',
    readonly: true,
  }

  let failure: unknown
  try {
    __testing.assertReadonly(profile, 'DELETE FROM orders')
  } catch (error) {
    failure = error
  }

  assert.ok(failure instanceof Error)
  assert.match(failure.message, /read-only.*DELETE/i)
  assert.equal(queryFailureKind(failure), 'validation')
})
