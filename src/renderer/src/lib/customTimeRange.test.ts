import test from 'node:test'
import assert from 'node:assert/strict'
import { customRangeToQueryBounds, normalizeCustomRange, quickRanges, validateCustomRange } from './customTimeRange.ts'

test('custom date-time ranges emit explicit half-open bounds', () => {
  assert.deepEqual(customRangeToQueryBounds({ startDate: '2026-07-01', startTime: '00:45', endDate: '2026-07-31', endTime: '00:39', recurringWindows: [] }), { startInclusive: '2026-07-01T00:45', endExclusive: '2026-07-31T00:39' })
})

test('quick ranges use all-day half-open boundaries', () => {
  const ranges = Object.fromEntries(quickRanges('2026-06-17').map((r) => [r.id, r]))
  assert.deepEqual([ranges['this-week'].startDate, ranges['this-week'].endDate], ['2026-06-15', '2026-06-22'])
  assert.deepEqual([ranges['last-week'].startDate, ranges['last-week'].endDate], ['2026-06-08', '2026-06-15'])
})

test('custom range validation compares complete datetimes', () => {
  const base = { startDate: '2026-07-01', startTime: '00:45', endDate: '2026-07-31', endTime: '00:39', recurringWindows: [] }
  assert.equal(validateCustomRange(base), null)
  assert.match(validateCustomRange({ ...base, endDate: '2026-07-01' }) ?? '', /later/)
  assert.equal(validateCustomRange({ ...base, startTime: '10:00', endDate: '2026-07-02', endTime: '09:00' }), null)
  assert.match(validateCustomRange({ ...base, startTime: '10:00', endDate: '2026-07-01', endTime: '10:00' }) ?? '', /later/)
})

test('recurring windows validate overnight overlaps and adjacency', () => {
  const value = { startDate: '2026-06-15', startTime: '00:00', endDate: '2026-06-21', endTime: '00:00', recurringWindows: [{ id: 'a', from: '09:00', to: '12:00' }, { id: 'b', from: '12:00', to: '17:00' }] }
  assert.equal(validateCustomRange(value), null)
  assert.equal(validateCustomRange({ ...value, recurringWindows: [{ id: 'x', from: '22:00', to: '02:00' }] }), null)
  assert.match(validateCustomRange({ ...value, recurringWindows: [{ id: 'x', from: '09:00', to: '09:00' }] }) ?? '', /differ/)
  assert.match(validateCustomRange({ ...value, recurringWindows: [{ id: 'x', from: '22:00', to: '02:00' }, { id: 'y', from: '01:00', to: '03:00' }] }) ?? '', /overlaps/)
  assert.match(validateCustomRange({ ...value, recurringWindows: [{ id: 'x', from: '22:00', to: '02:00' }, { id: 'y', from: '21:00', to: '23:00' }] }) ?? '', /overlaps/)
})

test('normalization sorts recurring windows deterministically', () => {
  const value = { startDate: '2026-06-15', startTime: '00:00', endDate: '2026-06-21', endTime: '00:00', recurringWindows: [{ id: 'b', from: '15:00', to: '18:00' }, { id: 'a', from: '09:00', to: '14:00' }] }
  assert.equal(normalizeCustomRange(value).recurringWindows[0].id, 'a')
})
