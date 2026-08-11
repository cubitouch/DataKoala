import assert from 'node:assert/strict'
import test from 'node:test'
import { isJsonColumnType, normalizeJsonCellValue, normalizePostgresTypeName } from './jsonCell.ts'

test('normalizes parsed and stringified JSON values with two-space formatting', () => {
  assert.equal(normalizeJsonCellValue({ a: 1, b: [true, null] }).status, 'valid')
  assert.equal(normalizeJsonCellValue([1, { a: 'b' }]).status, 'valid')
  assert.deepEqual(normalizeJsonCellValue('{"a":1}'), { status: 'valid', value: { a: 1 }, formatted: '{\n  "a": 1\n}' })
  assert.equal(normalizeJsonCellValue('[1,2]').status, 'valid')
  assert.deepEqual(normalizeJsonCellValue('"scalar"'), { status: 'valid', value: 'scalar', formatted: '"scalar"' })
  assert.deepEqual(normalizeJsonCellValue(42), { status: 'valid', value: 42, formatted: '42' })
  assert.deepEqual(normalizeJsonCellValue(false), { status: 'valid', value: false, formatted: 'false' })
  assert.deepEqual(normalizeJsonCellValue(null), { status: 'valid', value: null, formatted: 'null' })
})

test('invalid and unsupported JSON values fail safely', () => {
  assert.equal(normalizeJsonCellValue('{nope').status, 'invalid')
  assert.equal(normalizeJsonCellValue(undefined).status, 'invalid')
  const circular: Record<string, unknown> = {}
  circular.self = circular
  const normalized = normalizeJsonCellValue(circular)
  assert.equal(normalized.status, 'invalid')
  if (normalized.status === 'invalid') assert.equal(normalized.message, 'This JSON value could not be formatted.')
})

test('normalization does not mutate original object', () => {
  const value = { a: { b: 1 } }
  const before = JSON.stringify(value)
  normalizeJsonCellValue(value)
  assert.equal(JSON.stringify(value), before)
})

test('detects PostgreSQL json and jsonb types centrally', () => {
  assert.equal(normalizePostgresTypeName('pg_catalog.JSONB'), 'jsonb')
  assert.equal(isJsonColumnType({ dataTypeName: 'json', dataTypeID: 0 }), true)
  assert.equal(isJsonColumnType({ dataTypeName: 'JSONB', dataTypeID: 0 }), true)
  assert.equal(isJsonColumnType({ dataTypeName: 'text', dataTypeID: 114 }), true)
  assert.equal(isJsonColumnType({ dataTypeName: 'text', dataTypeID: 3802 }), true)
  assert.equal(isJsonColumnType({ dataTypeName: 'text', dataTypeID: 0 }), false)
  assert.equal(isJsonColumnType(null), false)
})
