import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromql, DEFAULT_PROMQL_BUILDER, escapePromqlString, type PromqlBuilderState } from './promqlBuilder.ts'

const build = (patch: Partial<PromqlBuilderState>) => buildPromql({ ...DEFAULT_PROMQL_BUILDER, metric: 'requests_total', ...patch })
test('escapes PromQL strings', () => assert.equal(escapePromqlString('a"b\\c\nd'), 'a\\"b\\\\c\\nd'))
test('builds raw selectors and every matcher', () => {
  assert.equal(build({}), 'requests_total')
  for (const [operator, expected] of [['=', '='], ['!=', '!='], ['=~', '=~'], ['!~', '!~']] as const) {
    assert.equal(build({ filters: [{ id: '1', label: 'status', operator, value: 'failure' }] }), `requests_total{status${expected}"failure"}`)
  }
})
test('builds range calculations', () => {
  assert.equal(build({ calculation: 'rate', window: '5m' }), 'rate(requests_total[5m])')
  assert.equal(build({ calculation: 'increase', window: '1h' }), 'increase(requests_total[1h])')
})
test('builds aggregations', () => {
  for (const calculation of ['sum', 'avg', 'min', 'max'] as const) assert.equal(build({ calculation }), `${calculation}(requests_total)`)
  assert.equal(build({ calculation: 'avg', groupBy: ['region'] }), 'avg by (region) (requests_total)')
  assert.equal(build({ calculation: 'sum', groupBy: ['status', 'region'] }), 'sum by (status, region) (requests_total)')
  assert.equal(build({ calculation: 'rate', groupBy: ['status'] }), 'sum by (status) (\n  rate(requests_total[5m])\n)')
})
test('keeps filters and grouping deterministic', () => assert.equal(build({ calculation: 'sum', filters: [
  { id: '1', label: 'status', operator: '=', value: 'failure' }, { id: '2', label: 'env', operator: '!=', value: 'dev' }
], groupBy: ['status', 'status', 'env'] }), 'sum by (status, env) (requests_total{status="failure",env!="dev"})'))
test('rejects incomplete state', () => {
  assert.equal(buildPromql(DEFAULT_PROMQL_BUILDER), '')
  assert.equal(build({ filters: [{ id: '1', label: 'status', operator: '=', value: '' }] }), '')
  assert.equal(build({ filters: [{ id: '1', label: '', operator: '=', value: 'failure' }] }), '')
})
