import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test, { afterEach } from 'node:test'
import type { Pool, PoolClient, PoolConfig } from 'pg'
import type { ConnectionProfile } from '../shared/types'
import { __testing, connect, disconnectAll } from './db.ts'

class FakeClient extends EventEmitter {
  releases: boolean[] = []

  async query(): Promise<{ rows: { server_version: string }[]; fields: []; rowCount: number }> {
    return { rows: [{ server_version: '16.4' }], fields: [], rowCount: 1 }
  }

  release(destroy = false): void {
    this.releases.push(destroy)
  }
}

class FakePool extends EventEmitter {
  readonly client = new FakeClient()
  endCalls = 0
  totalCount = 1
  idleCount = 0
  waitingCount = 0

  async connect(): Promise<PoolClient> {
    return this.client as unknown as PoolClient
  }

  async end(): Promise<void> {
    this.endCalls++
  }

  asPool(): Pool {
    return this as unknown as Pool
  }
}

class DeferredPool extends FakePool {
  private resolveConnect: ((client: PoolClient) => void) | null = null

  override connect(): Promise<PoolClient> {
    return new Promise((resolve) => { this.resolveConnect = resolve })
  }

  resolve(): void {
    this.resolveConnect?.(this.client as unknown as PoolClient)
  }
}

const profile = (id: string): ConnectionProfile => ({
  kind: 'postgres',
  version: 1,
  id,
  name: id,
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '',
  ssl: false,
  readonly: true
})

const usePools = (...fakePools: FakePool[]): void => {
  const queue = [...fakePools]
  __testing.setPoolFactory((_config: PoolConfig) => {
    const next = queue.shift()
    assert.ok(next, 'unexpected pool creation')
    return next.asPool()
  })
}

afterEach(async () => {
  await __testing.reset()
})

test('connecting a different profile closes the previous pool before keeping the new one', async () => {
  const first = new FakePool()
  const second = new FakePool()
  usePools(first, second)

  const firstResult = await connect(profile('first'))
  assert.equal(firstResult.ok, true)
  assert.deepEqual(__testing.activePoolIds(), ['first'])
  assert.equal(first.endCalls, 0)

  const secondResult = await connect(profile('second'))
  assert.equal(secondResult.ok, true)
  assert.equal(first.endCalls, 1)
  assert.deepEqual(__testing.activePoolIds(), ['second'])
})

test('reconnecting the same profile replaces its old pool instead of accumulating sockets', async () => {
  const first = new FakePool()
  const replacement = new FakePool()
  usePools(first, replacement)

  assert.equal((await connect(profile('same'))).ok, true)
  assert.equal((await connect(profile('same'))).ok, true)

  assert.equal(first.endCalls, 1)
  assert.deepEqual(__testing.activePoolIds(), ['same'])
})

test('disconnectAll invalidates and closes an in-flight connection attempt', async () => {
  const pending = new DeferredPool()
  usePools(pending)

  const connection = connect(profile('pending'))
  for (let turn = 0; turn < 10 && __testing.activePoolIds().length === 0; turn++) {
    await Promise.resolve()
  }
  assert.deepEqual(__testing.activePoolIds(), ['pending'])

  await disconnectAll()
  assert.equal(pending.endCalls, 1)
  assert.deepEqual(__testing.activePoolIds(), [])

  pending.resolve()
  const result = await connection
  assert.equal(result.ok, false)
  assert.match(result.error, /superseded/i)
  assert.deepEqual(__testing.activePoolIds(), [])
})
