import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSeriesCardinalityProbe } from './seriesCardinality.ts'

test('GoogleSQL cardinality groups each Series column while selecting a STRUCT tuple', () => {
  const probe = buildSeriesCardinalityProbe({ schema: 'my-project.analytics', table: 'events', seriesColumns: ['region', 'currency'], predicates: [] }, 'google-sql')
  assert.match(probe.sql, /SELECT STRUCT\(`region`, `currency`\)/)
  assert.match(probe.sql, /GROUP BY `region`, `currency`/)
  assert.doesNotMatch(probe.sql, /GROUP BY STRUCT/)
  assert.match(probe.sql, /FROM `my-project\.analytics\.events`/)
})

test('GoogleSQL cardinality rolling ranges are type-aware, including TIMESTAMP months', () => {
  const cases = [
    ['date', /DATE_SUB\(CURRENT_DATE\(\), INTERVAL 3 MONTH\)/],
    ['datetime', /DATETIME_SUB\(CURRENT_DATETIME\(\), INTERVAL 3 MONTH\)/],
    ['timestamp', /TIMESTAMP\(DATETIME_SUB\(DATETIME\(CURRENT_TIMESTAMP\(\)\), INTERVAL 3 MONTH\)\)/]
  ] as const
  for (const [temporalType, expected] of cases) {
    const probe = buildSeriesCardinalityProbe({ schema: 'p.d', table: 't', seriesColumns: ['series'], predicates: [{ column: 'at', operator: 'rolling', amount: 3, unit: 'month', temporalType }] }, 'google-sql')
    assert.match(probe.sql, expected)
  }
})

test('GoogleSQL DATE cardinality uses timestamp subtraction for minute ranges', () => {
  for (const amount of [15, 30] as const) {
    const probe = buildSeriesCardinalityProbe({ schema: 'p.d', table: 't', seriesColumns: ['series'], predicates: [{ column: 'at', operator: 'rolling', amount, unit: 'minute', temporalType: 'date' }] }, 'google-sql')
    assert.match(probe.sql, new RegExp(`DATE\\(TIMESTAMP_SUB\\(CURRENT_TIMESTAMP\\(\\), INTERVAL ${amount} MINUTE\\)\\)`))
    assert.doesNotMatch(probe.sql, /DATE_SUB\(CURRENT_DATE\(\), INTERVAL \d+ MINUTE\)/)
  }
})

test('GoogleSQL cardinality casts temporal string parameters and strips DATE times', () => {
  const probe = buildSeriesCardinalityProbe({ schema: 'p.d', table: 't', seriesColumns: ['series'], predicates: [
    { column: 'd', operator: 'range', startInclusive: '2026-01-02T03:04', endExclusive: '2026-02-03T04:05', temporalType: 'date' },
    { column: 'dt', operator: 'gte', value: '2026-01-02T03:04', temporalType: 'datetime' }
  ] }, 'google-sql')
  assert.match(probe.sql, /`d` >= CAST\(\? AS DATE\) AND `d` < CAST\(\? AS DATE\)/)
  assert.match(probe.sql, /`dt` >= CAST\(\? AS DATETIME\)/)
  assert.deepEqual(probe.parameters, ['2026-01-02', '2026-02-03', '2026-01-02T03:04'])
})

test('GoogleSQL cardinality normalizes minute-precision TIMESTAMP bounds without changing DATETIME', () => {
  const probe = buildSeriesCardinalityProbe({ schema: 'p.d', table: 't', seriesColumns: ['currency'], predicates: [
    { column: 'date_creation', operator: 'gte', value: '2026-08-13T01:00', temporalType: 'timestamp' },
    { column: 'date_creation', operator: 'lt', value: '2026-08-14T02:30', temporalType: 'timestamp' },
    { column: 'local_time', operator: 'gte', value: '2026-08-13T01:00', temporalType: 'datetime' }
  ] }, 'google-sql')
  assert.match(probe.sql, /`date_creation` >= CAST\(\? AS TIMESTAMP\)/)
  assert.match(probe.sql, /`date_creation` < CAST\(\? AS TIMESTAMP\)/)
  assert.match(probe.sql, /`local_time` >= CAST\(\? AS DATETIME\)/)
  assert.deepEqual(probe.parameters, ['2026-08-13T01:00:00Z', '2026-08-14T02:30:00Z', '2026-08-13T01:00'])
})
