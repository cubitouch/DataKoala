import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateStoredProfile } from './profile-migration.ts'

test('legacy saved connections migrate to versioned PostgreSQL profiles', () => {
  const migrated = migrateStoredProfile({
    id: 'old', name: 'Old', host: 'localhost', port: 5432, database: 'app',
    user: 'reader', password: '', ssl: false, readonly: true
  })
  assert.equal(migrated.status, 'migrated')
  if (migrated.status !== 'migrated') return
  assert.equal(migrated.profile.kind, 'postgres')
  assert.equal(migrated.profile.version, 1)
  assert.equal(migrated.profile.id, 'old')
})

test('profiles for unknown future adapters are not reinterpreted as PostgreSQL', () => {
  const stored = { id: 'bq', kind: 'bigquery', version: 1 }
  assert.deepEqual(migrateStoredProfile(stored), { status: 'unsupported', stored })
})

test('a future PostgreSQL profile version is quarantined unchanged', () => {
  const stored = { id: 'future', kind: 'postgres', version: 2, futureOption: true }
  assert.deepEqual(migrateStoredProfile(stored), { status: 'unsupported', stored })
})

test('a valid PostgreSQL v1 profile is preserved without migration', () => {
  const stored = {
    id: 'current', name: 'Current', kind: 'postgres', version: 1, host: 'localhost',
    port: 5432, database: 'app', user: 'reader', password: '', ssl: false, readonly: true
  }
  const result = migrateStoredProfile(stored)
  assert.equal(result.status, 'current')
  assert.equal(result.stored, stored)
})
