import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSql } from './formatSql.ts'

test('formats the query shape the user actually pasted', () => {
  const input =
    'SELECT date_trunc(\'month\', created_at) AS "created_at", COUNT(*) FROM "demo_shop"."orders" GROUP BY 1'
  const r = formatSql(input)
  assert.ok(r.ok, r.error)
  // Major clauses should end up on their own lines.
  assert.match(r.sql, /^SELECT/m)
  assert.match(r.sql, /^FROM/m)
  assert.match(r.sql, /^GROUP BY/m)
  assert.ok(r.sql.split('\n').length >= 4, `expected multi-line output, got:\n${r.sql}`)
})

test('formats generated Builder SQL in the compact canonical layout', () => {
  const input =
    'SELECT date_trunc(\'year\', "created_at", \'UTC\') AS "time_bucket", concat_ws(\' · \', "type"::text, "quantity"::text) AS "series", COUNT(*) AS "count" FROM "demo_shop"."orders" WHERE "created_at" IS NOT NULL AND "created_at" >= CURRENT_TIMESTAMP - INTERVAL \'12 hours\' GROUP BY 1, 2 ORDER BY 1 ASC, 2 ASC;'
  const expected = `SELECT
  date_trunc('year', "created_at", 'UTC') AS "time_bucket",
  concat_ws(' · ', "type"::text, "quantity"::text) AS "series",
  COUNT(*) AS "count"
FROM "demo_shop"."orders"
WHERE "created_at" IS NOT NULL
  AND "created_at" >= CURRENT_TIMESTAMP - INTERVAL '12 hours'
GROUP BY 1, 2
ORDER BY 1 ASC, 2 ASC;`
  const r = formatSql(input)
  assert.ok(r.ok, r.error)
  assert.equal(r.sql, expected)
})

test('preserves quoted identifiers exactly, including case', () => {
  // Mangling "created_at" or the schema qualification would change meaning.
  const r = formatSql('select "MixedCase", "demo_shop"."orders".x from "demo_shop"."orders"')
  assert.ok(r.ok, r.error)
  assert.match(r.sql, /"MixedCase"/)
  assert.match(r.sql, /"demo_shop"\."orders"/)
})

test('preserves string literal contents', () => {
  const r = formatSql("select * from t where s = 'Do Not TOUCH this' and u = 'a,b'")
  assert.ok(r.ok, r.error)
  assert.match(r.sql, /'Do Not TOUCH this'/)
  assert.match(r.sql, /'a,b'/)
})

test('keeps comments', () => {
  const r = formatSql('-- why this exists\nselect 1 /* inline note */ from t')
  assert.ok(r.ok, r.error)
  assert.match(r.sql, /why this exists/)
  assert.match(r.sql, /inline note/)
})

test('uppercases keywords but leaves function names lowercase', () => {
  const r = formatSql('select count(*) from t where x is not null')
  assert.ok(r.ok, r.error)
  assert.match(r.sql, /SELECT/)
  assert.match(r.sql, /WHERE/)
  assert.match(r.sql, /count\(/)
})

test('formatting is idempotent', () => {
  const once = formatSql('select a,b from t where a=1 and b=2 order by a')
  assert.ok(once.ok)
  const twice = formatSql(once.sql)
  assert.ok(twice.ok)
  assert.equal(twice.sql, once.sql, 'formatting twice should be a no-op')
})

test('handles CTEs and joins without losing clauses', () => {
  const input =
    'with recent as (select * from orders where created_at > now() - interval \'7 days\') select r.id, u.name from recent r join users u on u.id = r.user_id left join teams t on t.id = u.team_id'
  const r = formatSql(input)
  assert.ok(r.ok, r.error)
  for (const fragment of ['WITH', 'JOIN', 'LEFT JOIN', 'recent', 'users', 'teams']) {
    assert.ok(r.sql.includes(fragment), `lost "${fragment}" during formatting`)
  }
})

test('returns the input unchanged when it cannot be formatted', () => {
  const nonsense = 'this is not ::: sql @@@ at all ('
  const r = formatSql(nonsense)
  // Either it formats harmlessly or it reports failure — but it must never mangle.
  if (!r.ok) assert.equal(r.sql, nonsense, 'unformattable input must be returned untouched')
})

test('reports an error for empty input rather than throwing', () => {
  const r = formatSql('   \n  ')
  assert.equal(r.ok, false)
  assert.match(r.error!, /Nothing to format/)
})

test('does not alter the semantics of a date_trunc rewrite', () => {
  // Formatting must not disturb the bucket unit or the GROUP BY.
  const input = "select date_trunc('week', created_at) as w, sum(amount) from orders group by 1 order by 1 desc"
  const r = formatSql(input)
  assert.ok(r.ok, r.error)
  assert.match(r.sql, /date_trunc\(\s*'week'/)
  assert.match(r.sql, /GROUP BY\s+1/)
  assert.match(r.sql, /ORDER BY\s+1 DESC/)
})

test('keeps nested queries compact without losing semantics', () => {
  const input = 'with recent as (select id, created_at from orders where created_at is not null and status = \'select from where\') select date_trunc(\'day\', created_at) as bucket, count(*) from (select * from recent where id > 10 and id < 20) r group by 1 order by 1 asc'
  const r = formatSql(input)
  assert.ok(r.ok, r.error)
  assert.match(r.sql, /WITH\s+recent AS/)
  assert.match(r.sql, /'select from where'/)
  assert.match(r.sql, /FROM\s+recent/)
  assert.match(r.sql, /GROUP BY 1/)
  assert.match(r.sql, /ORDER BY 1 ASC/)
})
