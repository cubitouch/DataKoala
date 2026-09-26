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

test('connections for different profiles coexist through the generic contract', async () => {
  const closed: string[] = []
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) { return { result: { ok: true, generation: 1 }, session: fakeSession(value.id, closed) } }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  await manager.connect(profile('first'))
  await manager.connect(profile('second'))
  assert.deepEqual(closed, [])
  await manager.disconnectAll()
  assert.deepEqual(closed.sort(), ['first', 'second'])
})

test('connections for different profiles do not supersede one another', async () => {
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
  assert.equal((await first).ok, true)
  assert.equal((await second).ok, true)
  assert.deepEqual(cancelled, [])
  assert.deepEqual(closed, [])
  await manager.disconnectAll()
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

test('an already-live profile is reused without another adapter connection', async () => {
  const closed: string[] = []
  let generation = 0
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      generation++
      return { result: { ok: true, generation }, session: fakeSession(value.id, closed) }
    }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  const first = await manager.connect(profile('same'))
  const reused = await manager.connect(profile('same'))
  assert.deepEqual(reused, first)
  assert.equal(generation, 1)
  assert.ok(manager.get('same'))
  await manager.disconnectAll()
})

test('explicit reconnect replaces only the requested profile with a fresh generation', async () => {
  const closed: string[] = []
  let generation = 0
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      generation++
      return { result: { ok: true, generation }, session: fakeSession(`${value.id}:${generation}`, closed) }
    }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  const firstA = await manager.connect(profile('a'))
  const firstB = await manager.connect(profile('b'))
  const secondA = await manager.reconnect(profile('a'))

  assert.ok(firstA.ok && firstB.ok && secondA.ok)
  assert.notEqual(secondA.generation, firstA.generation)
  const reusedB = await manager.connect(profile('b'))
  assert.ok(reusedB.ok)
  assert.equal(reusedB.generation, firstB.generation)
  assert.ok(manager.get('a'))
  assert.ok(manager.get('b'))
  assert.deepEqual(closed, [`a:${firstA.generation}`])
  await manager.disconnectAll()
})

test('a failed session can connect normally again', async () => {
  let generation = 0
  const adapter: DataSourceAdapter = {
    kind: 'bigquery', async test() { return { ok: true } },
    async connect(value) {
      generation++
      return { result: { ok: true, generation }, session: fakeSession(value.id, []) }
    }
  }
  const manager = new SessionManager(new AdapterRegistry().register(adapter))
  const first = await manager.connect(profile('a'))
  assert.ok(first.ok)
  manager.forget('a', first.generation)
  const reconnected = await manager.connect(profile('a'))
  assert.ok(reconnected.ok)
  assert.notEqual(reconnected.generation, first.generation)
  await manager.disconnectAll()
})
