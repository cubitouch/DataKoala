import test from 'node:test'
import assert from 'node:assert/strict'
import { generateBuilderQuery } from './builderSql.ts'

test('Builder selects, groups, and orders multiple Series columns independently', () => {
  const query = generateBuilderQuery({
    table: { schema: 'demo_shop', name: 'events' },
    timeColumn: 'created_at',
    timeColumnDataType: 'timestamptz',
    timeBucket: 'minute',
    timeRange: { kind: 'rolling', amount: 1, unit: 'hour' },
    seriesColumns: ['origin', 'type']
  })
  assert.match(query.sql, /"origin",\n  "type",\n  COUNT\(\*\) AS "count"/)
  assert.doesNotMatch(query.sql, /concat_ws|::text|AS "series"/)
  assert.match(query.sql, /GROUP BY 1, 2, 3/)
  assert.match(query.sql, /ORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST, 3 ASC NULLS LAST/)
})

test('Builder preserves a single Series source column without aliasing it to synthetic series', () => {
  const query = generateBuilderQuery({
    table: { schema: 'public', name: 'events' },
    timeColumn: 'created_at',
    timeBucket: 'day',
    seriesColumns: ['country']
  })
  assert.match(query.sql, /"country",\n  COUNT\(\*\) AS "count"/)
  assert.doesNotMatch(query.sql, /AS "series"/)
  assert.match(query.sql, /GROUP BY 1, 2/)
  assert.match(query.sql, /ORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST/)
})

test('Builder quotes every Series identifier independently', () => {
  const query = generateBuilderQuery({
    table: { schema: 'public', name: 'events' },
    timeColumn: 'created at',
    timeBucket: 'hour',
    seriesColumns: ['order', 'device type']
  })
  assert.match(query.sql, /"order",\n  "device type",/)
  assert.doesNotMatch(query.sql, /concat_ws|AS "series"/)
})
