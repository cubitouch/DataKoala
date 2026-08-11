import assert from 'node:assert/strict'
import test from 'node:test'
import { timeBucketRange } from './chartPointFilters.ts'

test('minute bucket creates exact half-open UTC minute boundaries', () => {
  assert.deepEqual(timeBucketRange('2026-08-02T14:37:42.123Z', 'minute'), {
    startInclusive: '2026-08-02T14:37:00.000Z', endExclusive: '2026-08-02T14:38:00.000Z'
  })
})

test('creates UTC half-open calendar bucket ranges', () => {
  assert.deepEqual(timeBucketRange('2026-02-18T15:30:00-05:00', 'day'), {
    startInclusive: '2026-02-18T00:00:00.000Z', endExclusive: '2026-02-19T00:00:00.000Z'
  })
  assert.deepEqual(timeBucketRange('2026-02-18T00:00:00Z', 'week'), {
    startInclusive: '2026-02-16T00:00:00.000Z', endExclusive: '2026-02-23T00:00:00.000Z'
  })
  assert.deepEqual(timeBucketRange('2026-05-18T00:00:00Z', 'quarter'), {
    startInclusive: '2026-04-01T00:00:00.000Z', endExclusive: '2026-07-01T00:00:00.000Z'
  })
})
