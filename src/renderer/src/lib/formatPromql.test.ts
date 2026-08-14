import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPromql } from './formatPromql.ts'

test('formatPromql canonically renders a parsed expression', () => {
  assert.deepEqual(formatPromql('sum by(status)(rate(http_requests_total{service="api"}[5m]))'), {
    ok: true,
    query: 'sum by (status) (rate(http_requests_total{service="api"}[5m]))'
  })
})

test('formatPromql returns an error without replacement text for invalid PromQL', () => {
  const result = formatPromql('sum(')
  assert.equal(result.ok, false)
  assert.ok(!('query' in result))
})
