import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '../shared/types.ts'
import { toIpcSafeQueryResult, toIpcSafeValue } from './ipc-serialization.ts'

class IntervalLike {
  constructor(public days: number, public hours: number) {}
  format(): string { return `${this.days} days ${this.hours} hours` }
}

test('toIpcSafeValue strips custom prototypes recursively while preserving clone-native values', () => {
  const timestamp = new Date('2026-08-17T12:00:00.000Z')
  const bytes = Buffer.from([1, 2, 3])
  const value = {
    id: 42,
    timestamp,
    interval: new IntervalLike(2, 3),
    nested: [new IntervalLike(0, 4)],
    bytes
  }

  const safe = toIpcSafeValue(value) as Record<string, unknown>
  assert.equal(Object.getPrototypeOf(safe), Object.prototype)
  assert.equal(safe.timestamp, timestamp)
  assert.deepEqual(safe.interval, { days: 2, hours: 3 })
  assert.equal(Object.getPrototypeOf(safe.interval as object), Object.prototype)
  assert.deepEqual(safe.nested, [{ days: 0, hours: 4 }])
  assert.ok(safe.bytes instanceof Uint8Array)
  assert.equal(Buffer.isBuffer(safe.bytes), false)
})

test('toIpcSafeQueryResult normalizes every row without changing result metadata', () => {
  const result: QueryResult = {
    columns: [{ name: 'elapsed', dataTypeID: 1186, dataTypeName: 'interval' }],
    rows: [{ elapsed: new IntervalLike(1, 6) }],
    rowCount: 1,
    durationMs: 9,
    execution: { provider: 'postgres', durationMs: 9, rowCount: 1 }
  }

  const safe = toIpcSafeQueryResult(result)
  assert.deepEqual(safe.rows, [{ elapsed: { days: 1, hours: 6 } }])
  assert.equal(safe.columns, result.columns)
  assert.equal(safe.rowCount, 1)
  assert.equal(safe.durationMs, 9)
  assert.deepEqual(safe.execution, result.execution)
})
