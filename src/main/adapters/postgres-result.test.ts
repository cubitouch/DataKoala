import assert from 'node:assert/strict'
import test from 'node:test'
import { resultCellValue, resultColumnKey } from '../../shared/query-result.ts'
import { normalizePostgresResult } from './postgres.ts'

const field = (name: string) => ({ name, dataTypeID: 25 })

test('PostgreSQL normalization preserves positional values for duplicate column names', () => {
  const result = normalizePostgresResult([field('id'), field('id')], [['A', 'B']])

  assert.deepEqual(result.columns.map((column) => column.name), ['id', 'id'])
  assert.equal(result.columns[0].key, undefined)
  assert.notEqual(resultColumnKey(result.columns[0]), resultColumnKey(result.columns[1]))
  assert.deepEqual(result.columns.map((column) => resultCellValue(result.rows[0], column)), ['A', 'B'])
})

test('PostgreSQL normalization retains the existing shape for unique columns', () => {
  const result = normalizePostgresResult([field('id'), field('name')], [[1, 'Koala']])

  assert.deepEqual(result.columns.map((column) => ({ name: column.name, key: column.key })), [
    { name: 'id', key: undefined },
    { name: 'name', key: undefined }
  ])
  assert.deepEqual(result.rows, [{ id: 1, name: 'Koala' }])
})

test('generated duplicate keys cannot collide with real returned column names', () => {
  const result = normalizePostgresResult(
    [field('id'), field('id'), field('__datakoala_column_1')],
    [['A', 'B', 'real']]
  )

  assert.equal(resultCellValue(result.rows[0], result.columns[1]), 'B')
  assert.equal(resultCellValue(result.rows[0], result.columns[2]), 'real')
  assert.equal(new Set(result.columns.map(resultColumnKey)).size, 3)
})
