import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBigQueryRow } from './bigquery-adapter.ts'

class NumericLike {
  readonly value: string
  readonly formatter = () => this.value
  constructor(value: string) { this.value = value }
  toString(): string { return this.value }
}

test('normalizes BigQuery exact decimals to clone-safe precision-preserving strings', () => {
  const row = normalizeBigQueryRow(
    {
      amount: new NumericLike('12345678901234567890.123456789'),
      ratio: '0.123456789',
      count: 42
    },
    [
      { name: 'amount', type: 'NUMERIC' },
      { name: 'ratio', type: 'BIGNUMERIC' },
      { name: 'count', type: 'INTEGER' }
    ]
  )

  assert.deepEqual(row, {
    amount: '12345678901234567890.123456789',
    ratio: '0.123456789',
    count: 42
  })
  assert.doesNotThrow(() => structuredClone(row))
})
