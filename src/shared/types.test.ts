import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTimeType, isNumericType, pickDefaultChartFields } from './types.ts'
import type { ColumnMeta } from './types.ts'

const col = (name: string, dataTypeName: string): ColumnMeta => ({ name, dataTypeName, dataTypeID: 0 })

test('recognises Postgres time types', () => {
  for (const t of ['timestamptz', 'timestamp', 'date', 'time', 'timetz', 'TIMESTAMPTZ']) {
    assert.ok(isTimeType(t), `${t} should be a time type`)
  }
  for (const t of ['text', 'numeric', 'int4', 'jsonb']) {
    assert.ok(!isTimeType(t), `${t} should not be a time type`)
  }
})

test('recognises DuckDB timestamp variants', () => {
  for (const t of ['TIMESTAMP_S', 'TIMESTAMP_MS', 'TIMESTAMP_NS', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITHOUT TIME ZONE']) {
    assert.ok(isTimeType(t), `${t} should be a time type`)
  }
})

test('recognises numeric types under both short and long names', () => {
  // Short names come from db.ts's OID mapping; long names from information_schema.
  for (const t of ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'NUMERIC', 'integer', 'bigint', 'double precision']) {
    assert.ok(isNumericType(t), `${t} should be numeric`)
  }
})

test('recognises DuckDB numeric and parameterized decimal types', () => {
  for (const t of ['TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT', 'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT', 'UHUGEINT', 'FLOAT', 'DOUBLE', 'DECIMAL(18,2)', 'NUMERIC(9, 3)']) {
    assert.ok(isNumericType(t), `${t} should be numeric`)
  }
})

test('text, boolean, json and time types are not numeric', () => {
  // Regression: treating text as numeric put "region" on the Y axis and rendered
  // an empty chart because Number('eu-west') is NaN.
  for (const t of ['text', 'varchar', 'bpchar', 'bool', 'jsonb', 'json', 'uuid', 'timestamptz', 'date', 'interval', 'bytea']) {
    assert.ok(!isNumericType(t), `${t} must not be treated as numeric`)
  }
})

test('picks a time X and a numeric Y for a typical time series', () => {
  // The exact result set that exposed the bug.
  const cols = [col('created_at', 'timestamptz'), col('region', 'text'), col('amount', 'numeric')]
  assert.deepEqual(pickDefaultChartFields(cols), { xField: 'created_at', yField: 'amount' })
})

test('never puts a text column on the Y axis', () => {
  const cols = [col('created_at', 'timestamptz'), col('region', 'text'), col('status', 'text')]
  const { yField } = pickDefaultChartFields(cols)
  assert.equal(yField, '', 'with no numeric column, Y must be empty rather than text')
})

test('falls back to a category X when there is no time column', () => {
  const cols = [col('region', 'text'), col('total', 'int8')]
  assert.deepEqual(pickDefaultChartFields(cols), { xField: 'region', yField: 'total' })
})

test('does not use the same column for X and Y', () => {
  const cols = [col('n', 'int4')]
  const { xField, yField } = pickDefaultChartFields(cols)
  assert.notEqual(xField, yField)
})

test('picks the first numeric column when several are available', () => {
  const cols = [col('day', 'date'), col('orders', 'int8'), col('revenue', 'numeric')]
  assert.deepEqual(pickDefaultChartFields(cols), { xField: 'day', yField: 'orders' })
})

test('handles an all-numeric result by using one for X and another for Y', () => {
  const cols = [col('x', 'float8'), col('y', 'float8')]
  const picked = pickDefaultChartFields(cols)
  assert.equal(picked.xField, 'x')
  assert.equal(picked.yField, 'y')
})

test('handles an empty result set without throwing', () => {
  assert.deepEqual(pickDefaultChartFields([]), { xField: '', yField: '' })
})
