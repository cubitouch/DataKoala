import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSeriesCardinalityProbe } from '../../../shared/seriesCardinality.ts'
import { CHART_SERIES_HARD_LIMIT } from '../../../shared/chartLimits.ts'
import { isSeriesColumnRemoval, SeriesCardinalityProbeGuard, selectionAfterCardinalityProbe, seriesProbeFingerprint } from './seriesCardinalityGuard.ts'

test('high-cardinality selection preserves previous selection and safe selection commits', () => {
  assert.deepEqual(selectionAfterCardinalityProbe(['country'], ['device'], true), ['country'])
  assert.deepEqual(selectionAfterCardinalityProbe(['country'], ['device'], false), ['device'])
})

test('stale probe response cannot approve an old candidate', () => {
  const guard = new SeriesCardinalityProbeGuard()
  const old = guard.begin('old')
  guard.begin('new')
  assert.equal(guard.approve(old.revision, 'old'), false)
})

test('table and time-range changes invalidate the cache fingerprint', () => {
  const builder = { table: { schema: 'public', name: 'events' }, timeColumn: 'created_at', timeBucket: 'day' as const, seriesColumns: [] }
  const base = { profileId: 'one', builder, seriesColumns: ['country'], filters: [] }
  const original = seriesProbeFingerprint(base)
  assert.notEqual(seriesProbeFingerprint({ ...base, builder: { ...builder, table: { schema: 'public', name: 'sessions' } } }), original)
  assert.notEqual(seriesProbeFingerprint({ ...base, builder: { ...builder, timeBucket: 'month' } }), original)
  assert.notEqual(seriesProbeFingerprint({ ...base, builder: { ...builder, timeRange: { kind: 'rolling', amount: 30, unit: 'day' } } }), original)
})

test('probe SQL safely quotes identifiers, stays bounded, and parameterizes predicates', () => {
  const probe = buildSeriesCardinalityProbe({ schema: 'odd"schema', table: 'event table', seriesColumns: ['user"id'], predicates: [{ column: 'created"at', operator: 'range', startInclusive: '2026-01-01', endExclusive: '2026-02-01' }] })
  assert.match(probe.sql, /"odd""schema"\."event table"/)
  assert.match(probe.sql, /"user""id"/)
  assert.match(probe.sql, new RegExp(`LIMIT ${CHART_SERIES_HARD_LIMIT + 1}`))
  assert.doesNotMatch(probe.sql, /2026-01-01/)
  assert.deepEqual(probe.parameters, ['2026-01-01', '2026-02-01'])
})

test('probe selects a collision-safe tuple while grouping each source column', () => {
  const probe = buildSeriesCardinalityProbe({ schema: 'public', table: 'events', seriesColumns: ['country', 'device'], predicates: [] })
  assert.match(probe.sql, /SELECT \("country", "device"\)/)
  assert.match(probe.sql, /GROUP BY "country", "device"/)
  // 50 × 40 is represented by the combined tuple probe, whose bounded result
  // would be 101 and therefore preserves the prior valid selection.
  assert.deepEqual(selectionAfterCardinalityProbe(['country'], ['country', 'device'], Math.min(50 * 40, CHART_SERIES_HARD_LIMIT + 1) > CHART_SERIES_HARD_LIMIT), ['country'])
  assert.deepEqual(selectionAfterCardinalityProbe(['country'], ['country', 'device'], 50 > CHART_SERIES_HARD_LIMIT), ['country', 'device'])
})

test('ordered proposed series columns participate in fingerprints and stale approval', () => {
  const builder = { table: { schema: 'public', name: 'events' }, timeColumn: 'at', timeBucket: 'day' as const, seriesColumns: ['country'] }
  const countryDevice = seriesProbeFingerprint({ profileId: 'one', builder, seriesColumns: ['country', 'device'], filters: [] })
  const deviceCountry = seriesProbeFingerprint({ profileId: 'one', builder, seriesColumns: ['device', 'country'], filters: [] })
  assert.notEqual(countryDevice, deviceCountry)
  const guard = new SeriesCardinalityProbeGuard()
  const old = guard.begin(countryDevice)
  guard.begin(deviceCountry)
  assert.equal(guard.approve(old.revision, countryDevice), false)
  assert.equal(isSeriesColumnRemoval(['country', 'device'], ['country']), true)
  assert.equal(isSeriesColumnRemoval(['country', 'device'], ['device', 'country']), false, 'reordering must probe')
})

test('invalidation clears current work, ignores old success/error, and permits retry', () => {
  const guard = new SeriesCardinalityProbeGuard()
  const bucketProbe = guard.begin('day')
  guard.invalidate()
  assert.equal(guard.isCurrent(bucketProbe.revision, 'day'), false, 'old bucket response is stale')
  const retry = guard.begin('month')
  assert.equal(guard.approve(retry.revision, 'month'), true, 'retry after invalidation works')

  const tableProbe = guard.begin('old-table')
  guard.invalidate()
  assert.equal(guard.isCurrent(tableProbe.revision, 'old-table'), false, 'old table errors cannot become current')
  const current = guard.begin('new-table')
  assert.equal(guard.isCurrent(tableProbe.revision, 'old-table'), false, 'stale response cannot overwrite current state')
  assert.equal(guard.isCurrent(current.revision, 'new-table'), true)
})
