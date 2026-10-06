import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeAiErrorContext } from './aiErrorContext.ts'
import { AI_LIMITS } from './ai.ts'

test('redacts secrets and paths but keeps PostgreSQL diagnostics', () => {
  const input =
    'ERROR: column orders.device_id does not exist LINE 4 Position: 87 SQLSTATE 42703 postgresql://alice:super-secret@db/app password=hunter2 Authorization: Bearer very-secret-token /Users/alice/private.sql C:\\Users\\alice\\private.sql'
  const output = sanitizeAiErrorContext(input)
  for (const secret of [
    'super-secret',
    'hunter2',
    'very-secret-token',
    '/Users/alice',
    'C:\\Users\\alice',
  ])
    assert.equal(output.includes(secret), false)
  assert.match(output, /column orders\.device_id does not exist/)
  assert.match(output, /SQLSTATE 42703/)
  assert.equal(sanitizeAiErrorContext(output), output)
})

test('redacts URI and password secrets before truncating at the boundary', () => {
  for (const suffix of [
    ' postgresql://alice:super-secret@db/app',
    ' password=super-secret',
    ' Authorization: Bearer super-secret',
  ]) {
    const input = `useful diagnostic ${'x'.repeat(AI_LIMITS.errorCharacters - 45)}${suffix}`
    const output = sanitizeAiErrorContext(input)
    assert.equal(output.includes('super-secret'), false)
    assert.ok(output.length <= AI_LIMITS.errorCharacters)
    assert.match(output, /^useful /)
    assert.equal(sanitizeAiErrorContext(output), output)
  }
})

test('redacts complete authorization values and generic absolute paths', () => {
  const input = [
    'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'Authorization: Custom realm=private signature=secret',
    '/private/var/db/query.sql /tmp/query.sql /var/log/postgresql.log',
    'D:\\projects\\private\\query.sql Z:\\temp\\query.sql',
  ].join('\n')
  const output = sanitizeAiErrorContext(input)
  for (const privateValue of [
    'dXNlcjpwYXNzd29yZA==',
    'realm=private',
    'signature=secret',
    '/private/',
    '/tmp/',
    '/var/',
    'D:\\projects',
    'Z:\\temp',
  ])
    assert.equal(output.includes(privateValue), false)
  assert.equal(sanitizeAiErrorContext(output), output)
})

test('redacts complete PostgreSQL URI and libpq connection identifiers', () => {
  const output = sanitizeAiErrorContext(
    'failed postgresql://alice:secret@db.internal/prod host=db.internal dbname=prod user=alice password=secret sslmode=require',
  )
  for (const privateValue of [
    'postgresql://',
    'alice',
    'secret',
    'db.internal',
    'prod',
    'require',
  ])
    assert.equal(output.includes(privateValue), false)
  assert.equal(sanitizeAiErrorContext(output), output)
})
