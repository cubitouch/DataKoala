import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHierarchy, hierarchyCardinalities, suggestHierarchyDimensions } from './chartHierarchy.ts'

const rows = [
  { country: 'FR', category: 'Tech', product: 'Phone', revenue: 50 },
  { country: 'FR', category: 'Tech', product: 'Laptop', revenue: 25 },
  { country: 'DE', category: 'Home', product: 'Chair', revenue: 40 },
  { country: 'FR', category: 'Home', product: 'Chair', revenue: 5 }
]

test('buildHierarchy aggregates every level and produces deterministic value order', () => {
  assert.deepEqual(buildHierarchy({ rows, dimensions: ['country', 'category', 'product'], valueColumn: 'revenue', aggregation: 'sum' }), [
    { name: 'FR', value: 80, children: [
      { name: 'Tech', value: 75, children: [{ name: 'Phone', value: 50 }, { name: 'Laptop', value: 25 }] },
      { name: 'Home', value: 5, children: [{ name: 'Chair', value: 5 }] }
    ] },
    { name: 'DE', value: 40, children: [{ name: 'Home', value: 40, children: [{ name: 'Chair', value: 40 }] }] }
  ])
})

test('hierarchy recommendation uses result-row cardinality and preserves ties', () => {
  assert.deepEqual(hierarchyCardinalities(rows, ['product', 'country', 'category']), [
    { column: 'product', distinctCount: 3 }, { column: 'country', distinctCount: 2 }, { column: 'category', distinctCount: 2 }
  ])
  assert.deepEqual(suggestHierarchyDimensions(rows, ['product', 'country', 'category']), ['country', 'category', 'product'])
})

test('count aggregation sizes hierarchy from rows without a value column', () => {
  assert.deepEqual(buildHierarchy({ rows, dimensions: ['country'], valueColumn: null, aggregation: 'count' }), [
    { name: 'FR', value: 3 }, { name: 'DE', value: 1 }
  ])
})
