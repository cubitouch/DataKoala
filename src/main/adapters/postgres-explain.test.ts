import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePostgresExplain } from './postgres.ts'

const fixture = [
  {
    Plan: {
      'Node Type': 'Hash Join',
      'Join Type': 'Inner',
      'Startup Cost': 10,
      'Total Cost': 42,
      'Plan Rows': 120,
      'Plan Width': 24,
      'Actual Startup Time': 1.2,
      'Actual Total Time': 12.4,
      'Actual Rows': 84000,
      'Actual Loops': 1,
      'Hash Cond': '(orders.customer_id = customers.id)',
      'Shared Hit Blocks': 18,
      Plans: [
        {
          'Node Type': 'Seq Scan',
          'Relation Name': 'orders',
          Schema: 'public',
          Alias: 'orders',
          'Startup Cost': 0,
          'Total Cost': 20,
          'Plan Rows': 100000,
          'Actual Total Time': 8.1,
          'Actual Rows': 84000,
          'Actual Loops': 1,
          Filter: '(created_at > now() - \'30 days\'::interval)',
          'Rows Removed by Filter': 16000,
          'Shared Read Blocks': 9,
        },
        {
          'Node Type': 'Index Scan',
          'Relation Name': 'customers',
          Schema: 'public',
          'Index Name': 'customers_pkey',
          'Plan Rows': 1000,
          'Index Cond': '(id IS NOT NULL)',
        },
      ],
    },
    'Planning Time': 0.8,
    'Execution Time': 13.1,
  },
]

test('normalizes PostgreSQL JSON plans into a deterministic tree', () => {
  const result = normalizePostgresExplain(fixture, true)
  assert.equal(result.analyze, true)
  assert.equal(result.planningTimeMs, 0.8)
  assert.equal(result.executionTimeMs, 13.1)
  assert.equal(result.tree?.id, '0')
  assert.equal(result.tree?.nodeType, 'Hash Join')
  assert.equal(result.tree?.actualRows, 84000)
  assert.equal(result.tree?.children?.[0].id, '0.0')
  assert.equal(result.tree?.children?.[0].relation, 'orders')
  assert.equal(result.tree?.children?.[1].index, 'customers_pkey')
  assert.match(result.text, /Hash Join/)
  assert.match(result.text, /Seq Scan/)
})

test('accepts JSON text and keeps plain EXPLAIN estimate-only', () => {
  const estimate = [
    {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'events',
        Schema: 'public',
        'Plan Rows': 250,
        'Total Cost': 17.5,
      },
    },
  ]
  const result = normalizePostgresExplain(JSON.stringify(estimate), false)
  assert.equal(result.analyze, false)
  assert.equal(result.tree?.planRows, 250)
  assert.equal(result.tree?.actualRows, undefined)
})

test('rejects malformed PostgreSQL plan payloads', () => {
  assert.throws(() => normalizePostgresExplain({}, false))
  assert.throws(() => normalizePostgresExplain('not json', false))
})
