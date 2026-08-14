import test from 'node:test'
import assert from 'node:assert/strict'
import { prometheusRangeBounds } from './prometheusTimeRange.ts'

test('prometheusRangeBounds resolves relative picker values against one execution time', () => {
  assert.deepEqual(prometheusRangeBounds({ kind: 'rolling', amount: 6, unit: 'hour' }, new Date('2026-08-14T18:00:00Z')), {
    start: '2026-08-14T12:00:00.000Z', end: '2026-08-14T18:00:00.000Z'
  })
})
