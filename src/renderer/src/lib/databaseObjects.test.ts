import test from 'node:test'
import assert from 'node:assert/strict'
import { compareDatabaseObjects, isSystemSchema, normalizeDatabaseObjects } from './databaseObjects.ts'

test('classifies PostgreSQL system schemas without classifying arbitrary pg_ names', () => {
  assert.equal(isSystemSchema('public'), false)
  assert.equal(isSystemSchema('information_schema'), true)
  assert.equal(isSystemSchema('pg_catalog'), true)
  assert.equal(isSystemSchema('pg_toast'), true)
  assert.equal(isSystemSchema('pg_toast_123'), true)
  assert.equal(isSystemSchema('pg_temp_4'), true)
  assert.equal(isSystemSchema('pg_user_data'), false)
})

test('sorts user tables, user views, system tables, and system views', () => {
  const input = [
    { schema: 'pg_catalog', name: 'z', kind: 'v' as const },
    { schema: 'public', name: 'Beta', kind: 'v' as const },
    { schema: 'public', name: 'zeta', kind: 'r' as const },
    { schema: 'pg_catalog', name: 'a', kind: 'r' as const },
    { schema: 'public', name: 'Alpha', kind: 'r' as const }
  ]
  assert.deepEqual([...input].sort(compareDatabaseObjects).map((x) => x.name), ['Alpha', 'zeta', 'Beta', 'a', 'z'])
  assert.equal(compareDatabaseObjects(input[0], { ...input[0] }), 0)
  assert.deepEqual(normalizeDatabaseObjects(input).map((x) => x.name), ['public', 'pg_catalog'])
})
