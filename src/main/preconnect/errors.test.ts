import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyTshStatusFailure } from './errors.ts'

test('an expired Teleport profile maps to an actionable login message', () => {
  const error = classifyTshStatusFailure('ERROR: Active profile expired.')
  assert.ok(error)
  assert.equal(error.code, 'TSH_NOT_LOGGED_IN')
  assert.match(error.message, /expired/i)
  assert.match(error.message, /tsh login/i)
})

test('a missing or unauthenticated session maps to the login message', () => {
  for (const detail of [
    'Not logged in.',
    'no profile found',
    'login required',
    'unauthenticated',
  ]) {
    const error = classifyTshStatusFailure(detail)
    assert.ok(error, `expected a mapping for "${detail}"`)
    assert.equal(error.code, 'TSH_NOT_LOGGED_IN')
    assert.match(error.message, /tsh login/i)
  }
})

test('unrelated failures are not reclassified', () => {
  assert.equal(classifyTshStatusFailure('connection refused to proxy'), null)
})
