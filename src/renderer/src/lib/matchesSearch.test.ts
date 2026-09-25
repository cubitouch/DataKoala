import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch, normalizeSearchText } from './matchesSearch.ts'

const candidate = 'payment-service-worker'

for (const [query, expected] of [
  ['payment-serv', true],
  ['pay worker', true],
  ['worker pay', true],
  ['PAY WORKER', true],
  ['  pay   worker  ', true],
  ['pay missing', false],
  ['', true]
] as const) {
  test(`matches ${JSON.stringify(query)} as ${expected}`, () => {
    assert.equal(matchesSearch(candidate, query), expected)
  })
}

test('matches tokens across normalized searchable text', () => {
  assert.equal(matchesSearch('orders table · demo_shop sales_fact', 'ord demo fact'), true)
})

test('normalizes surrounding, repeated, and mixed whitespace', () => {
  assert.equal(normalizeSearchText('  Payment\t Service\nWorker '), 'payment service worker')
})
