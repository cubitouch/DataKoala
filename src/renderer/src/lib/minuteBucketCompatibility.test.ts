import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBuilderQuery } from './builderSql.ts'
import { compatibleTimeBucket, isMinuteBucketAvailable, MINUTE_BUCKET_UNAVAILABLE_REASON, type BuilderTimeRange } from './builderTimeRange.ts'
import { transitionBuilderState } from './builderTransitions.ts'

const custom = (startDate: string | null, startTime: string, endDate: string | null, endTime: string): BuilderTimeRange => ({
  kind: 'custom', startDate, startTime, endDate, endTime, recurringWindows: []
})

const baseBuilder = {
  table: { schema: 'public', name: 'events' },
  timeColumn: 'created_at',
  timeBucket: 'minute' as const,
  seriesColumns: []
}

for (const range of [
  { kind: 'rolling', amount: 1, unit: 'hour' } as const,
  { kind: 'rolling', amount: 6, unit: 'hour' } as const,
  { kind: 'rolling', amount: 12, unit: 'hour' } as const,
  { kind: 'rolling', amount: 24, unit: 'hour' } as const,
  custom('2026-08-01', '00:00', '2026-08-01', '23:59'),
  custom('2026-08-01', '00:00', '2026-08-02', '00:00')
]) {
  test(`Minute remains available for ${JSON.stringify(range)}`, () => {
    assert.equal(isMinuteBucketAvailable(range), true)
    assert.equal(compatibleTimeBucket('minute', range), 'minute')
  })
}

for (const range of [
  { kind: 'all' } as const,
  { kind: 'rolling', amount: 7, unit: 'day' } as const,
  { kind: 'rolling', amount: 30, unit: 'day' } as const,
  { kind: 'rolling', amount: 3, unit: 'month' } as const,
  custom('2026-08-01', '00:00', '2026-08-02', '00:01'),
  custom('2026-08-01', '00:00', null, '00:00'),
  custom(null, '00:00', '2026-08-02', '00:00'),
  custom('2026-08-02', '00:00', '2026-08-01', '00:00')
]) {
  test(`Minute is unavailable for ${JSON.stringify(range)}`, () => {
    assert.equal(isMinuteBucketAvailable(range), false)
    assert.equal(compatibleTimeBucket('minute', range), 'hour')
  })
}

test('Builder transitions replace stale Minute state with Hour and explain the fallback', () => {
  const result = transitionBuilderState({ builder: baseBuilder, builderResultFilters: [] }, {
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' }
  })
  assert.equal(result.builder.timeBucket, 'hour')
  assert.match(result.removedDescriptions.join(' '), /Changed Time bucket to Hour/)
})

test('SQL generation rejects hidden or stale incompatible Minute semantics', () => {
  assert.throws(() => generateBuilderQuery({
    ...baseBuilder,
    table: baseBuilder.table,
    timeColumn: baseBuilder.timeColumn,
    timeRange: { kind: 'rolling', amount: 7, unit: 'day' }
  }), new RegExp(MINUTE_BUCKET_UNAVAILABLE_REASON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
