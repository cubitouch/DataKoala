import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGcxQuery } from './gcx-prometheus-transport.ts'

test('normalizes Prometheus special float sample strings', () => {
  const result = normalizeGcxQuery({
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [{
        metric: { consumer: 'example' },
        values: [
          [1_700_000_000, 'NaN'],
          [1_700_000_001, '+Inf'],
          [1_700_000_002, '-Inf']
        ]
      }]
    }
  })

  assert.equal(result.rowCount, 3)
  assert.equal(Number.isNaN(result.rows[0].value), true)
  assert.equal(result.rows[1].value, Number.POSITIVE_INFINITY)
  assert.equal(result.rows[2].value, Number.NEGATIVE_INFINITY)
  assert.equal(result.rows[0].consumer, 'example')
})

test('still rejects genuinely non-numeric Prometheus sample strings', () => {
  assert.throws(() => normalizeGcxQuery({
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [{ metric: {}, values: [[1_700_000_000, 'not-a-number']] }]
    }
  }), /non-numeric range sample value/)
})
