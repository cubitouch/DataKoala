import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  interpretSeriesStatistics,
  SERIES_STATISTICS_SQL,
} from '@shared/seriesStatistics.ts'
import {
  SeriesCardinalityProbeGuard,
  seriesProbeFingerprint,
} from './seriesCardinalityGuard.ts'

const available = (estimatedDistinct: number) => ({
  available: true,
  estimatedDistinct,
  source: 'pg_stats' as const,
})

test('positive n_distinct is direct and negative n_distinct scales by reltuples', () => {
  assert.deepEqual(
    interpretSeriesStatistics({ n_distinct: 42, reltuples: 10_000 }),
    available(42),
  )
  assert.deepEqual(
    interpretSeriesStatistics({ n_distinct: -0.25, reltuples: 400 }),
    available(100),
  )
})

test('missing and malformed statistics are unavailable', () => {
  assert.equal(interpretSeriesStatistics(undefined).available, false)
  assert.equal(
    interpretSeriesStatistics({ n_distinct: 'bad', reltuples: 100 }).available,
    false,
  )
  assert.equal(
    interpretSeriesStatistics({ n_distinct: -0.2, reltuples: -1 }).available,
    false,
  )
})

test('statistics lookup is parameterized and schema-qualified through catalogues', () => {
  assert.match(SERIES_STATISTICS_SQL, /s\.schemaname = \$1/)
  assert.match(SERIES_STATISTICS_SQL, /s\.tablename = \$2/)
  assert.match(SERIES_STATISTICS_SQL, /s\.attname = \$3/)
  assert.match(SERIES_STATISTICS_SQL, /c\.relnamespace = n\.oid/)
})

test('a stale statistics response cannot approve or reject a newer selection', () => {
  const builder = {
    table: { schema: 'public', name: 'events' },
    timeColumn: 'at',
    timeBucket: 'day' as const,
    seriesColumns: [],
  }
  const guard = new SeriesCardinalityProbeGuard()
  const oldFingerprint = seriesProbeFingerprint({
    profileId: 'one',
    builder,
    seriesColumns: ['country'],
    filters: [],
  })
  const nextFingerprint = seriesProbeFingerprint({
    profileId: 'one',
    builder,
    seriesColumns: ['device'],
    filters: [],
  })
  const old = guard.begin(oldFingerprint)
  guard.begin(nextFingerprint)
  assert.equal(guard.approve(old.revision, oldFingerprint), false)
})
