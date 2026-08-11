import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildConnectionProfileDraft, type ConnectionDraft } from './connectionDraft.ts'

const valid: ConnectionDraft = {
  id: 'kept-id', name: '  My profile  ', host: ' db.example.com ', port: ' 5433 ',
  database: ' analytics ', user: ' alice ', password: '  secret with spaces  ', ssl: true, readonly: false
}

test('normalizes one draft consistently while preserving id, password, and flags', () => {
  const result = buildConnectionProfileDraft(valid, { requireName: true })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.profile, {
    kind: 'postgres', version: 1,
    id: 'kept-id', name: 'My profile', host: 'db.example.com', port: 5433,
    database: 'analytics', user: 'alice', password: '  secret with spaces  ', ssl: true, readonly: false
  })
})

test('Test validation does not require a name, while Save validation does', () => {
  assert.equal(buildConnectionProfileDraft({ ...valid, name: '' }).ok, true)
  const save = buildConnectionProfileDraft({ ...valid, name: '' }, { requireName: true })
  assert.equal(save.ok, false)
  if (!save.ok) assert.equal(save.errors.name, 'Profile name is required')
})

test('returns explicit errors for every required connection field and invalid ports', () => {
  const result = buildConnectionProfileDraft({ ...valid, host: ' ', port: '65536', database: '', user: '' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepEqual(result.errors, {
    host: 'Host is required', port: 'Port must be between 1 and 65535',
    database: 'Database is required', user: 'User is required'
  })
})
