import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromql, DEFAULT_PROMQL_BUILDER, escapePromqlRegexLiteral, escapePromqlString, type PromqlBuilderState } from './promqlBuilder.ts'

const build = (patch: Partial<PromqlBuilderState>) => buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'requests_total', ...patch })
const selected = (label: string, values: string[]) => ({ filterBy: [label], labelValues: { [label]: values } })
test('escapes strings and regex literals', () => {
  assert.equal(escapePromqlString('a"b\\c\nd'), 'a\\"b\\\\c\\nd')
  assert.equal(escapePromqlRegexLiteral('foo.bar+([x])\\'), 'foo\\.bar\\+\\(\\[x\\]\\)\\\\')
})
test('builds selectors with literal single values and escaped multi-value regexes', () => {
  assert.equal(build({}), 'requests_total')
  assert.equal(build(selected('status', [])), 'requests_total')
  assert.equal(build(selected('status', ['500'])), 'requests_total{status="500"}')
  assert.equal(build(selected('status', ['500', '502'])), 'requests_total{status=~"500|502"}')
  assert.equal(build({ filterBy: ['environment', 'status'], labelValues: { environment: ['production', 'staging'], status: ['foo.bar', 'foo+bar'] } }), 'requests_total{environment=~"production|staging",status=~"foo\\\\.bar|foo\\\\+bar"}')
})
test('builds range calculations and grouping', () => {
  assert.equal(build({ calculation: 'rate', window: '10m' }), 'rate(requests_total[10m])')
  assert.equal(build({ calculation: 'increase', window: '1h' }), 'increase(requests_total[1h])')
  assert.equal(build({ calculation: 'rate', aggregation: 'sum' }), 'sum(rate(requests_total[5m]))')
  assert.equal(build({ calculation: 'rate', aggregation: 'sum', groupBy: ['status'] }), 'sum by (status) (\n  rate(requests_total[5m])\n)')
})
test('builds aggregations deterministically', () => {
  for (const aggregation of ['sum', 'avg', 'min', 'max'] as const) assert.equal(build({ aggregation }), `${aggregation}(requests_total)`)
  assert.equal(build({ aggregation: 'sum', groupBy: ['status', 'status', 'env'] }), 'sum by (status, env) (\n  requests_total\n)')
})
test('uses one matcher value state across Group by and Filter by dimensions', () => {
  assert.equal(build({ calculation: 'rate', aggregation: 'sum', groupBy: ['continent'], filterBy: ['environment'], labelValues: { continent: ['Europe', 'Asia'], environment: ['production'] } }),
    'sum by (continent) (\n  rate(requests_total{continent=~"Europe|Asia",environment="production"}[5m])\n)')
  assert.equal(build({ aggregation: 'sum', groupBy: ['status'], filterBy: ['status'], labelValues: { status: ['500'] } }), 'sum by (status) (\n  requests_total{status="500"}\n)')
})
test('builds classic histogram percentiles with automatic, deduplicated le', () => {
  const metric = 'request_duration_seconds_bucket'
  for (const percentile of [0.5, 0.95, 0.99] as const) assert.match(build({ metric, calculation: 'percentile', percentile }), new RegExp(`histogram_quantile\\(\\n  ${percentile}`))
  assert.equal(build({ metric, calculation: 'percentile', percentile: 0.95, groupBy: ['service', 'region', 'le'], filterBy: ['environment'], labelValues: { environment: ['production'] }, window: '10m' }),
    'histogram_quantile(\n  0.95,\n  sum by (service, region, le) (\n    rate(request_duration_seconds_bucket{environment="production"}[10m])\n  )\n)')
})
test('rejects incomplete and semantically invalid state', () => {
  assert.equal(buildPromql(DEFAULT_PROMQL_BUILDER), '')
  assert.equal(build({ calculation: 'percentile' }), '')
  assert.equal(build({ calculation: 'rate', aggregation: 'none', groupBy: ['status'] }), '')
})
