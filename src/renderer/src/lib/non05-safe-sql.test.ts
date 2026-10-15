import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  formatPostgresLiteral,
  generateBuilderQuery,
  materializeSqlParameters,
} from './builderSql.ts'
import {
  createResultFilter,
  createResultRangeFilter,
  deserializeResultFilters,
  type ResultFilter,
} from './resultFilters.ts'

const table = { schema: 'audit', name: 'events' }
const promoted = (filter: ResultFilter): ResultFilter => ({
  ...filter,
  execution: 'query',
})
const categorical = (dialect: 'postgres' | 'duckdb' | 'google-sql', filters: ResultFilter[] = []) =>
  generateBuilderQuery({
    dialect,
    table,
    xColumn: 'status',
    xColumnDataType: 'text',
    seriesColumns: ['region'],
    filters,
  })

test('NON-05: PostgreSQL and DuckDB quote special identifiers as single names', () => {
  for (const dialect of ['postgres', 'duckdb'] as const) {
    const query = generateBuilderQuery({
      dialect,
      table: { schema: 'Mi"xed.schema', name: 'orders; -- drop' },
      xColumn: 'na"me; /* comment */',
      xColumnDataType: 'text',
      seriesColumns: ['select', 'été space'],
      valueColumn: '€ total',
      aggregation: 'sum',
    })
    assert.match(query.sql, /FROM "Mi""xed\.schema"\."orders; -- drop"/)
    assert.match(query.sql, /"na""me; \/\* comment \*\/"/)
    assert.match(query.sql, /"select"/)
    assert.match(query.sql, /"été space"/)
    assert.match(query.sql, /SUM\("€ total"\)/)
    assert.deepEqual(query.parameters, [])
  }
})

test('NON-05: GoogleSQL quotes qualified relation and reserved/special column names', () => {
  const query = generateBuilderQuery({
    dialect: 'google-sql',
    table: { schema: 'billing-prod.analytics', name: 'order events' },
    xColumn: 'select',
    xColumnDataType: 'STRING',
    seriesColumns: ['été 2026', 'a`b'],
  })
  assert.match(query.sql, /FROM `billing-prod\.analytics\.order events`/)
  assert.match(query.sql, /\n  `select`,/)
  assert.match(query.sql, /\n  `été 2026`,/)
  // Characterizes actual generator output. Remote GoogleSQL quoted-identifier
  // grammar is not proved by a source-only string assertion.
  assert.ok(query.sql.includes('`a``b`'))
  assert.doesNotMatch(query.sql, /NULLS LAST/)
})

test('NON-05: punctuation, comments and SQL-looking filter values remain parameters', () => {
  const payload = "x'; DROP TABLE audit.events; -- /* ? $1 */"
  for (const dialect of ['postgres', 'duckdb', 'google-sql'] as const) {
    const query = categorical(dialect, [
      promoted(createResultFilter('status', 'equals', payload)),
      promoted(createResultFilter('region', 'notEquals', 'C:\\new\\path')),
    ])
    assert.deepEqual(query.parameters, [payload, 'C:\\new\\path'])
    assert.equal(query.sql.includes(payload), false)
    assert.match(query.sql, /WHERE /)
    assert.match(query.sql, / AND /)
    if (dialect === 'google-sql') {
      assert.match(query.sql, /`status` = \?/)
      assert.match(query.sql, /`region` IS DISTINCT FROM \?/)
      assert.doesNotMatch(query.sql, /\$1/)
    } else {
      assert.match(query.sql, /"status" = \$1/)
      assert.match(query.sql, /"region" IS DISTINCT FROM \$2/)
    }
  }
})

test('NON-05: NULL checks, booleans and negation preserve distinct predicate semantics', () => {
  for (const dialect of ['postgres', 'duckdb', 'google-sql'] as const) {
    const query = categorical(dialect, [
      promoted(createResultFilter('status', 'isNull')),
      promoted(createResultFilter('region', 'notEquals', false)),
    ])
    assert.match(query.sql, /IS NULL AND /)
    assert.match(query.sql, /IS DISTINCT FROM/)
    assert.deepEqual(query.parameters, [false])
  }
})

test('NON-05: unsupported restored operators are dropped before SQL generation', () => {
  const restored = deserializeResultFilters(
    JSON.stringify([
      { id: 'bad', column: 'status', operator: 'like', value: '%' },
      { id: 'good', column: 'status', operator: 'equals', value: 'ok', execution: 'query' },
    ]),
  )
  assert.equal(restored.length, 1)
  const query = categorical('postgres', restored)
  assert.deepEqual(query.parameters, ['ok'])
  assert.doesNotMatch(query.sql, /LIKE/)
})

test('NON-05: unpromotable ranges and unrelated columns fail closed', () => {
  const badRange = promoted(createResultRangeFilter('status', '2026-01-01', '2026-02-01'))
  assert.throws(() => categorical('postgres', [badRange]), /no longer matches/)
  const unrelated = promoted(createResultFilter('other_column', 'equals', 'test'))
  assert.throws(() => categorical('google-sql', [unrelated]), /no longer matches/)
})

test('NON-05: custom time bounds and scalar filters retain parameter ordering by dialect', () => {
  for (const dialect of ['postgres', 'duckdb', 'google-sql'] as const) {
    const query = generateBuilderQuery({
      dialect,
      table: { schema: dialect === 'google-sql' ? 'project.dataset' : 'main', name: 'logs' },
      xColumn: 'status',
      xColumnDataType: 'text',
      timeColumn: 'received_at',
      timeColumnDataType: 'TIMESTAMP',
      timeRange: {
        kind: 'custom',
        startDate: '2026-01-01',
        startTime: '10:00',
        endDate: '2026-01-02',
        endTime: '11:00',
      },
      filters: [promoted(createResultFilter('status', 'equals', 'ok'))],
    })
    assert.equal(query.parameters.length, 3)
    assert.equal(query.parameters[2], 'ok')
    if (dialect === 'google-sql') {
      assert.match(query.sql, /CAST\(\? AS TIMESTAMP\)/)
      assert.match(query.sql, /`status` = \?/)
    } else {
      assert.match(query.sql, /"received_at" >= \$1/)
      assert.match(query.sql, /"received_at" < \$2/)
      assert.match(query.sql, /"status" = \$3/)
    }
  }
})

test('NON-05: tuple filters retain explicit grouping and parameterization', () => {
  const query = generateBuilderQuery({
    table,
    xColumn: 'status',
    xColumnDataType: 'text',
    seriesColumns: ['region'],
    filters: [
      promoted(createResultFilter('region', 'equals', 'EU')),
      promoted(createResultFilter('status', 'isNotNull')),
    ],
  })
  assert.match(query.sql, /WHERE "region" = \$1 AND "status" IS NOT NULL/)
  assert.deepEqual(query.parameters, ['EU'])
})

test('NON-05: literal materializer handles apostrophes, NULL and finite numbers', () => {
  assert.equal(formatPostgresLiteral("a';--"), "'a'';--'")
  assert.equal(formatPostgresLiteral(null), 'NULL')
  assert.equal(formatPostgresLiteral(true), 'TRUE')
  assert.equal(formatPostgresLiteral(false), 'FALSE')
  assert.equal(formatPostgresLiteral(-10.5), '-10.5')
  assert.equal(formatPostgresLiteral(100n), '100')
  assert.throws(() => formatPostgresLiteral(Infinity), /non-finite/)
  assert.equal(
    materializeSqlParameters('SELECT $1, $2, $3, $4', ["O'Brien", null, true, 7]),
    "SELECT 'O''Brien', NULL, TRUE, 7",
  )
  assert.throws(
    () => materializeSqlParameters('SELECT ? + ?', [1]),
    /Missing value/,
  )
})

test.fails('NON-05 finding: PostgreSQL Open in SQL mode must not expand $1 inside quoted identifiers', () => {
  assert.equal(
    materializeSqlParameters('SELECT "$1", $1', ['safe']),
    'SELECT "$1", \'safe\'',
  )
})

test.fails('NON-05 finding: GoogleSQL Open in SQL mode must not consume ? inside quoted identifiers', () => {
  assert.equal(
    materializeSqlParameters('SELECT `status?` FROM `p.d.t` WHERE `status?` = ?', ['paid']),
    "SELECT `status?` FROM `p.d.t` WHERE `status?` = 'paid'",
  )
})

test.fails('NON-05 finding: GoogleSQL promoted filter must preserve double quotes within identifiers', () => {
  const query = generateBuilderQuery({
    dialect: 'google-sql',
    table: { schema: 'project.dataset', name: 'orders' },
    xColumn: 'a"b',
    xColumnDataType: 'STRING',
    filters: [promoted(createResultFilter('a"b', 'equals', 'paid'))],
  })
  assert.match(query.sql, /WHERE `a"b` = \?/)
})
