import assert from 'node:assert/strict'
import test from 'node:test'
import { PrometheusAdapter } from './prometheus-adapter.ts'
import type { PrometheusProfile } from '../../shared/types.ts'
import type { PrometheusDiscoveryResult } from '../../shared/prometheus.ts'
import type { QueryResult } from '../../shared/types.ts'

const profile: PrometheusProfile = {
  id: 'prom-1', name: 'Cloud metrics', version: 1, kind: 'prometheus', readonly: true,
  transport: { kind: 'gcx' }
}
const discovery: PrometheusDiscoveryResult = {
  metricNames: ['http_requests_total', 'process_cpu_seconds_total'],
  metadata: [
    { name: 'http_requests_total', type: 'counter', help: 'Total requests', unit: 'requests' },
    { name: 'process_cpu_seconds_total', type: 'counter', help: 'CPU time', unit: 'seconds' }
  ],
  metadataAvailable: true,
  gcx: { installed: true, version: '1.2.3' }
}

test('connected Prometheus session exposes cached metrics through datasource-neutral objects', async () => {
  let discoveryCalls = 0
  const adapter = new PrometheusAdapter(async () => { discoveryCalls += 1; return discovery })
  const connected = await adapter.connect(profile)
  assert.equal(connected.result.ok, true)
  assert.ok(connected.session)

  assert.deepEqual(await connected.session.listNamespaces(), [{ name: 'Metrics' }])
  const first = await connected.session.listRelations({ name: 'Metrics' })
  const second = await connected.session.listRelations({ name: 'Metrics' })
  assert.equal(discoveryCalls, 1, 'tree expansion must reuse connection discovery')
  assert.deepEqual(first, second)
  assert.deepEqual(first, [
    { namespace: 'Metrics', name: 'http_requests_total', kind: 'metric', details: { kind: 'metric', type: 'counter', help: 'Total requests', unit: 'requests' } },
    { namespace: 'Metrics', name: 'process_cpu_seconds_total', kind: 'metric', details: { kind: 'metric', type: 'counter', help: 'CPU time', unit: 'seconds' } }
  ])
  assert.deepEqual(await connected.session.describeRelation({ namespace: 'Metrics', name: 'http_requests_total' }), [], 'metrics must not be represented as fake SQL columns')
})

test('Prometheus relation discovery is deterministic and rejects unrelated namespaces', async () => {
  const unsorted = { ...discovery, metadata: [...discovery.metadata].reverse() }
  const adapter = new PrometheusAdapter(async () => unsorted)
  const connected = await adapter.connect(profile)
  assert.ok(connected.session)
  assert.deepEqual(await connected.session.listRelations({ name: 'Other' }), [])
  assert.deepEqual((await connected.session.listRelations({ name: 'Metrics' })).map((item) => item.name), ['http_requests_total', 'process_cpu_seconds_total'])
})

test('Prometheus sessions always execute PromQL through the metrics transport', async () => {
  const requests: unknown[] = []
  const normalized: QueryResult = { columns: [], rows: [], rowCount: 0, durationMs: 2 }
  const adapter = new PrometheusAdapter(
    async () => discovery,
    () => ({
      metadata: async () => [],
      labelsForMetric: async () => [],
      labelValues: async () => [],
      query: async (value) => { requests.push(value); return normalized }
    })
  )
  const connected = await adapter.connect(profile)
  assert.ok(connected.session)
  for (const step of ['30s', '1m', '5m'] as const) {
    const result = await connected.session.query({ sql: 'rate(http_requests_total[5m])', prometheus: { start: '2026-08-14T10:00:00Z', end: '2026-08-14T10:15:00Z', step } })
    assert.equal(result, normalized)
  }
  assert.equal(await connected.session.query({ sql: 'up' }), normalized)
  assert.deepEqual(requests, [
    ...(['30s', '1m', '5m'] as const).map((step) => ({ expression: 'rate(http_requests_total[5m])', start: '2026-08-14T10:00:00Z', end: '2026-08-14T10:15:00Z', step })),
    { expression: 'up' }
  ])
})
