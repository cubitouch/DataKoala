import assert from 'node:assert/strict'
import test from 'node:test'
import type { PostgresProfile } from '../../shared/types.ts'
import { PostgresAdapter, testTunnelKey } from './postgres-adapter.ts'

class FakeTunnels {
  starts: string[] = []
  stops: Array<{ id: string; generation?: number }> = []

  async start(id: string): Promise<number> {
    this.starts.push(id)
    return 42
  }

  async stop(id: string, generation?: number): Promise<void> {
    this.stops.push({ id, generation })
  }

  async stopAll(): Promise<void> {}
}

function profile(overrides: Partial<PostgresProfile> = {}): PostgresProfile {
  return {
    kind: 'postgres',
    version: 2,
    id: 'p1',
    name: 'Test',
    // Loopback + a closed port so the Postgres attempt fails immediately.
    host: '127.0.0.1',
    port: 1,
    database: 'example_db',
    user: 'reader',
    password: '',
    tlsMode: 'disable',
    readonly: true,
    preConnect: {
      mode: 'teleport',
      dbService: 'example-postgres',
      tunnelPort: 1,
    },
    ...overrides,
  }
}

test('test uses a throwaway tunnel key so a live connection is untouched', async () => {
  const tunnels = new FakeTunnels()
  const adapter = new PostgresAdapter(tunnels)
  await adapter.test(profile())

  assert.equal(testTunnelKey('p1'), 'p1::test')
  assert.deepEqual(tunnels.starts, ['p1::test'])
  assert.deepEqual(tunnels.stops, [{ id: 'p1::test', generation: 42 }])
  assert.ok(
    !tunnels.starts.includes('p1') && !tunnels.stops.some((s) => s.id === 'p1'),
    'the live profile key must never be started or stopped',
  )
})

test('test without a tunnel never touches the tunnel manager', async () => {
  const tunnels = new FakeTunnels()
  const adapter = new PostgresAdapter(tunnels)
  await adapter.test(profile({ preConnect: undefined }))

  assert.equal(tunnels.starts.length, 0)
  assert.equal(tunnels.stops.length, 0)
})
