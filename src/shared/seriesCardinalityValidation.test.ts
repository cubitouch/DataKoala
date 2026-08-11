import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_SERIES_PROBE_COLUMNS, MAX_SERIES_PROBE_PREDICATES } from './chartLimits.ts'
import { validateConnectionId, validateSeriesCardinalityRequest, validateSeriesStatisticsRequest } from './seriesCardinalityValidation.ts'
import { buildSeriesCardinalityProbe } from './seriesCardinality.ts'

const valid = { schema: 'odd"schema', table: 'event table', seriesColumns: ['user"id'], predicates: [] }

test('valid quoted identifiers and supported predicates survive runtime validation', () => {
  assert.deepEqual(validateSeriesCardinalityRequest({ ...valid, predicates: [
    { column: 'created"at', operator: 'range', startInclusive: '2026-01-01', endExclusive: '2026-02-01' },
    { column: 'kind', operator: 'equals', value: 'paid' },
    { column: 'deleted_at', operator: 'isNull' }
  ] }).seriesColumns, ['user"id'])
  assert.equal(validateConnectionId('profile-1'), 'profile-1')
  assert.deepEqual(validateSeriesStatisticsRequest({ schema: 'odd"schema', table: 'event table', column: 'user"id' }), { schema: 'odd"schema', table: 'event table', column: 'user"id' })
})

test('validates Builder boundary and rolling predicates and reconstructs them', () => {
  const predicates = [
    { column: 'created_at', operator: 'gte', value: '2026-01-01T00:00', ignored: true },
    { column: 'created_at', operator: 'lt', value: '2026-02-01T00:00' },
    { column: 'created_at', operator: 'rolling', amount: 6, unit: 'month', sql: "DROP TABLE x" }
  ]
  const checked = validateSeriesCardinalityRequest({ ...valid, predicates })
  assert.deepEqual(checked.predicates, [
    { column: 'created_at', operator: 'gte', value: '2026-01-01T00:00' },
    { column: 'created_at', operator: 'lt', value: '2026-02-01T00:00' },
    { column: 'created_at', operator: 'rolling', amount: 6, unit: 'month' }
  ])
  const probe = buildSeriesCardinalityProbe(checked)
  assert.deepEqual(probe.parameters, ['2026-01-01T00:00', '2026-02-01T00:00'])
  assert.match(probe.sql, /"created_at" >= \$1 AND "created_at" < \$2 AND "created_at" >= CURRENT_TIMESTAMP - INTERVAL '6 months'/)
})

test('rejects malformed Builder boundary and rolling predicates', () => {
  for (const predicate of [
    { column: 'at', operator: 'rolling', amount: 5, unit: 'day' },
    { column: 'at', operator: 'rolling', amount: 7, unit: 'week' },
    { column: 'at', operator: 'rolling', amount: '7', unit: 'day' },
    { column: 'at', operator: 'gte' },
    { column: 'at', operator: 'lt', value: '' },
    { column: 'at', operator: 'gte', value: {} },
    { column: 'at', operator: 'lt', value: [] },
    { column: '', operator: 'gte', value: '2026-01-01' },
    { column: 'at', operator: 'gte', value: Number.NaN }
  ]) assert.throws(() => validateSeriesCardinalityRequest({ ...valid, predicates: [predicate] }))
})

test('all supported hourly rolling presets validate and reach equivalent probe SQL', () => {
  const expected = new Map([[1, '1 hour'], [6, '6 hours'], [12, '12 hours'], [24, '1 day']])
  for (const [amount, interval] of expected) {
    const checked = validateSeriesCardinalityRequest({ ...valid, predicates: [{ column: 'created_at', operator: 'rolling', amount, unit: 'hour' }] })
    assert.deepEqual(checked.predicates[0], { column: 'created_at', operator: 'rolling', amount, unit: 'hour' })
    assert.match(buildSeriesCardinalityProbe(checked).sql, new RegExp(`INTERVAL '${interval}'`))
  }
})

test('malformed IPC payloads and connection IDs fail closed', () => {
  assert.throws(() => validateConnectionId(''), /Invalid series cardinality request/)
  assert.throws(() => validateSeriesCardinalityRequest(null), /payload must be an object/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, schema: '' }), /schema/)
  assert.throws(() => validateSeriesStatisticsRequest({ schema: 'public', table: 'events' }), /column/)
})

test('empty and excessive seriesColumns are rejected', () => {
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, seriesColumns: [] }), /seriesColumns/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, seriesColumns: Array.from({ length: MAX_SERIES_PROBE_COLUMNS + 1 }, (_, i) => `c${i}`) }), /seriesColumns/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, seriesColumns: [''] }), /seriesColumns\[0\]/)
})

test('unsupported and malformed predicates are rejected and predicate count is bounded', () => {
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, predicates: [{ column: 'x', operator: 'contains', value: 'a' }] }), /operator is unsupported/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, predicates: [{ column: 'x', operator: 'equals' }] }), /value is required/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, predicates: [{ column: 'x', operator: 'equals', value: Number.NaN }] }), /finite scalar/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, predicates: [{ column: 'x', operator: 'range', startInclusive: '', endExclusive: '2026-01-02' }] }), /startInclusive/)
  assert.throws(() => validateSeriesCardinalityRequest({ ...valid, predicates: Array.from({ length: MAX_SERIES_PROBE_PREDICATES + 1 }, () => ({ column: 'x', operator: 'isNull' })) }), /predicates/)
})
