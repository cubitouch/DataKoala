import test from 'node:test'
import assert from 'node:assert/strict'
import { prometheusRangeBounds, timeRangeChartDomain } from './prometheusTimeRange.ts'

test('prometheusRangeBounds resolves relative picker values against one execution time', () => {
  assert.deepEqual(prometheusRangeBounds({ kind: 'rolling', amount: 6, unit: 'hour' }, new Date('2026-08-14T18:00:00Z')), {
    start: '2026-08-14T12:00:00.000Z', end: '2026-08-14T18:00:00.000Z'
  })
})

test('timeRangeChartDomain exposes explicit bounds for rolling and custom ranges', () => {
  assert.deepEqual(timeRangeChartDomain({ kind: 'rolling', amount: 7, unit: 'day' }, new Date('2026-08-14T18:00:00Z')), {
    min: Date.parse('2026-08-07T18:00:00.000Z'), max: Date.parse('2026-08-14T18:00:00.000Z')
  })
  assert.deepEqual(timeRangeChartDomain({ kind: 'custom', startDate: '2026-08-01', startTime: '08:30', endDate: '2026-08-03', endTime: '17:45' }), {
    min: Date.parse('2026-08-01T08:30:00.000Z'), max: Date.parse('2026-08-03T17:45:00.000Z')
  })
  assert.equal(timeRangeChartDomain({ kind: 'all' }), null)
})
