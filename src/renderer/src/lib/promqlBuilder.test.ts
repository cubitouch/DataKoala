import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromql, calculationsForPromqlHistogramKind, DEFAULT_PROMQL_BUILDER, detectPromqlHistogramKind, escapePromqlRegexLiteral, escapePromqlString, reconcilePromqlBuilderForMetric, resolvePromqlHistogramKind, validatePromqlBuilder, type PromqlBuilderState, type PromqlHistogramKind } from './promqlBuilder.ts'

const build = (patch: Partial<PromqlBuilderState>, kind: PromqlHistogramKind = 'unknown') => buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'requests_total', ...patch }, kind)
const percentile = (metric: string, kind: PromqlHistogramKind, patch: Partial<PromqlBuilderState> = {}) => buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric, calculation: 'percentile', aggregation: 'sum', ...patch }, kind)
const selected = (label: string, values: string[]) => ({ filterBy: [label], labelValues: { [label]: values } })
test('escapes strings and regex literals', () => {
  assert.equal(escapePromqlString('a"b\\c\nd'), 'a\\"b\\\\c\\nd')
  assert.equal(escapePromqlRegexLiteral('foo.bar+([x])\\'), 'foo\\.bar\\+\\(\\[x\\]\\)\\\\')
})
test('builds selectors with literal single values and escaped multi-value regexes', () => {
  assert.equal(build({}, 'not-histogram'), 'requests_total')
  assert.equal(build(selected('status', []), 'not-histogram'), 'requests_total')
  assert.equal(build(selected('status', ['500']), 'not-histogram'), 'requests_total{status="500"}')
  assert.equal(build(selected('status', ['500', '502']), 'not-histogram'), 'requests_total{status=~"500|502"}')
  assert.equal(build({ filterBy: ['environment', 'status'], labelValues: { environment: ['production', 'staging'], status: ['foo.bar', 'foo+bar'] } }, 'not-histogram'), 'requests_total{environment=~"production|staging",status=~"foo\\\\.bar|foo\\\\+bar"}')
})
test('builds range calculations and grouping', () => {
  assert.equal(build({ calculation: 'rate', window: '10m' }, 'not-histogram'), 'rate(requests_total[10m])')
  assert.equal(build({ calculation: 'increase', window: '1h' }, 'not-histogram'), 'increase(requests_total[1h])')
  assert.equal(build({ calculation: 'rate', aggregation: 'sum' }, 'not-histogram'), 'sum(rate(requests_total[5m]))')
  assert.equal(build({ calculation: 'rate', aggregation: 'sum', groupBy: ['status'] }, 'not-histogram'), 'sum by (status) (\n  rate(requests_total[5m])\n)')
})
test('builds aggregations deterministically', () => {
  for (const aggregation of ['sum', 'avg', 'min', 'max'] as const) assert.equal(build({ aggregation }, 'not-histogram'), `${aggregation}(requests_total)`)
  assert.equal(build({ aggregation: 'sum', groupBy: ['status', 'status', 'env'] }, 'not-histogram'), 'sum by (status, env) (\n  requests_total\n)')
})
test('uses one matcher value state across Group by and Filter by dimensions', () => {
  assert.equal(build({ calculation: 'rate', aggregation: 'sum', groupBy: ['continent'], filterBy: ['environment'], labelValues: { continent: ['Europe', 'Asia'], environment: ['production'] } }, 'not-histogram'),
    'sum by (continent) (\n  rate(requests_total{continent=~"Europe|Asia",environment="production"}[5m])\n)')
  assert.equal(build({ aggregation: 'sum', groupBy: ['status'], filterBy: ['status'], labelValues: { status: ['500'] } }, 'not-histogram'), 'sum by (status) (\n  requests_total{status="500"}\n)')
})
test('builds classic histogram percentiles with automatic, deduplicated le', () => {
  for (const quantile of [0.5, 0.95, 0.99] as const) assert.match(percentile('foo_bucket', 'classic', { percentile: quantile }), new RegExp(`histogram_quantile\\(\\n  ${quantile}`))
  assert.equal(percentile('foo_bucket', 'classic', { percentile: 0.95, groupBy: ['service', 'region', 'le'], filterBy: ['environment'], labelValues: { environment: ['production'] }, window: '10m' }),
    'histogram_quantile(\n  0.95,\n  sum by (service, region, le) (\n    rate(foo_bucket{environment="production"}[10m])\n  )\n)')
})
test('builds native histogram percentiles without inventing bucket labels', () => {
  assert.equal(percentile('request_latency', 'native'), 'histogram_quantile(\n  0.95,\n  sum(\n    rate(request_latency[5m])\n  )\n)')
  assert.equal(percentile('request_latency', 'native', { groupBy: ['service'], filterBy: ['environment'], labelValues: { environment: ['production'] }, window: '15m' }),
    'histogram_quantile(\n  0.95,\n  sum by (service) (\n    rate(request_latency{environment="production"}[15m])\n  )\n)')
})
test('builds native histogram observation rates and sums with implicit grouped aggregation', () => {
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'my_metric', calculation: 'observation-rate', window: '5m' }, 'native'),
    'histogram_count(\n  rate(my_metric[5m])\n)')
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'my_metric', calculation: 'observation-rate', aggregation: 'sum', groupBy: ['path', 'method'] }, 'native'),
    'sum by (path, method) (\n  histogram_count(\n    rate(my_metric[5m])\n  )\n)')
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'my_metric', calculation: 'histogram-sum' }, 'native'),
    'histogram_sum(\n  rate(my_metric[5m])\n)')
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'my_metric', calculation: 'histogram-sum', aggregation: 'sum', groupBy: ['path'] }, 'native'),
    'sum by (path) (\n  histogram_sum(\n    rate(my_metric[5m])\n  )\n)')
})
test('builds native histogram averages with observation-weighted grouped semantics', () => {
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'my_metric', calculation: 'histogram-average' }, 'native'),
    'histogram_avg(\n  rate(my_metric[5m])\n)')
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'my_metric', calculation: 'histogram-average', aggregation: 'sum', groupBy: ['service'] }, 'native'),
    'sum by (service) (\n  histogram_sum(\n    rate(my_metric[5m])\n  )\n)\n/\nsum by (service) (\n  histogram_count(\n    rate(my_metric[5m])\n  )\n)')
})
test('fails closed for unresolved and known non-histogram metrics', () => {
  for (const calculation of ['observation-rate', 'histogram-average', 'histogram-sum', 'percentile'] as const) {
    const state = { ...DEFAULT_PROMQL_BUILDER, metric: 'custom_metric', calculation }
    assert.equal(buildPromql(state, 'unknown'), '')
    assert.equal(buildPromql(state, 'not-histogram'), '')
  }
  assert.equal(validatePromqlBuilder({ ...DEFAULT_PROMQL_BUILDER, metric: 'custom_metric', calculation: 'percentile' }, 'unknown'), 'Choose Classic histogram or Native histogram to generate this histogram calculation.')
})
test('detects classic, native, known non-histogram, and genuinely unknown metrics', () => {
  assert.equal(detectPromqlHistogramKind({ metric: 'custom', labels: ['job', 'le'], metadataType: 'counter' }), 'classic')
  assert.equal(detectPromqlHistogramKind({ metric: 'foo_bucket', labels: [], metadataType: 'histogram' }), 'classic')
  assert.equal(detectPromqlHistogramKind({ metric: 'request_latency', labels: [], metadataType: 'histogram' }), 'native')
  for (const metadataType of ['gauge', 'counter', 'summary', 'info', 'stateset', 'gaugehistogram']) {
    assert.equal(detectPromqlHistogramKind({ metric: 'request_latency', labels: [], metadataType }), 'not-histogram')
  }
  assert.equal(detectPromqlHistogramKind({ metric: 'recording_rule', labels: [] }), 'unknown')
  assert.equal(detectPromqlHistogramKind({ metric: 'future_metric', labels: [], metadataType: 'future-kind' }), 'unknown')
})
test('only applies a histogram override when auto detection is genuinely unknown', () => {
  assert.equal(resolvePromqlHistogramKind('unknown', 'auto'), 'unknown')
  assert.equal(resolvePromqlHistogramKind('unknown', 'classic'), 'classic')
  assert.equal(resolvePromqlHistogramKind('unknown', 'native'), 'native')
  assert.equal(resolvePromqlHistogramKind('classic', 'native'), 'classic')
  assert.equal(resolvePromqlHistogramKind('native', 'classic'), 'native')
  assert.equal(resolvePromqlHistogramKind('not-histogram', 'native'), 'not-histogram')
})
test('exposes calculations compatible with each histogram kind', () => {
  assert.deepEqual(calculationsForPromqlHistogramKind('not-histogram'), ['raw', 'rate', 'increase'])
  assert.deepEqual(calculationsForPromqlHistogramKind('classic'), ['raw', 'percentile'])
  assert.deepEqual(calculationsForPromqlHistogramKind('native'), ['raw', 'observation-rate', 'histogram-average', 'histogram-sum', 'percentile'])
})
test('reconciles ordinary, classic, and native metric selections', () => {
  const ordinary = reconcilePromqlBuilderForMetric({ ...DEFAULT_PROMQL_BUILDER, calculation: 'rate', aggregation: 'avg' }, 'requests_total', 'counter')
  assert.equal(ordinary.histogramKind, 'not-histogram')
  assert.equal(ordinary.builder.calculation, 'rate')
  assert.equal(ordinary.builder.aggregation, 'avg')

  const classic = reconcilePromqlBuilderForMetric({ ...DEFAULT_PROMQL_BUILDER, calculation: 'percentile', aggregation: 'none' }, 'request_duration_bucket', 'histogram')
  assert.equal(classic.histogramKind, 'classic')
  assert.equal(classic.builder.calculation, 'percentile')
  assert.equal(classic.builder.aggregation, 'sum')

  const native = reconcilePromqlBuilderForMetric({ ...DEFAULT_PROMQL_BUILDER, calculation: 'histogram-average', aggregation: 'max' }, 'request_duration', 'histogram')
  assert.equal(native.histogramKind, 'native')
  assert.equal(native.builder.calculation, 'histogram-average')
  assert.equal(native.builder.aggregation, 'sum')
})
test('metric reconciliation defaults incompatible calculations and clears metric-specific state', () => {
  const current: PromqlBuilderState = {
    ...DEFAULT_PROMQL_BUILDER,
    metric: 'request_duration',
    calculation: 'percentile',
    aggregation: 'sum',
    histogramKindOverride: 'native',
    filterBy: ['status'],
    groupBy: ['service'],
    labelValues: { status: ['500'], service: ['api'] }
  }
  const { builder, histogramKind } = reconcilePromqlBuilderForMetric(current, 'requests_total', 'counter')
  assert.equal(histogramKind, 'not-histogram')
  assert.deepEqual(builder, { ...current, metric: 'requests_total', calculation: 'raw', aggregation: 'none', histogramKindOverride: 'auto', filterBy: [], groupBy: [], labelValues: {} })
})
test('rejects incomplete and semantically invalid state', () => {
  assert.equal(buildPromql(DEFAULT_PROMQL_BUILDER), '')
  assert.match(build({ calculation: 'percentile' }, 'native'), /histogram_quantile/)
  assert.equal(build({ calculation: 'rate', aggregation: 'none', groupBy: ['status'] }, 'not-histogram'), '')
  assert.equal(buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'classic_bucket', calculation: 'observation-rate' }, 'classic'), '')
})
