/**
 * End-to-end test for connection-string parsing against a real Postgres.
 *
 * The motivating case is a passwordless proxy principal:
 *   postgres://demo-reader%40proxy-test.example@localhost:55432/datakoala_test
 * which has an "@" inside the username and no password at all. This asserts that
 * such a string parses AND that the resulting discrete fields actually authenticate.
 *
 * Requires `pnpm db:up` (see README). Skips when no database is reachable.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { parseConnectionString } from './connString.ts'

const HOST = process.env.DATAKOALA_TEST_HOST ?? 'localhost'
const PORT = process.env.DATAKOALA_TEST_PORT ?? '55432'
const DB = 'datakoala_test'
const SPECIAL_ROLE = 'demo-reader@proxy-test.example'

let reachable = false
const pools: pg.Pool[] = []

/** Mirror exactly how src/main/db.ts turns a profile into pg options. */
function toPoolConfig(v: {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}): pg.PoolConfig {
  return {
    host: v.host,
    port: v.port,
    database: v.database,
    user: v.user,
    password: v.password === '' ? undefined : v.password,
    ssl: v.ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 4000
  }
}

before(async () => {
  const probe = new pg.Pool({
    host: HOST,
    port: Number(PORT),
    database: DB,
    user: 'postgres',
    password: 'testpw',
    max: 1,
    connectionTimeoutMillis: 3000
  })
  try {
    const c = await probe.connect()
    c.release()
    reachable = true
  } catch (e) {
    console.log('SKIP: test database not reachable —', e instanceof Error ? e.message : e)
  }
  await probe.end()
})

after(async () => {
  await Promise.all(pools.map((p) => p.end().catch(() => {})))
})

test('a password-bearing connection string parses and connects', async (t) => {
  if (!reachable) return t.skip('no database')
  const r = parseConnectionString(`postgres://postgres:testpw@${HOST}:${PORT}/${DB}`)
  assert.ok(r.ok, r.ok ? '' : r.error)
  const pool = new pg.Pool(toPoolConfig(r.value))
  pools.push(pool)
  const res = await pool.query('select current_user as u, count(*)::int as n from orders')
  assert.equal(res.rows[0].u, 'postgres')
  assert.equal(res.rows[0].n, 20001)
})

test('the proxy-style string (encoded @ in user, no password) connects', async (t) => {
  if (!reachable) return t.skip('no database')
  const raw = `postgres://${encodeURIComponent(SPECIAL_ROLE)}@${HOST}:${PORT}/${DB}`
  const r = parseConnectionString(raw)
  assert.ok(r.ok, r.ok ? '' : r.error)
  assert.equal(r.value.user, SPECIAL_ROLE, 'the @ in the username must survive parsing')
  assert.equal(r.value.password, '')

  const pool = new pg.Pool(toPoolConfig(r.value))
  pools.push(pool)
  // The real proof: Postgres accepts this identity over the wire.
  const res = await pool.query('select current_user as u')
  assert.equal(res.rows[0].u, SPECIAL_ROLE, 'connected as the wrong role')
})

test('that role can read the seeded data it was granted', async (t) => {
  if (!reachable) return t.skip('no database')
  const raw = `postgres://${encodeURIComponent(SPECIAL_ROLE)}@${HOST}:${PORT}/${DB}`
  const r = parseConnectionString(raw)
  assert.ok(r.ok)
  const pool = new pg.Pool(toPoolConfig(r.value))
  pools.push(pool)
  const res = await pool.query('select count(*)::int as n from orders')
  assert.equal(res.rows[0].n, 20001)
})

test('an empty password is omitted, not sent as an empty string', async (t) => {
  if (!reachable) return t.skip('no database')
  const cfg = toPoolConfig({
    host: HOST,
    port: Number(PORT),
    database: DB,
    user: SPECIAL_ROLE,
    password: '',
    ssl: false
  })
  // If this were '' rather than undefined, pg would attempt an empty-password
  // auth exchange instead of letting trust/proxy auth through.
  assert.equal(cfg.password, undefined)
})

test('a wrong password fails rather than silently succeeding', async (t) => {
  if (!reachable) return t.skip('no database')
  const r = parseConnectionString(`postgres://postgres:definitely-wrong@${HOST}:${PORT}/${DB}`)
  assert.ok(r.ok)
  const pool = new pg.Pool(toPoolConfig(r.value))
  pools.push(pool)
  await assert.rejects(() => pool.query('select 1'), /password|authentication/i)
})
