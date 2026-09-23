import assert from 'node:assert/strict'
import test from 'node:test'
import { chartTimeSelectionRange, effectiveChartTimeDomain, isTemporalChartValues } from './chartRangeSelection.ts'
import { createResultFilter, createResultRangeFilter } from './resultFilters.ts'

const ms = (value: string) => Date.parse(value)
const picker = { min: ms('2026-08-01T00:00:00Z'), max: ms('2026-08-10T00:00:00Z') }
const range = (column: string, start: string, end: string) => createResultRangeFilter(column, start, end)

test('keeps a picker domain when there is no local temporal range', () => {
  assert.deepEqual(effectiveChartTimeDomain(picker, [], 'created_at'), picker)
})

test('uses a local temporal range as the chart domain', () => {
  assert.deepEqual(effectiveChartTimeDomain(null, [range('created_at', '2026-08-02T00:00:00Z', '2026-08-05T00:00:00Z')], 'created_at'), {
    min: ms('2026-08-02T00:00:00Z'), max: ms('2026-08-05T00:00:00Z')
  })
})

test('intersects a local temporal range with the picker domain', () => {
  assert.deepEqual(effectiveChartTimeDomain(picker, [range('created_at', '2026-07-30T00:00:00Z', '2026-08-05T00:00:00Z')], 'created_at'), {
    min: picker.min, max: ms('2026-08-05T00:00:00Z')
  })
})

test('intersects two local temporal ranges', () => {
  const filters = [
    range('created_at', '2026-08-02T00:00:00Z', '2026-08-08T00:00:00Z'),
    range('created_at', '2026-08-04T00:00:00Z', '2026-08-06T00:00:00Z')
  ]
  assert.deepEqual(effectiveChartTimeDomain(null, filters, 'created_at'), {
    min: ms('2026-08-04T00:00:00Z'), max: ms('2026-08-06T00:00:00Z')
  })
})

test('ignores a range on another column', () => {
  assert.deepEqual(effectiveChartTimeDomain(picker, [range('updated_at', '2026-08-02', '2026-08-03')], 'created_at'), picker)
})

test('ignores a query-executed range', () => {
  const filter = { ...range('created_at', '2026-08-02', '2026-08-03'), execution: 'query' as const }
  assert.deepEqual(effectiveChartTimeDomain(picker, [filter], 'created_at'), picker)
})

test('ignores notRange and scalar filters', () => {
  const excluded = createResultRangeFilter('created_at', '2026-08-02', '2026-08-03', true)
  assert.deepEqual(effectiveChartTimeDomain(picker, [excluded, createResultFilter('created_at', 'equals', '2026-08-02')], 'created_at'), picker)
})

test('ignores malformed range bounds', () => {
  assert.deepEqual(effectiveChartTimeDomain(picker, [range('created_at', 'not-a-date', '2026-08-03')], 'created_at'), picker)
})

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
