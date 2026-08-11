import assert from 'node:assert/strict'
import test from 'node:test'
import { interpretSeriesStatistics, SERIES_STATISTICS_SQL } from '../../../shared/seriesStatistics.ts'
import { decideFromSeriesStatistics, SeriesCardinalityProbeGuard, seriesProbeFingerprint, seriesStatisticsFingerprint } from './seriesCardinalityGuard.ts'

const available = (estimatedDistinct: number) => ({ available: true, estimatedDistinct, source: 'pg_stats' as const })

test('positive n_distinct is direct and negative n_distinct scales by reltuples', () => {
  assert.deepEqual(interpretSeriesStatistics({ n_distinct: 42, reltuples: 10_000 }), available(42))
  assert.deepEqual(interpretSeriesStatistics({ n_distinct: -0.25, reltuples: 400 }), available(100))
})

test('missing and malformed statistics are unavailable', () => {
  assert.equal(interpretSeriesStatistics(undefined).available, false)
  assert.equal(interpretSeriesStatistics({ n_distinct: 'bad', reltuples: 100 }).available, false)
  assert.equal(interpretSeriesStatistics({ n_distinct: -0.2, reltuples: -1 }).available, false)
})

test('decisive unfiltered estimates avoid live probing only outside the advisory band', () => {
  assert.equal(decideFromSeriesStatistics(available(50), false, 1), 'accept')
  assert.equal(decideFromSeriesStatistics(available(201), false, 1), 'reject')
  assert.equal(decideFromSeriesStatistics(available(51), false, 1), 'probe')
  assert.equal(decideFromSeriesStatistics(available(200), false, 1), 'probe')
  assert.equal(decideFromSeriesStatistics({ available: false, source: 'pg_stats' }, false, 1), 'probe')
  assert.equal(decideFromSeriesStatistics(available(Number.POSITIVE_INFINITY), false, 1), 'probe')
  assert.equal(decideFromSeriesStatistics(available(-1), false, 1), 'probe')
})

test('filters and multi-column dimensions always force the bounded live probe', () => {
  assert.equal(decideFromSeriesStatistics(available(10), true, 1), 'probe')
  assert.equal(decideFromSeriesStatistics(available(10_000), true, 1), 'probe')
  assert.equal(decideFromSeriesStatistics(available(10), false, 2), 'probe')
})

test('statistics lookup is parameterized and schema-qualified through catalogues', () => {
  assert.match(SERIES_STATISTICS_SQL, /s\.schemaname = \$1/)
  assert.match(SERIES_STATISTICS_SQL, /s\.tablename = \$2/)
  assert.match(SERIES_STATISTICS_SQL, /s\.attname = \$3/)
  assert.match(SERIES_STATISTICS_SQL, /c\.relnamespace = n\.oid/)
})

test('statistics cache keys are scoped by profile, schema, table, and column', () => {
  const builder = { table: { schema: 'public', name: 'events' }, timeColumn: 'at', timeBucket: 'day' as const, seriesColumns: [] }
  const key = (profileId: string, schema: string, table: string, column: string) => seriesStatisticsFingerprint({ profileId, builder: { ...builder, table: { schema, name: table } }, seriesColumns: [column] })
  const original = key('one', 'public', 'events', 'country')
  assert.notEqual(key('two', 'public', 'events', 'country'), original)
  assert.notEqual(key('one', 'other', 'events', 'country'), original)
  assert.notEqual(key('one', 'public', 'sessions', 'country'), original)
  assert.notEqual(key('one', 'public', 'events', 'device'), original)
})

test('a stale statistics response cannot approve or reject a newer selection', () => {
  const builder = { table: { schema: 'public', name: 'events' }, timeColumn: 'at', timeBucket: 'day' as const, seriesColumns: [] }
  const guard = new SeriesCardinalityProbeGuard()
  const oldFingerprint = seriesProbeFingerprint({ profileId: 'one', builder, seriesColumns: ['country'], filters: [] })
  const nextFingerprint = seriesProbeFingerprint({ profileId: 'one', builder, seriesColumns: ['device'], filters: [] })
  const old = guard.begin(oldFingerprint)
  guard.begin(nextFingerprint)
  assert.equal(guard.approve(old.revision, oldFingerprint), false)
})
