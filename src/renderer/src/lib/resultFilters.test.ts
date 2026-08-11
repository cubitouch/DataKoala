import assert from 'node:assert/strict'
import test from 'node:test'
import { applyResultFilters, createResultFilter, createResultRangeFilter, deduplicateResultFilters, filterQueryResult, resultFilterLabel, resultValuesEqual, type ResultFilter } from './resultFilters.ts'

test('applies multiple filters with AND semantics', () => {
  const rows = [
    { team: 'red', score: 2 },
    { team: 'red', score: 3 },
    { team: 'blue', score: 3 }
  ]
  const filters = [createResultFilter('team', 'equals', 'red'), createResultFilter('score', 'notEquals', 2)]
  assert.deepEqual(applyResultFilters(rows, filters), [{ team: 'red', score: 3 }])
})

test('handles null filters without treating other falsy values as null', () => {
  const rows = [{ value: null }, { value: undefined }, { value: false }, { value: 0 }]
  assert.deepEqual(applyResultFilters(rows, [createResultFilter('value', 'isNull')]), rows.slice(0, 2))
  assert.deepEqual(applyResultFilters(rows, [createResultFilter('value', 'isNotNull')]), rows.slice(2))
})

test('uses type-aware scalar and date equality', () => {
  const instant = new Date('2025-01-02T03:04:05.000Z')
  assert.equal(resultValuesEqual(1, 1), true)
  assert.equal(resultValuesEqual(1, '1'), false)
  assert.equal(resultValuesEqual(false, 0), false)
  assert.equal(resultValuesEqual(instant, { type: 'date', value: instant.toISOString() }), true)
})

test('creates stable serializable IDs and deduplicates equivalent filters', () => {
  const first = createResultFilter('created at', 'equals', new Date('2025-01-02T03:04:05Z'))
  const second = createResultFilter('created at', 'equals', new Date('2025-01-02T03:04:05Z'))
  assert.equal(first.id, second.id)
  assert.doesNotThrow(() => JSON.stringify(first))
  assert.deepEqual(deduplicateResultFilters([first, second]), [first])
  assert.equal(resultFilterLabel(first), 'created at = 2025-01-02T03:04:05.000Z')
})

test('applies include and exclude half-open date ranges', () => {
  const rows = [
    { at: new Date('2025-01-01T00:00:00Z') },
    { at: '2025-01-31T23:59:59Z' },
    { at: new Date('2025-02-01T00:00:00Z') },
    { at: 'not a date' }
  ]
  const include = createResultRangeFilter('at', '2025-01-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z')
  assert.deepEqual(applyResultFilters(rows, [include]), rows.slice(0, 2))
  assert.deepEqual(applyResultFilters(rows, [createResultRangeFilter('at', include.startInclusive, include.endExclusive, true)]), rows.slice(2))
  assert.match(resultFilterLabel(include), /\[2025-01-01.*2025-02-01.*\)/)
})

test('returns filtered query metadata without mutating the raw result', () => {
  const raw = { columns: [], rows: [{ n: 1 }, { n: 2 }], rowCount: 2, durationMs: 4 }
  const filtered = filterQueryResult(raw, [createResultFilter('n', 'equals', 2)])
  assert.equal(filtered.rowCount, 1)
  assert.equal(filtered.filteredRowCount, 1)
  assert.equal(filtered.originalRowCount, 2)
  assert.equal(raw.rowCount, 2)
})

test('promoted filters leave client rows untouched and wrap SQL with parameters', async () => {
  const { wrapSqlWithResultFilters } = await import('./resultFilters.ts')
  const promoted = { ...createResultFilter('status', 'equals', 'ready'), execution: 'query' as const }
  assert.deepEqual(applyResultFilters([{ status: 'other' }], [promoted]), [{ status: 'other' }])
  assert.deepEqual(wrapSqlWithResultFilters('select status from jobs;', [promoted]), {
    sql: 'SELECT *\nFROM (\nselect status from jobs\n) AS "_datakoala_source"\nWHERE "_datakoala_source"."status" = $1',
    parameters: ['ready']
  })
})

test('wraps BigQuery filters with GoogleSQL identifiers and positional parameters', async () => {
  const { wrapSqlWithResultFilters } = await import('./resultFilters.ts')
  const filters: ResultFilter[] = [
    { id: 'eq', column: 'region', operator: 'equals', value: 'EU', execution: 'query' },
    { id: 'neq', column: 'status', operator: 'notEquals', value: 'void', execution: 'query' },
    { id: 'null', column: 'deleted_at', operator: 'isNull', execution: 'query' },
    { id: 'range', column: 'created_at', operator: 'range', startInclusive: '2026-01-01', endExclusive: '2026-02-01', execution: 'query', nativeType: 'TIMESTAMP' }
  ]
  const wrapped = wrapSqlWithResultFilters('SELECT region, status, deleted_at, created_at FROM `p.d.t`;', filters, 'google-sql')!
  assert.match(wrapped.sql, /AS `_datakoala_source`/)
  assert.match(wrapped.sql, /`_datakoala_source`\.`region` = \?/)
  assert.match(wrapped.sql, /`_datakoala_source`\.`status` IS DISTINCT FROM \?/)
  assert.match(wrapped.sql, /`_datakoala_source`\.`deleted_at` IS NULL/)
  assert.match(wrapped.sql, /`_datakoala_source`\.`created_at` >= CAST\(\? AS TIMESTAMP\) AND `_datakoala_source`\.`created_at` < CAST\(\? AS TIMESTAMP\)/)
  assert.deepEqual(wrapped.parameters, ['EU', 'void', '2026-01-01', '2026-02-01'])
  assert.doesNotMatch(wrapped.sql, /\$\d+|"_datakoala_source"/)
})

test('preserves BigQuery scalar types when promoting renderer-safe values', async () => {
  const { wrapSqlWithResultFilters } = await import('./resultFilters.ts')
  const cases = [
    ['INT64', '9007199254740993', 'INT64'], ['NUMERIC', '1234567890.123456789', 'NUMERIC'],
    ['BIGNUMERIC', '1.00000000000000000000000000000000000001', 'BIGNUMERIC'], ['DATE', '2026-01-02', 'DATE'],
    ['DATETIME', '2026-01-02 03:04:05', 'DATETIME'], ['TIMESTAMP', '2026-01-02T03:04:05.000Z', 'TIMESTAMP'],
    ['BOOL', true, 'BOOL']
  ] as const
  for (const [nativeType, value, cast] of cases) {
    const filter = { ...createResultFilter('metric', 'equals', value, nativeType), execution: 'query' as const }
    const wrapped = wrapSqlWithResultFilters('SELECT metric FROM `p.d.t`', [filter], 'google-sql')!
    assert.match(wrapped.sql, new RegExp(`metric` + '` = CAST\\(\\? AS ' + cast + '\\)'))
    assert.deepEqual(wrapped.parameters, [value])
  }
})

test('uses DATE-only typed bounds for promoted BigQuery ranges', async () => {
  const { wrapSqlWithResultFilters } = await import('./resultFilters.ts')
  const filter = { ...createResultRangeFilter('d', '2026-01-02T03:04:05Z', '2026-02-03T04:05:06Z', false, 'DATE'), execution: 'query' as const }
  const wrapped = wrapSqlWithResultFilters('SELECT d FROM `p.d.t`', [filter], 'google-sql')!
  assert.match(wrapped.sql, /`d` >= CAST\(\? AS DATE\).*`d` < CAST\(\? AS DATE\)/)
  assert.deepEqual(wrapped.parameters, ['2026-01-02', '2026-02-03'])
})

test('demoted and cleared filters resume client semantics', () => {
  const promoted = { ...createResultFilter('status', 'equals', 'ready'), execution: 'query' as const }
  assert.deepEqual(applyResultFilters([{ status: 'other' }], [{ ...promoted, execution: 'client' }]), [])
  assert.deepEqual(applyResultFilters([{ status: 'other' }], []), [{ status: 'other' }])
})
