import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConnectionString, buildConnectionString, DEFAULT_PORT } from './connString.ts'

function ok(raw: string) {
  const r = parseConnectionString(raw)
  assert.ok(r.ok, `expected parse to succeed for ${raw}, got: ${r.ok ? '' : r.error}`)
  return r
}

test('parses the Teleport-style URI with an encoded @ in the username', () => {
  // The real motivating case: the username itself contains an "@" as %40, and
  // there is no password at all.
  const r = ok('postgres://demo-reader%40proxy-test.example@localhost:55432/demo_shop')
  assert.equal(r.value.user, 'demo-reader@proxy-test.example')
  assert.equal(r.value.password, '')
  assert.equal(r.value.host, 'localhost')
  assert.equal(r.value.port, 55432)
  assert.equal(r.value.database, 'demo_shop')
  assert.equal(r.value.ssl, false)
  assert.ok(
    r.warnings.some((w) => /passwordless/i.test(w)),
    'should warn that no password was found'
  )
})

test('decodes percent-encoded passwords containing @ and :', () => {
  const r = ok('postgresql://user:p%40ss%3Aword@db.example.com:5432/mydb')
  assert.equal(r.value.user, 'user')
  assert.equal(r.value.password, 'p@ss:word')
})

test('accepts both postgres:// and postgresql:// schemes', () => {
  assert.equal(ok('postgres://u:p@h:1/d').value.host, 'h')
  assert.equal(ok('postgresql://u:p@h:1/d').value.host, 'h')
})

test('defaults the port when absent, and warns', () => {
  const r = ok('postgres://user:pass@host/db')
  assert.equal(r.value.port, DEFAULT_PORT)
  assert.ok(r.warnings.some((w) => /defaulting to 5432/i.test(w)))
})

test('maps sslmode to the ssl flag', () => {
  assert.equal(ok('postgres://u:p@h:1/d?sslmode=require').value.ssl, true)
  assert.equal(ok('postgres://u:p@h:1/d?sslmode=disable').value.ssl, false)
  assert.equal(ok('postgres://u:p@h:1/d?sslmode=verify-full').value.ssl, true)
  assert.equal(ok('postgres://u:p@h:1/d').value.ssl, false)
})

test('warns that verify-ca/verify-full are not fully honoured', () => {
  const r = ok('postgres://u:p@h:1/d?sslmode=verify-full')
  assert.ok(r.warnings.some((w) => /not verified|does not configure/i.test(w)))
})

test('unbrackets IPv6 hosts', () => {
  const r = ok('postgres://user:pass@[::1]:5432/db')
  assert.equal(r.value.host, '::1')
})

test('handles a missing database name', () => {
  const r = ok('postgres://user:pass@host:5432/')
  assert.equal(r.value.database, '')
  assert.ok(r.warnings.some((w) => /database name/i.test(w)))
})

test('reads dbname/user/password from query parameters as libpq allows', () => {
  const r = ok('postgres://host:5432/?dbname=orders&user=alice&password=secret')
  assert.equal(r.value.database, 'orders')
  assert.equal(r.value.user, 'alice')
  assert.equal(r.value.password, 'secret')
})

test('strips paste artefacts: quotes, a psql prefix, and wrapped newlines', () => {
  assert.equal(ok('  postgres://u:p@h:5432/d  ').value.host, 'h')
  assert.equal(ok('"postgres://u:p@h:5432/d"').value.host, 'h')
  assert.equal(ok("'postgres://u:p@h:5432/d'").value.host, 'h')
  assert.equal(ok('psql postgres://u:p@h:5432/d').value.host, 'h')
  assert.equal(ok('psql "postgres://u:p@h:5432/d"').value.host, 'h')
  assert.equal(ok('jdbc:postgresql://u:p@h:5432/d').value.host, 'h')
  // A URI wrapped across lines by a terminal.
  assert.equal(ok('postgres://u:p@h:5432/\n  d').value.database, 'd')
})

test('parses libpq keyword/value strings', () => {
  const r = ok('host=localhost port=55432 dbname=demo_shop user=alice sslmode=require')
  assert.equal(r.value.host, 'localhost')
  assert.equal(r.value.port, 55432)
  assert.equal(r.value.database, 'demo_shop')
  assert.equal(r.value.user, 'alice')
  assert.equal(r.value.ssl, true)
})

test('honours single-quoted values in keyword/value strings', () => {
  const r = ok("host=localhost dbname=db user=alice password='a b c'")
  assert.equal(r.value.password, 'a b c')
})

test('rejects garbage and missing hosts with a useful message', () => {
  const bad = parseConnectionString('not a connection string at all')
  assert.equal(bad.ok, false)
  assert.match((bad as { error: string }).error, /Unrecognised format/)

  const empty = parseConnectionString('   ')
  assert.equal(empty.ok, false)

  const noHost = parseConnectionString('postgres:///db')
  assert.equal(noHost.ok, false)
  assert.match((noHost as { error: string }).error, /missing a host/)
})

test('rejects out-of-range ports', () => {
  const r = parseConnectionString('host=localhost port=99999 dbname=d user=u')
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /Invalid port/)
})

test('round-trips through buildConnectionString, preserving the encoded username', () => {
  const original = 'postgres://demo-reader%40proxy-test.example@localhost:55432/demo_shop'
  const first = ok(original)
  const rebuilt = buildConnectionString(first.value)
  // The @ in the username must come back out encoded, or re-parsing would break.
  assert.match(rebuilt, /demo-reader%40proxy-test\.example@localhost:55432/)
  const second = ok(rebuilt)
  assert.deepEqual(second.value, first.value, 'parse -> build -> parse must be stable')
})

test('round-trips passwords with reserved characters', () => {
  const first = ok('postgresql://user:p%40ss%3Aword@h:5432/d?sslmode=require')
  const second = ok(buildConnectionString(first.value))
  assert.deepEqual(second.value, first.value)
})

test('masking hides the password but keeps the string shape', () => {
  const r = ok('postgresql://user:supersecret@h:5432/d')
  const masked = buildConnectionString(r.value, { maskPassword: true })
  assert.ok(!masked.includes('supersecret'), 'password leaked into masked string')
  assert.match(masked, /user:\*\*\*\*@h:5432/)
})

test('omits the userinfo section entirely when there is no user', () => {
  const r = ok('postgres://host:5432/db')
  const built = buildConnectionString(r.value)
  assert.equal(built, 'postgresql://host:5432/db')
})

test('re-brackets IPv6 hosts when building', () => {
  const r = ok('postgres://u:p@[::1]:5432/db')
  assert.match(buildConnectionString(r.value), /@\[::1\]:5432/)
})
