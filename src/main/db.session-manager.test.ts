import assert from 'node:assert/strict'
import test from 'node:test'
import type { BigQueryProfile } from '../shared/types.ts'
import type { DataSourceAdapter, DataSourceSession } from './data-source.ts'
import { AdapterRegistry } from './data-source.ts'
import { SessionManager } from './db.ts'

const profile = (id: string): BigQueryProfile => ({
  id, name: id, version: 1, kind: 'bigquery', billingProject: 'billing', maximumBytesBilled: '1073741824', readonly: true
})

function fakeSession(id: string, closed: string[]): DataSourceSession {
  return {
    info: { profileId: id, provider: 'bigquery' },
    capabilities: { builder: false, explain: false, analyze: false, queryCancellation: true,
      parameterizedQueries: true, costEstimate: true, serverReadOnly: true, schemaAutocomplete: true },
    async query() { return { columns: [], rows: [], rowCount: 0, durationMs: 0 } },
    async listNamespaces() { return [] },
    async listRelations() { return [] },
    async describeRelation() { return [] },
    async close() { closed.push(id) }
  }
}

test('switching providers closes the prior session through the generic contract', async () => {
  const closed: string[] = []
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) { return { result: { ok: true, generation: 1 }, session: fakeSession(value.id, closed) } }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  await manager.connect(profile('first'))
  await manager.connect(profile('second'))
  assert.deepEqual(closed, ['first'])
  await manager.disconnectAll()
  assert.deepEqual(closed, ['first', 'second'])
})

test('a superseded connection is closed instead of becoming an abandoned session', async () => {
  const closed: string[] = []
  const cancelled: string[] = []
  let releaseFirst!: () => void
  let markFirstStarted!: () => void
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve })
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      if (value.id === 'first') { markFirstStarted(); await firstGate }
      return { result: { ok: true, generation: value.id === 'first' ? 1 : 2 }, session: fakeSession(value.id, closed) }
    },
    async cancelConnect(id) { cancelled.push(id) }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  const first = manager.connect(profile('first'))
  await firstStarted
  const second = manager.connect(profile('second'))
  releaseFirst()
  assert.equal((await first).ok, false)
  assert.equal((await second).ok, true)
  assert.deepEqual(cancelled, ['first'])
  assert.deepEqual(closed, ['first'])
})

test('disconnectAll cancels every pending connection before adapter shutdown', async () => {
  const events: string[] = []
  let releaseFirst!: () => void
  let releaseSecond!: () => void
  let markFirstStarted!: () => void
  let markSecondStarted!: () => void
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve })
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve })
  const secondStarted = new Promise<void>((resolve) => { markSecondStarted = resolve })
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      if (value.id === 'first') markFirstStarted()
      else markSecondStarted()
      await (value.id === 'first' ? firstGate : secondGate)
      return { result: { ok: true, generation: 1 }, session: fakeSession(value.id, events) }
    },
    async cancelConnect(id) { events.push(`cancel:${id}`) },
    async shutdown() { events.push('shutdown') }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  const first = manager.connect(profile('first'))
  await firstStarted
  const second = manager.connect(profile('second'))
  await secondStarted

  await manager.disconnectAll()
  assert.deepEqual(events, ['cancel:first', 'cancel:second', 'shutdown'])

  releaseFirst()
  releaseSecond()
  assert.equal((await first).ok, false)
  assert.equal((await second).ok, false)
  assert.deepEqual(events, ['cancel:first', 'cancel:second', 'shutdown', 'first', 'second'])
})

test('disconnect cancels a pending profile and closes a session that resolves later', async () => {
  const closed: string[] = []
  const cancelled: string[] = []
  let releaseConnection!: () => void
  let markConnectionStarted!: () => void
  const connectionGate = new Promise<void>((resolve) => { releaseConnection = resolve })
  const connectionStarted = new Promise<void>((resolve) => { markConnectionStarted = resolve })
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      markConnectionStarted()
      await connectionGate
      return { result: { ok: true, generation: 1 }, session: fakeSession(value.id, closed) }
    },
    async cancelConnect(id) { cancelled.push(id) }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  const connecting = manager.connect(profile('pending'))
  await connectionStarted
  await manager.disconnect('pending')
  releaseConnection()

  assert.equal((await connecting).ok, false)
  assert.equal(manager.get('pending'), undefined)
  assert.deepEqual(cancelled, ['pending'])
  assert.deepEqual(closed, ['pending'])
})

test('a stale generation disconnect does not cancel a pending reconnect', async () => {
  const cancelled: string[] = []
  const closed: string[] = []
  let releaseReconnect!: () => void
  let markReconnectStarted!: () => void
  const reconnectGate = new Promise<void>((resolve) => { releaseReconnect = resolve })
  const reconnectStarted = new Promise<void>((resolve) => { markReconnectStarted = resolve })
  let generation = 0
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      generation++
      if (generation === 2) { markReconnectStarted(); await reconnectGate }
      return { result: { ok: true, generation }, session: fakeSession(value.id, closed) }
    },
    async cancelConnect(id) { cancelled.push(id) }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  assert.equal((await manager.connect(profile('same'))).ok, true)
  const reconnect = manager.connect(profile('same'))
  await reconnectStarted

  await manager.disconnect('same', 1)
  assert.deepEqual(cancelled, [])

  releaseReconnect()
  assert.equal((await reconnect).ok, true)
  assert.ok(manager.get('same'))
  await manager.disconnectAll()
})
