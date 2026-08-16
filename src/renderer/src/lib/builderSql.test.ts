import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPostgresLiteral, generateBuilderQuery, generateBuilderSql, isBuilderTemporalDataType, materializeSqlParameters, TIME_BUCKETS } from './builderSql.ts'
import { formatSqlOrOriginal } from './formatSql.ts'
import { encodeBuilderSeriesTuple } from './resultVisualization.ts'

test('Builder bucket options expose Minute', () => {
  assert.equal(TIME_BUCKETS[0], 'minute')
  assert.equal(TIME_BUCKETS.filter((bucket) => bucket === 'minute').length, 1)
})

test('Builder buckets dates and timestamps but not plain time-of-day values', () => {
  for (const type of ['date', 'timestamp', 'timestamptz', 'TIMESTAMP_S', 'TIMESTAMP_MS', 'TIMESTAMP_NS']) assert.equal(isBuilderTemporalDataType(type), true)
  for (const type of ['TIME', 'TIMETZ']) assert.equal(isBuilderTemporalDataType(type), false)
})

test('generates a day bucket without series and defaults legacy temporal input to the seven-day range', () => {
  const sql = generateBuilderSql({ table: { schema: 'public', name: 'orders' }, timeColumn: 'created_at', timeBucket: 'day' })
  assert.equal(sql, `SELECT\n  date_trunc('day', "created_at") AS "time_bucket",\n  COUNT(*) AS "count"\nFROM "public"."orders"\nWHERE "created_at" IS NOT NULL AND "created_at" >= CURRENT_TIMESTAMP - INTERVAL '7 days'\nGROUP BY 1\nORDER BY 1 ASC NULLS LAST;`)
})

test('count by status uses a categorical X with no hidden time predicates when no time filter is configured', () => {
  const sql = generateBuilderSql({
    table: { schema: 'public', name: 'orders' },
    xColumn: 'status',
    xColumnDataType: 'text',
    aggregation: 'count'
  })
  assert.equal(sql, `SELECT\n  "status",\n  COUNT(*) AS "count"\nFROM "public"."orders"\nGROUP BY 1\nORDER BY 1 ASC NULLS LAST;`)
  assert.doesNotMatch(sql, /date_trunc|CURRENT_TIMESTAMP|time_bucket|IS NOT NULL/)
})

test('count by status can keep an independent seven-day dataset filter', () => {
  const sql = generateBuilderSql({
    table: { schema: 'public', name: 'orders' },
    xColumn: 'status',
    xColumnDataType: 'text',
    timeColumn: 'created_at',
    timeColumnDataType: 'timestamptz',
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' },
    aggregation: 'count'
  })
  assert.equal(sql, `SELECT\n  "status",\n  COUNT(*) AS "count"\nFROM "public"."orders"\nWHERE "created_at" >= CURRENT_TIMESTAMP - INTERVAL '7 days'\nGROUP BY 1\nORDER BY 1 ASC NULLS LAST;`)
  assert.doesNotMatch(sql, /date_trunc|time_bucket/)
})

test('revenue by region aggregates a numeric Y axis across a categorical X', () => {
  const sql = generateBuilderSql({
    table: { schema: 'analytics', name: 'sales' },
    xColumn: 'region',
    xColumnDataType: 'text',
    valueColumn: 'revenue',
    aggregation: 'sum'
  })
  assert.equal(sql, `SELECT\n  "region",\n  SUM("revenue") AS "value"\nFROM "analytics"."sales"\nGROUP BY 1\nORDER BY 1 ASC NULLS LAST;`)
})

test('origin by type keeps X and Series as independent dimensions', () => {
  const sql = generateBuilderSql({
    table: { schema: 'public', name: 'events' },
    xColumn: 'origin',
    xColumnDataType: 'text',
    aggregation: 'count',
    seriesColumns: ['type']
  })
  assert.equal(sql, `SELECT\n  "origin",\n  "type",\n  COUNT(*) AS "count"\nFROM "public"."events"\nGROUP BY 1, 2\nORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST;`)
})

test('generates a month bucket with a real series source column', () => {
  const sql = generateBuilderSql({ table: { schema: 'public', name: 'orders' }, timeColumn: 'created_at', timeBucket: 'month', seriesColumns: ['status'] })
  assert.match(sql, /date_trunc\('month'/)
  assert.match(sql, /\n  "status",\n/)
  assert.doesNotMatch(sql, /AS "series"|concat_ws|::text/)
  assert.match(sql, /GROUP BY 1, 2\nORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST;/)
})

test('uses a DuckDB timestamptz bucket expression without changing PostgreSQL output', () => {
  const input = { table: { schema: 'main', name: 'events' }, xColumn: 'created_at', xColumnDataType: 'timestamptz', timeColumn: 'created_at', timeColumnDataType: 'timestamptz', timeBucket: 'day' as const, timeRange: { kind: 'all' as const } }
  const defaultSql = generateBuilderSql(input)
  const postgresSql = generateBuilderSql({ ...input, dialect: 'postgres' })
  const duckdbSql = generateBuilderSql({ ...input, dialect: 'duckdb' })
  assert.equal(postgresSql, defaultSql)
  assert.match(postgresSql, /date_trunc\('day', "created_at", 'UTC'\)/)
  assert.match(duckdbSql, /date_trunc\('day', "created_at" AT TIME ZONE 'UTC'\) AT TIME ZONE 'UTC'/)
})

test('Builder preview, Copy SQL, and Open in SQL mode share canonical formatting', () => {
  const generatedQuery = generateBuilderQuery({
    table: { schema: 'demo_shop', name: 'orders' },
    timeColumn: 'created_at',
    timeColumnDataType: 'timestamptz',
    timeBucket: 'year',
    seriesColumns: ['type', 'quantity'],
    timeRange: { kind: 'rolling', amount: 12, unit: 'hour' }
  })
  const formattedGeneratedSql = formatSqlOrOriginal(generatedQuery.sql)
  const copiedSql = formattedGeneratedSql
  const openedSqlModeSql = formatSqlOrOriginal(materializeSqlParameters(generatedQuery.sql, generatedQuery.parameters))

  assert.equal(copiedSql, formattedGeneratedSql)
  assert.equal(openedSqlModeSql, formattedGeneratedSql)
  assert.equal(formatSqlOrOriginal(openedSqlModeSql), formattedGeneratedSql)
})

test('quotes schema, table and column identifiers including uppercase and quotes', () => {
  const sql = generateBuilderSql({ table: { schema: 'My"Schema', name: 'Order Items' }, timeColumn: 'Created"At', timeBucket: 'year', seriesColumns: ['Type"Name'] })
  assert.match(sql, /FROM "My""Schema"\."Order Items"/)
  assert.match(sql, /"Created""At" IS NOT NULL/)
  assert.match(sql, /\n  "Type""Name",\n/)
  assert.doesNotMatch(sql, /AS "series"/)
})

test('preserves multiple selected series columns independently', () => {
  const sql = generateBuilderSql({ table: { schema: 'public', name: 'orders' }, timeColumn: 'at', timeBucket: 'day', seriesColumns: ['status', 'country'] })
  assert.match(sql, /\n  "status",\n  "country",\n/)
  assert.match(sql, /GROUP BY 1, 2, 3\nORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST, 3 ASC NULLS LAST;/)
  assert.doesNotMatch(sql, /concat_ws|AS "series"|::text/)
})

test('non-count aggregations require a Y axis column', () => {
  assert.throws(() => generateBuilderSql({
    table: { schema: 'public', name: 'orders' },
    xColumn: 'region', xColumnDataType: 'text', aggregation: 'average'
  }), /requires a numeric Y axis column/)
})

test('rejects unsupported bucket values for temporal X', () => {
  assert.throws(() => generateBuilderSql({ table: { schema: 'public', name: 'x' }, timeColumn: 'at', timeBucket: 'second' as never }), /Unsupported time bucket/)
})

test('minute uses the shared bucket path with quoted timestamp identifiers', () => {
  const sql = generateBuilderSql({ table: { schema: 'odd"schema', name: 'events' }, timeColumn: 'occurred"at', timeColumnDataType: 'timestamp without time zone', timeBucket: 'minute', timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } })
  assert.match(sql, /date_trunc\('minute', "occurred""at"\) AT TIME ZONE 'UTC'/)
  assert.match(sql, /FROM "odd""schema"\."events"/)
})

test('minute timestamptz buckets use the stable UTC date_trunc overload', () => {
  const sql = generateBuilderSql({ table: { schema: 'public', name: 'events' }, timeColumn: 'occurred_at', timeColumnDataType: 'timestamptz', timeBucket: 'minute', timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } })
  assert.match(sql, /date_trunc\('minute', "occurred_at", 'UTC'\)/)
})

test('applies provenance-matched promoted result filters', () => {
  const tuple = encodeBuilderSeriesTuple({ status: 'paid' }, ['status'])
  const query = generateBuilderQuery({
    table: { schema: 'public', name: 'orders' }, timeColumn: 'created_at', timeBucket: 'day', seriesColumns: ['status'],
    filters: [{ id: 'paid', column: 'series', operator: 'equals', value: tuple, execution: 'query', provenance: { mode: 'builder', resultAlias: 'series', table: { schema: 'public', name: 'orders' }, sourceColumns: ['status'], timeColumn: 'created_at', timeBucket: 'day', sourceKind: 'single-column', targetKind: 'source-column', sourceColumn: 'status', displayLabel: 'status' } }]
  })
  assert.match(query.sql, /"status" IS NOT DISTINCT FROM \$1/)
  assert.deepEqual(query.parameters, ['paid'])
})

test('promotes a categorical X filter directly to the source column', () => {
  const query = generateBuilderQuery({
    table: { schema: 'public', name: 'orders' },
    xColumn: 'status', xColumnDataType: 'text', aggregation: 'count',
    filters: [{ id: 'paid', column: 'status', operator: 'equals', value: 'paid', execution: 'query' }]
  })
  assert.match(query.sql, /WHERE "status" = \$1/)
  assert.deepEqual(query.parameters, ['paid'])
})

test('materializes Builder parameters into safe, executable SQL for SQL mode', () => {
  const sql = 'WHERE "market" = $1 AND "total" = $2 AND "active" = $3 AND "deleted_at" IS DISTINCT FROM $4 AND "at" >= $5'
  assert.equal(
    materializeSqlParameters(sql, ["Côte d'Ivoire", 12.5, true, null, new Date('2026-01-02T03:04:05Z')]),
    `WHERE "market" = 'Côte d''Ivoire' AND "total" = 12.5 AND "active" = TRUE AND "deleted_at" IS DISTINCT FROM NULL AND "at" >= '2026-01-02T03:04:05.000Z'`
  )
})

test('materializes multi-digit placeholders without partially replacing them', () => {
  assert.equal(materializeSqlParameters('SELECT $10, $1', ['one', 2, 3, 4, 5, 6, 7, 8, 9, 'ten']), "SELECT 'ten', 'one'")
  assert.throws(() => materializeSqlParameters('SELECT $2', ['one']), /Missing value.*\$2/)
  assert.throws(() => formatPostgresLiteral(Number.NaN), /non-finite/)
})

test('timestamptz buckets explicitly use UTC independently of the PostgreSQL session timezone', () => {
  const sql = generateBuilderSql({ table: { schema: 'public', name: 'events' }, timeColumn: 'occurred_at', timeColumnDataType: 'timestamptz', timeBucket: 'day' })
  assert.match(sql, /date_trunc\('day', "occurred_at", 'UTC'\)/)
})

test('timestamp without time zone buckets are exposed as UTC instants', () => {
  const sql = generateBuilderSql({ table: { schema: 'public', name: 'events' }, timeColumn: 'occurred_at', timeColumnDataType: 'timestamp without time zone', timeBucket: 'month' })
  assert.match(sql, /date_trunc\('month', "occurred_at"\) AT TIME ZONE 'UTC'/)
})

test('compiles fully-qualified GoogleSQL Builder queries with temporal X, independent ranges, metrics, and series', () => {
  const query = generateBuilderQuery({
    dialect: 'google-sql', table: { schema: 'billing-data.analytics', name: 'sales events' },
    xColumn: 'occurred_at', xColumnDataType: 'TIMESTAMP', timeColumn: 'ingested_at', timeColumnDataType: 'TIMESTAMP',
    timeBucket: 'month', timeRange: { kind: 'custom', startDate: '2026-01-01', startTime: '00:00', endDate: '2026-02-01', endTime: '00:00' },
    valueColumn: 'revenue', aggregation: 'average', seriesColumns: ['region', 'channel']
  })
  assert.match(query.sql, /TIMESTAMP_TRUNC\(`occurred_at`, MONTH\) AS `time_bucket`/)
  assert.match(query.sql, /AVG\(`revenue`\) AS `value`/)
  assert.match(query.sql, /FROM `billing-data\.analytics\.sales events`/)
  assert.match(query.sql, /`ingested_at` >= CAST\(\? AS TIMESTAMP\) AND `ingested_at` < CAST\(\? AS TIMESTAMP\)/)
  assert.match(query.sql, /GROUP BY 1, 2, 3/)
  assert.deepEqual(query.parameters, ['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'])
  assert.doesNotMatch(query.sql, /\$\d+|NULLS LAST|date_trunc/i)
})

test('compiles categorical GoogleSQL X, rolling time filters, and promoted filters', () => {
  const query = generateBuilderQuery({
    dialect: 'google-sql', table: { schema: 'my-project.reporting', name: 'orders' },
    xColumn: 'status', xColumnDataType: 'STRING', timeColumn: 'created_at', timeColumnDataType: 'TIMESTAMP',
    timeRange: { kind: 'rolling', amount: 30, unit: 'day' }, aggregation: 'maximum', valueColumn: 'total', seriesColumns: ['country'],
    filters: [{ id: 'country', column: 'country', operator: 'equals', value: 'FR', execution: 'query' }]
  })
  assert.match(query.sql, /TIMESTAMP_SUB\(CURRENT_TIMESTAMP\(\), INTERVAL 30 DAY\)/)
  assert.match(query.sql, /`country` = \?/)
  assert.deepEqual(query.parameters, ['FR'])
})

test('materializes GoogleSQL positional parameters for preview/copy/open parity', () => {
  assert.equal(materializeSqlParameters('WHERE `country` = ? AND `at` >= ?', ["Côte d'Ivoire", '2026-01-01T00:00:00Z']), "WHERE `country` = 'Côte d''Ivoire' AND `at` >= '2026-01-01T00:00:00Z'")
})

test('uses type-correct GoogleSQL DATE, DATETIME, and TIMESTAMP temporal expressions', () => {
  assert.match(generateBuilderSql({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'd', xColumnDataType: 'DATE', timeColumn: 'd', timeColumnDataType: 'DATE', timeBucket: 'month', timeRange: { kind: 'rolling', amount: 3, unit: 'month' } }), /DATE_TRUNC\(`d`, MONTH\).*DATE_SUB\(CURRENT_DATE\(\), INTERVAL 3 MONTH\)/s)
  assert.match(generateBuilderSql({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'dt', xColumnDataType: 'DATETIME', timeColumn: 'dt', timeColumnDataType: 'DATETIME', timeBucket: 'hour', timeRange: { kind: 'rolling', amount: 3, unit: 'month' } }), /DATETIME_TRUNC\(`dt`, HOUR\).*DATETIME_SUB\(CURRENT_DATETIME\(\), INTERVAL 3 MONTH\)/s)
  assert.match(generateBuilderSql({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'ts', xColumnDataType: 'TIMESTAMP', timeColumn: 'ts', timeColumnDataType: 'TIMESTAMP', timeBucket: 'day', timeRange: { kind: 'rolling', amount: 3, unit: 'month' } }), /TIMESTAMP\(DATETIME_SUB\(DATETIME\(CURRENT_TIMESTAMP\(\)\), INTERVAL 3 MONTH\)\)/)
})

test('rejects minute and hour buckets for BigQuery DATE columns', () => {
  for (const bucket of ['minute', 'hour'] as const) assert.throws(() => generateBuilderSql({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'd', xColumnDataType: 'DATE', timeBucket: bucket, timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } }), /DATE columns do not support/)
})

test('casts custom DATE and DATETIME bounds and recurring windows from ordinary string parameters', () => {
  const date = generateBuilderQuery({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'd', xColumnDataType: 'DATE', timeColumn: 'd', timeColumnDataType: 'DATE', timeBucket: 'day', timeRange: { kind: 'custom', startDate: '2026-01-02', startTime: '03:04', endDate: '2026-02-03', endTime: '04:05' } })
  assert.match(date.sql, /`d` >= CAST\(\? AS DATE\).*`d` < CAST\(\? AS DATE\)/s)
  assert.deepEqual(date.parameters, ['2026-01-02', '2026-02-03'])
  const datetime = generateBuilderQuery({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'dt', xColumnDataType: 'DATETIME', timeColumn: 'dt', timeColumnDataType: 'DATETIME', timeBucket: 'hour', timeRange: { kind: 'custom', startDate: '2026-01-02', startTime: '03:04', endDate: '2026-02-03', endTime: '04:05', recurringWindows: [{ id: 'work', from: '09:00', to: '17:00' }] } })
  assert.match(datetime.sql, /`dt` >= CAST\(\? AS DATETIME\).*TIME\(`dt`\) >= CAST\(\? AS TIME\).*TIME\(`dt`\) < CAST\(\? AS TIME\)/s)
  assert.deepEqual(datetime.parameters, ['2026-01-02T03:04', '2026-02-03T04:05', '09:00', '17:00'])
})

test('normalizes minute-precision BigQuery TIMESTAMP bounds as UTC instants without shifting civil types', () => {
  const timestamp = generateBuilderQuery({ dialect: 'google-sql', table: { schema: 'p.d', name: 't' }, xColumn: 'ts', xColumnDataType: 'TIMESTAMP', timeColumn: 'ts', timeColumnDataType: 'TIMESTAMP', timeBucket: 'hour', timeRange: { kind: 'custom', startDate: '2026-08-03', startTime: '00:00', endDate: '2026-08-04', endTime: '01:02' } })
  assert.match(timestamp.sql, /`ts` >= CAST\(\? AS TIMESTAMP\).*`ts` < CAST\(\? AS TIMESTAMP\)/s)
  assert.deepEqual(timestamp.parameters, ['2026-08-03T00:00:00Z', '2026-08-04T01:02:00Z'])
})
