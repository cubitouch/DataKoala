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

test('BigQuery billing caps persist and an absent legacy cap migrates to uncapped', () => {
  const capped = { id: 'bq', name: 'BQ', kind: 'bigquery', version: 1, billingProject: 'billing', maximumBytesBilled: '1000', readonly: true }
  const current = migrateStoredProfile(capped)
  assert.equal(current.status, 'current')
  if (current.status === 'current' && current.profile.kind === 'bigquery') assert.equal(current.profile.maximumBytesBilled, '1000')

  const { maximumBytesBilled: _cap, ...legacy } = capped
  const migrated = migrateStoredProfile(legacy)
  assert.equal(migrated.status, 'migrated')
  if (migrated.status === 'migrated' && migrated.profile.kind === 'bigquery') assert.equal(migrated.profile.maximumBytesBilled, '1073741824')
})

test('Tempo gcx profiles persist independently from Prometheus profiles', () => {
  const stored = { id: 'traces', name: 'Production traces', kind: 'tempo', version: 1, readonly: true, transport: { kind: 'gcx', context: 'production' } }
  const result = migrateStoredProfile(stored)
  assert.equal(result.status, 'current')
  if (result.status !== 'current') return
  assert.equal(result.profile.kind, 'tempo')
  assert.deepEqual(result.profile.transport, { kind: 'gcx', context: 'production' })
})
