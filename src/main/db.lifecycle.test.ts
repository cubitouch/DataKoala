import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { Pool, PoolClient } from 'pg'
import { __testing, connect, disconnect, onConnectionStateChanged, runQuery, DatabaseConnectionError } from './db.ts'
import type { ConnectionProfile, ConnectionStateEvent } from '../shared/types.ts'

const profile = (id: string): ConnectionProfile => ({ kind: 'postgres', version: 1, id, name: id, host: 'localhost', port: 5432,
  database: 'test', user: 'test', password: '', ssl: false, readonly: true })

class FakeClient extends EventEmitter {
  releases: boolean[] = []
  pendingReject?: (error: Error) => void
  async query(sql: unknown): Promise<any> {
    if (typeof sql === 'string' && sql === 'SHOW server_version') {
      return { rows: [{ server_version: '16.4' }], fields: [], rowCount: 1 }
    }
    return new Promise((_resolve, reject) => { this.pendingReject = reject })
  }
  release(destroy = false): void { this.releases.push(destroy) }
}

class DeferredValidationClient extends FakeClient {
  validation = deferred<any>()
  override async query(sql: unknown): Promise<any> {
    if (typeof sql === 'string' && sql === 'SHOW server_version') return this.validation.promise
    return super.query(sql)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

class FakePool extends EventEmitter {
  totalCount = 1
  idleCount = 1
  waitingCount = 0
  ended = 0
  clients: FakeClient[]
  constructor(...clients: FakeClient[]) { super(); this.clients = clients }
  async connect(): Promise<PoolClient> {
    const client = this.clients.shift()
    if (!client) throw new Error('no replacement client')
    return client as unknown as PoolClient
  }
  async end(): Promise<void> { this.ended++ }
}

async function harness(pools: FakePool[]): Promise<ConnectionStateEvent[]> {
  await __testing.reset()
  const events: ConnectionStateEvent[] = []
  onConnectionStateChanged((event) => events.push(event))
  __testing.setPoolFactory(() => pools.shift() as unknown as Pool)
  return events
}

async function waitForActivePool(id: string): Promise<void> {
  for (let turn = 0; turn < 20 && !__testing.activePoolIds().includes(id); turn++) {
    await Promise.resolve()
  }
  assert.ok(__testing.activePoolIds().includes(id), `expected connection attempt for ${id} to start`)
}

test('validation client is released once and managed pool remains usable', async () => {
  const client = new FakeClient(); const pool = new FakePool(client)
  await harness([pool])
  const result = await connect(profile('a'))
  assert.equal(result.ok, true)
  assert.deepEqual(client.releases, [false])
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  await disconnect('a')
})

test('idle pool error emits Idle without disconnecting and next operation reacquires', async () => {
  const validation = new FakeClient(); const operation = new FakeClient(); const pool = new FakePool(validation, operation)
  const events = await harness([pool]); await connect(profile('a'))
  pool.emit('error', new Error('idle socket closed'), validation)
  pool.emit('error', new Error('duplicate idle socket signal'), validation)
  assert.equal(__testing.snapshot('a')?.state, 'idle')
  assert.deepEqual(events.map((event) => event.state), ['idle'])
  const pending = runQuery('a', 'select 1')
  await Promise.resolve(); await Promise.resolve()
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  assert.equal(events.at(-1)?.state, 'connected')
  operation.pendingReject?.(new Error('finish test'))
  await assert.rejects(pending, /finish test/)
  await disconnect('a')
})

test('replacement acquisition failure emits one typed failure without retrying', async () => {
  const validation = new FakeClient(); const pool = new FakePool(validation)
  const events = await harness([pool]); await connect(profile('a'))
  pool.emit('error', new Error('idle socket closed'), validation)
  await assert.rejects(runQuery('a', 'select 1'), (error) =>
    error instanceof DatabaseConnectionError && error.code === 'RECONNECT_FAILED')
  assert.equal(events.filter((event) => event.code === 'RECONNECT_FAILED').length, 1)
  assert.equal(__testing.snapshot('a'), undefined)
})

test('active client loss is terminal once and destroys the checked-out client', async () => {
  const validation = new FakeClient(); const operation = new FakeClient(); const pool = new FakePool(validation, operation)
  const events = await harness([pool]); await connect(profile('a'))
  const pending = runQuery('a', 'select pg_sleep(1)')
  await Promise.resolve(); await Promise.resolve()
  operation.emit('error', new Error('socket lost'))
  operation.emit('end')
  operation.pendingReject?.(new Error('socket lost'))
  await assert.rejects(pending, (error) => error instanceof DatabaseConnectionError && error.code === 'CONNECTION_LOST')
  assert.equal(events.filter((event) => event.state === 'failed').length, 1)
  assert.ok(operation.releases.includes(true))
  assert.equal(pool.ended, 1)
})

test('released-client lifecycle signals are not treated as active failures', async () => {
  const validation = new FakeClient(); const pool = new FakePool(validation)
  const events = await harness([pool]); await connect(profile('a'))
  validation.emit('error', new Error('late idle error')); validation.emit('end')
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  assert.equal(events.length, 0)
  await disconnect('a')
})

test('late generation-one client event cannot fail generation two', async () => {
  const oldClient = new FakeClient(); const newClient = new FakeClient()
  const events = await harness([new FakePool(oldClient), new FakePool(newClient)])
  await connect(profile('a')); const second = await connect(profile('a'))
  oldClient.emit('error', new Error('late')); oldClient.emit('end')
  assert.equal(__testing.snapshot('a')?.generation, second.ok ? second.generation : -1)
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  assert.equal(events.length, 0)
  await disconnect('a')
})

test('older validation failure cannot delete a newer connected generation', async () => {
  const oldClient = new DeferredValidationClient(); const newClient = new FakeClient()
  const oldPool = new FakePool(oldClient); const newPool = new FakePool(newClient)
  const events = await harness([oldPool, newPool])
  const older = connect(profile('a')); await waitForActivePool('a')
  const newer = await connect(profile('a'))
  oldClient.validation.reject(new Error('old validation closed'))
  const oldResult = await older
  assert.equal(oldResult.ok, false)
  assert.equal(__testing.snapshot('a')?.generation, newer.ok ? newer.generation : -1)
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  assert.ok(oldPool.ended >= 1)
  assert.equal(newPool.ended, 0)
  assert.equal(events.length, 0)
  await disconnect('a')
})

test('older validation success is superseded and cannot reclaim ownership', async () => {
  const oldClient = new DeferredValidationClient(); const newClient = new FakeClient()
  const oldPool = new FakePool(oldClient); const newPool = new FakePool(newClient)
  const events = await harness([oldPool, newPool])
  const older = connect(profile('a')); await waitForActivePool('a')
  const newer = await connect(profile('a'))
  oldClient.validation.resolve({ rows: [{ server_version: '15-old' }], fields: [], rowCount: 1 })
  const oldResult = await older
  assert.deepEqual(oldResult, { ok: false, error: 'This connection attempt was superseded by a newer connection.' })
  assert.equal(__testing.snapshot('a')?.generation, newer.ok ? newer.generation : -1)
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  assert.ok(oldPool.ended >= 1)
  assert.equal(newPool.ended, 0)
  assert.equal(events.length, 0)
  await disconnect('a')
})

test('generation-scoped stale disconnect cannot remove the newer pool', async () => {
  const oldClient = new FakeClient(); const newClient = new FakeClient()
  await harness([new FakePool(oldClient), new FakePool(newClient)])
  const older = await connect(profile('a')); const newer = await connect(profile('a'))
  assert.ok(older.ok && newer.ok)
  await disconnect('a', older.generation)
  assert.equal(__testing.snapshot('a')?.generation, newer.generation)
  assert.equal(__testing.snapshot('a')?.state, 'connected')
  await disconnect('a')
})

test('late lifecycle signals from a replaced profile cannot affect the active profile', async () => {
  const av = new FakeClient(); const bv = new FakeClient()
  const ap = new FakePool(av); const bp = new FakePool(bv)
  const events = await harness([ap, bp])
  await connect(profile('a'))
  await connect(profile('b'))

  assert.equal(__testing.snapshot('a'), undefined)
  assert.equal(__testing.snapshot('b')?.state, 'connected')
  assert.ok(ap.ended >= 1)

  ap.emit('error', new Error('late idle socket loss'), av)
  av.emit('error', new Error('late client error'))
  av.emit('end')

  assert.equal(__testing.snapshot('b')?.state, 'connected')
  assert.equal(events.length, 0)
  await disconnect('b')
})
