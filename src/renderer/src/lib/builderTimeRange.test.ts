import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBuilderQuery } from './builderSql.ts'
import { builderTimeRangeSummary, normalizeBuilderTimeRange, timeRangeProbePredicates, validateBuilderTimeRange } from './builderTimeRange.ts'

const base = { table: { schema: 'public', name: 'events' }, timeColumn: 'at', timeBucket: 'day' as const }

test('custom date-time query bounds and validation', () => {
  const range = { kind: 'custom' as const, startDate: '2026-07-01', startTime: '00:45', endDate: '2026-07-31', endTime: '00:39', recurringWindows: [] }
  const q = generateBuilderQuery({ ...base, timeRange: range })
  assert.deepEqual(q.parameters, ['2026-07-01T00:45', '2026-07-31T00:39'])
  assert.equal(validateBuilderTimeRange(range), null)
  assert.match(validateBuilderTimeRange({ ...range, endDate: '2026-07-01' }) ?? '', /later/)
  assert.deepEqual(timeRangeProbePredicates(range, 'at').map((p) => 'value' in p ? p.value : null), ['2026-07-01T00:45', '2026-07-31T00:39'])
})

test('recurring windows generate same-day and overnight SQL for timestamp and timestamptz', () => {
  const range = { kind: 'custom' as const, startDate: '2026-07-01', startTime: '00:00', endDate: '2026-07-02', endTime: '00:00', recurringWindows: [{ id: 'day', from: '09:00', to: '17:00' }, { id: 'night', from: '22:00', to: '02:00' }] }
  const q = generateBuilderQuery({ ...base, timeColumnDataType: 'timestamp', timeRange: range })
  assert.deepEqual(q.parameters, ['2026-07-01T00:00', '2026-07-02T00:00', '09:00', '17:00', '22:00', '02:00'])
  assert.match(q.sql, /\("at"::time >= \$3::time AND "at"::time < \$4::time\) OR \("at"::time >= \$5::time OR "at"::time < \$6::time\)/)
  const tz = generateBuilderQuery({ ...base, timeColumnDataType: 'timestamptz', timeRange: range })
  assert.match(tz.sql, /\("at" AT TIME ZONE current_setting\('TimeZone'\)\)::time/)
})

test('rolling ranges keep and apply recurring daily windows', () => {
  const range = { kind: 'rolling' as const, amount: 24 as const, unit: 'hour' as const, recurringWindows: [{ id: 'workday', from: '09:00', to: '17:00' }] }
  const q = generateBuilderQuery({ ...base, timeColumnDataType: 'timestamp', timeRange: range })
  assert.match(q.sql, /"at" >= CURRENT_TIMESTAMP - INTERVAL '1 day'/)
  assert.match(q.sql, /"at"::time >= \$1::time AND "at"::time < \$2::time/)
  assert.deepEqual(q.parameters, ['09:00', '17:00'])
  assert.equal(validateBuilderTimeRange(range), null)
  assert.equal(builderTimeRangeSummary(range), 'Last day · 1 daily window')
})

test('rolling recurring windows validate overlaps and normalize empty rows', () => {
  const invalid = { kind: 'rolling' as const, amount: 7 as const, unit: 'day' as const, recurringWindows: [{ id: 'a', from: '09:00', to: '12:00' }, { id: 'b', from: '11:00', to: '13:00' }] }
  assert.match(validateBuilderTimeRange(invalid) ?? '', /overlaps/)
  const normalized = normalizeBuilderTimeRange({ kind: 'rolling', amount: 7, unit: 'day', recurringWindows: [{ id: 'empty', from: '', to: '' }, { id: 'workday', from: '09:00', to: '17:00' }] })
  assert.deepEqual(normalized.recurringWindows, [{ id: 'workday', from: '09:00', to: '17:00' }])
})

test('summaries use centralized concise labels', () => {
  assert.equal(builderTimeRangeSummary({ kind: 'all' }), 'All time')
  assert.equal(builderTimeRangeSummary({ kind: 'rolling', amount: 1, unit: 'hour' }), 'Last hour')
  assert.equal(builderTimeRangeSummary({ kind: 'rolling', amount: 7, unit: 'day' }), 'Last 7 days')
  assert.equal(builderTimeRangeSummary({ kind: 'custom', startDate: '2026-07-01', startTime: '00:45', endDate: '2026-07-31', endTime: '00:39', recurringWindows: [{ id: 'w', from: '09:00', to: '17:00' }] }), 'Jul 1, 2026 00:45 – Jul 31, 2026 00:39 · 1 daily window')
})
