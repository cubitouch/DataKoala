import assert from 'node:assert/strict'
import test from 'node:test'
import { LokiAdapter } from './loki-adapter.ts'
import type { LokiTransport } from '../gcx-loki-transport.ts'

test('connection does not depend on metadata probe availability', async () => {
  const transport: LokiTransport = {
    probe: async () => { throw new Error('metadata unavailable') }, datasources: async () => [],
    labels: async () => { throw new Error('metadata unavailable') }, labelValues: async () => [], formatQuery: async (query) => query,
    query: async () => ({ resultKind: 'logs', logRows: [], columns: [], rows: [], rowCount: 0, durationMs: 0 })
  }
  const adapter = new LokiAdapter(() => transport)
  const connected = await adapter.connect({ id: 'loki', name: 'Loki', version: 1, kind: 'loki', readonly: true, transport: { kind: 'gcx', datasourceUid: 'manual' } })
  assert.equal(connected.result.ok, true)
  assert.ok(connected.session)
})
