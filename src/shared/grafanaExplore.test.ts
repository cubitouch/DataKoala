import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGrafanaExploreUrl, grafanaRange, normalizeGrafanaBaseUrl } from './grafanaExplore.ts'

const cases = [
  ['prometheus', 'rate(http_requests_total{route=~"/api/.+",status!="200",city="Zürich"}[5m])', 'expr'],
  ['loki', '{service_name="checkout"} |= "failed | retry" | json', 'expr'],
  ['tempo', '{ resource.service.name = "checkout-api" && duration > 300ms }', 'query']
] as const
for (const [signal, query, queryKey] of cases) test(`builds a ${signal} Explore pane`, () => {
  const built = new URL(buildGrafanaExploreUrl({ baseUrl: 'https://example.com/grafana/', orgId: 7, datasourceUid: `${signal}-uid`, datasourceType: signal === 'prometheus' ? 'grafana-mimir-datasource' : signal, signal, query, range: { from: 'now-30m', to: 'now' } }))
  const panes = JSON.parse(built.searchParams.get('panes')!)
  const pane = panes.datakoala, model = pane.queries[0]
  assert.equal(built.pathname, '/grafana/explore'); assert.equal(built.searchParams.get('schemaVersion'), '1'); assert.equal(built.searchParams.get('orgId'), '7')
  assert.equal(pane.datasource, `${signal}-uid`); assert.deepEqual(pane.range, { from: 'now-30m', to: 'now' })
  assert.equal(model.refId, 'A'); assert.equal(model.datasource.uid, `${signal}-uid`); assert.equal(model[queryKey], query)
})
test('converts shared time ranges without changing DataKoala semantics', () => {
  assert.deepEqual(grafanaRange({ kind: 'rolling', amount: 30, unit: 'minute' }), { from: 'now-30m', to: 'now' })
  assert.deepEqual(grafanaRange({ kind: 'rolling', amount: 3, unit: 'month' }), { from: 'now-90d', to: 'now' })
  assert.deepEqual(grafanaRange({ kind: 'all' }), { from: '0', to: 'now' })
  assert.deepEqual(grafanaRange({ kind: 'custom', startDate: '2026-01-01', startTime: '00:00', endDate: '2026-01-02', endTime: '00:00' }), { from: '1767225600000', to: '1767312000000' })
})
test('rejects malformed, credentialed, and non-http URLs', () => { for (const value of ['not a URL', 'file:///tmp/x', 'https://user:secret@example.com']) assert.throws(() => normalizeGrafanaBaseUrl(value)); assert.equal(normalizeGrafanaBaseUrl('https://example.com/grafana///'), 'https://example.com/grafana') })
