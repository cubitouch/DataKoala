import assert from 'node:assert/strict'
import test from 'node:test'
import { TempoAdapter } from './tempo-adapter.ts'
import type { TempoProfile } from '../../shared/types.ts'
import type { QueryResult } from '../../shared/types.ts'
import type { TempoQueryRequest } from '../../shared/tempo.ts'
import type { TempoTransport } from '../gcx-tempo-transport.ts'

const profile: TempoProfile = {
  id: 'tempo-1', name: 'Production traces', version: 1, kind: 'tempo', readonly: true,
  transport: { kind: 'gcx', context: 'production' }
}

const result: QueryResult = {
  columns: [], rows: [], rowCount: 0, durationMs: 4,
  execution: { provider: 'tempo', durationMs: 4, rowCount: 0 }
}

function transport(overrides: Partial<TempoTransport> = {}): TempoTransport {
  return {
    probe: async () => {},
    services: async () => [
      { namespace: 'fulfilment', name: 'warehouse-service' },
      { namespace: 'commerce', name: 'payment-service' },
      { name: 'legacy-worker' },
      { namespace: 'commerce', name: 'checkout-api' }
    ],
    query: async () => result,
    search: async () => result,
    get: async () => result,
    attributeValues: async () => [],
    ...overrides
  }
}

test('Tempo exposes service namespaces and services through datasource-neutral objects', async () => {
  let probes = 0
  const adapter = new TempoAdapter(() => transport({ probe: async () => { probes += 1 } }))
  const connected = await adapter.connect(profile)
  assert.equal(connected.result.ok, true)
  assert.ok(connected.session)
  assert.equal(probes, 1)
  assert.deepEqual(await connected.session.listNamespaces(), [
    { name: 'Services' }, { name: 'commerce' }, { name: 'fulfilment' }
  ])
  assert.deepEqual(await connected.session.listRelations({ name: 'commerce' }), [
    { namespace: 'commerce', name: 'payment-service', kind: 'service', details: { kind: 'service', serviceNamespace: 'commerce' } },
    { namespace: 'commerce', name: 'checkout-api', kind: 'service', details: { kind: 'service', serviceNamespace: 'commerce' } }
  ])
  assert.deepEqual(await connected.session.listRelations({ name: 'Services' }), [
    { namespace: 'Services', name: 'legacy-worker', kind: 'service', details: { kind: 'service' } }
  ])
})

test('Tempo sessions delegate TraceQL, ranges and trace-id requests without involving Prometheus', async () => {
  const requests: Array<{ value: string; range?: TempoQueryRequest }> = []
  const adapter = new TempoAdapter(() => transport({ query: async (value, range) => { requests.push({ value, range }); return result } }))
  const connected = await adapter.connect(profile)
  assert.ok(connected.session)
  const range: TempoQueryRequest = { start: '2026-08-18T00:00:00.000Z', end: '2026-08-19T00:00:00.000Z', includeStatus: true }
  assert.equal(await connected.session.query({ sql: '{ resource.service.name = "checkout-api" }', tempo: range }), result)
  assert.equal(await connected.session.query({ sql: '0123456789abcdef0123456789abcdef' }), result)
  assert.deepEqual(requests, [
    { value: '{ resource.service.name = "checkout-api" }', range },
    { value: '0123456789abcdef0123456789abcdef', range: undefined }
  ])
})

test('Tempo sessions preserve optional TraceQL scopes for generic attribute discovery', async () => {
  const requests: Array<{ attribute: string; query?: string }> = []
  const adapter = new TempoAdapter(() => transport({
    attributeValues: async (attribute, query) => { requests.push({ attribute, query }); return ['kafka'] }
  }))
  const connected = await adapter.connect(profile)
  assert.ok(connected.session?.attributeValues)
  assert.deepEqual(await connected.session.attributeValues('span.messaging.system', '{ resource.service.name = "worker" }'), ['kafka'])
  assert.deepEqual(requests, [{ attribute: 'span.messaging.system', query: '{ resource.service.name = "worker" }' }])
})

test('Tempo connection test probes trace access without requiring service discovery', async () => {
  let serviceCalls = 0
  const adapter = new TempoAdapter(() => transport({ services: async () => { serviceCalls += 1; return [] } }))
  const tested = await adapter.test(profile)
  assert.equal(tested.ok, true)
  assert.equal(serviceCalls, 0)
})
