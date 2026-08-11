import assert from 'node:assert/strict'
import test from 'node:test'
import { AdapterRegistry } from './data-source.ts'
import type { DataSourceAdapter } from './data-source.ts'

const adapter = (kind: DataSourceAdapter['kind']): DataSourceAdapter => ({
  kind,
  async test() { return { ok: false, error: 'not implemented' } },
  async connect() { return { result: { ok: false, error: 'not implemented' } } }
})

test('adapter registry resolves providers by user-facing source kind', () => {
  const postgres = adapter('postgres')
  const registry = new AdapterRegistry().register(postgres)
  assert.equal(registry.get('postgres'), postgres)
  assert.throws(() => registry.get('bigquery'), /No data source adapter is registered for bigquery/)
})

test('adapter registry rejects duplicate provider registrations', () => {
  const registry = new AdapterRegistry().register(adapter('postgres'))
  assert.throws(() => registry.register(adapter('postgres')), /already registered/)
})
