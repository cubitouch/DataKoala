import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLokiTrendExpressions } from './loki-trend.ts'

test('does not synthesize a trend for metric LogQL', () => {
  assert.equal(buildLokiTrendExpressions('rate({app="x"}[5m])', '30s', null, 'metrics'), null)
})
test('builds bounded trend and cardinality expressions for log breakdowns', () => {
  assert.deepEqual(buildLokiTrendExpressions('{app="x"}', '30s', 'service', 'logs'), {
    trend: 'sum by (service) (count_over_time(({app="x"})[30s]))',
    cardinalityProbe: 'count(sum by (service) (count_over_time(({app="x"})[30s])))'
  })
})
