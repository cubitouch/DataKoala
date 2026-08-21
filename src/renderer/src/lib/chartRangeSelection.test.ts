import assert from 'node:assert/strict'
import test from 'node:test'
import { chartTimeSelectionRange, isTemporalChartValues } from './chartRangeSelection.ts'

test('recognizes temporal chart values only when every X value is date-like', () => {
  assert.equal(isTemporalChartValues(['2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z']), true)
  assert.equal(isTemporalChartValues(['2026-08-01T00:00:00Z', 'west']), false)
  assert.equal(isTemporalChartValues([]), false)
})

test('converts a SQL category brush to a half-open range ending at the next point', () => {
  const values = ['2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z', '2026-08-03T00:00:00Z']
  assert.deepEqual(chartTimeSelectionRange([0, 1], values), {
    startInclusive: '2026-08-01T00:00:00.000Z',
    endExclusive: '2026-08-03T00:00:00.000Z'
  })
})

test('converts real time-axis coordinates even when selection boundaries fall between points', () => {
  const values = ['2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z']
  const start = Date.parse('2026-08-01T06:00:00Z')
  const end = Date.parse('2026-08-01T18:00:00Z')
  assert.deepEqual(chartTimeSelectionRange([end, start], values), {
    startInclusive: '2026-08-01T06:00:00.000Z',
    endExclusive: '2026-08-01T18:00:00.000Z'
  })
})

test('includes the final SQL point without inventing a large time window', () => {
  const values = ['2026-08-01T10:00:00Z', '2026-08-01T11:00:00Z']
  assert.deepEqual(chartTimeSelectionRange([1, 1], values), {
    startInclusive: '2026-08-01T11:00:00.000Z',
    endExclusive: '2026-08-01T11:00:00.001Z'
  })
})

test('uses complete Builder bucket boundaries so promoted filters target source time', () => {
  const values = ['2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z', '2026-08-03T00:00:00Z']
  assert.deepEqual(chartTimeSelectionRange([2, 1], values, 'day'), {
    startInclusive: '2026-08-02T00:00:00.000Z',
    endExclusive: '2026-08-04T00:00:00.000Z'
  })
})

test('rejects non-temporal and malformed brush ranges', () => {
  assert.equal(chartTimeSelectionRange([0, 1], ['a', 'b']), null)
  assert.equal(chartTimeSelectionRange([0], ['2026-08-01T00:00:00Z']), null)
})
