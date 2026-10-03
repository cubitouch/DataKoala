import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLokiTrendExpressions, lokiTrendStep } from './loki-trend.ts'

test('does not synthesize a trend for metric LogQL', () => {
  assert.equal(buildLokiTrendExpressions('rate({app="x"}[5m])', '30s', [], 'metrics'), null)
})
test('builds bounded trend and cardinality expressions for log breakdowns', () => {
  assert.deepEqual(buildLokiTrendExpressions('{app="x"}', '30s', ['service', 'level'], 'logs'), {
    trend: 'sum by (service, level) (count_over_time(({app="x"})[30s]))',
    cardinalityProbe: 'count(sum by (service, level) (count_over_time(({app="x"})[30s])))'
  })
})
test('builds an ungrouped trend', () => {
  assert.equal(buildLokiTrendExpressions('{app="x"}', '30s', [], 'logs')?.trend, 'sum (count_over_time(({app="x"})[30s]))')
})


test('bounds Loki trend points to a chart-sized resolution', () => {
  assert.equal(lokiTrendStep('2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'), '5s')
  assert.equal(lokiTrendStep('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'), '120s')
  assert.equal(lokiTrendStep('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z'), '600s')
})

test('keeps short Loki trend ranges responsive', () => {
  assert.equal(lokiTrendStep('2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z'), '1s')
})
