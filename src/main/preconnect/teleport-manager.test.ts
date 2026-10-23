import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeleportPreConnect } from '../../shared/types.ts'
import { PreConnectError } from './errors.ts'
import {
  TeleportTunnelManager,
  type PreConnectStateEvent,
  type TeleportDeps,
  type TunnelProcess,
} from './teleport-manager.ts'

class FakeChild {
  pid: number | undefined = undefined
  stdout: null = null
  stderr: null = null
  private exitListeners: Array<
    (code: number | null, signal: NodeJS.Signals | null) => void
  > = []
  private errorListeners: Array<(error: Error) => void> = []

  on(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this
  on(event: 'error', listener: (error: Error) => void): this
  on(
    event: 'exit' | 'error',
    listener:
      | ((code: number | null, signal: NodeJS.Signals | null) => void)
      | ((error: Error) => void),
  ): this {
    if (event === 'exit')
      this.exitListeners.push(
        listener as (
          code: number | null,
          signal: NodeJS.Signals | null,
        ) => void,
      )
    else this.errorListeners.push(listener as (error: Error) => void)
    return this
  }

  once(event: 'exit' | 'error', listener: () => void): this {
    if (event === 'exit') {
      const wrap = () => {
        this.exitListeners = this.exitListeners.filter((l) => l !== wrap)
        listener()
      }
      this.exitListeners.push(wrap)
    } else {
      const wrap = () => {
        this.errorListeners = this.errorListeners.filter((l) => l !== wrap)
        listener()
      }
      this.errorListeners.push(wrap)
    }
    return this
  }

  kill(): boolean {
    this.emitExit(null, 'SIGTERM')
    return true
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    for (const listener of [...this.exitListeners]) listener(code, signal)
  }
}

function config(
  overrides: Partial<TeleportPreConnect> = {},
): TeleportPreConnect {
  return {
    mode: 'teleport',
    dbService: 'example-postgres',
    tunnelPort: 5433,
    ...overrides,
  }
}

interface Harness {
  manager: TeleportTunnelManager
  children: FakeChild[]
  events: PreConnectStateEvent[]
}

function harness(overrides: Partial<TeleportDeps> = {}): Harness {
  const children: FakeChild[] = []
  const events: PreConnectStateEvent[] = []
  const manager = new TeleportTunnelManager({
    checkStatus: async () => ({ loggedIn: true, roles: [] }),
    spawnTsh: () => {
      const child = new FakeChild()
      children.push(child)
      return child as unknown as TunnelProcess
    },
    waitForPort: async () => {},
    probePort: async () => true,
    restartBaseDelayMs: 1,
    restartMaxDelayMs: 1,
    healthIntervalMs: 1000,
    healthFailureThreshold: 2,
    maxRestarts: 5,
    killGraceMs: 5,
    ...overrides,
  })
  manager.onStateChanged((event) => events.push(event))
  return { manager, children, events }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('start reaches ready and reports the local endpoint', async () => {
  const { manager, events } = harness()
  await manager.start('p1', config())
  assert.equal(manager.isReady('p1'), true)
  assert.deepEqual(
    events.map((event) => event.state),
    ['checking-tsh', 'checking-login', 'starting', 'waiting-for-port', 'ready'],
  )
  assert.match(events.at(-1)!.message, /127\.0\.0\.1:5433/)
  await manager.stopAll()
})

test('start fails fast when no Teleport login exists', async () => {
  const { manager, children, events } = harness({
    checkStatus: async () => ({ loggedIn: false, roles: [] }),
  })
  await assert.rejects(
    manager.start('p1', config()),
    (error: unknown) =>
      error instanceof PreConnectError && error.code === 'TSH_NOT_LOGGED_IN',
  )
  assert.equal(children.length, 0)
  assert.equal(events.at(-1)!.state, 'failed')
  assert.equal(events.at(-1)!.code, 'TSH_NOT_LOGGED_IN')
})

test('start surfaces a missing tsh binary without spawning', async () => {
  const { manager, children } = harness({
    checkStatus: async () => {
      throw new PreConnectError('TSH_NOT_FOUND', 'Could not find "tsh".')
    },
  })
  await assert.rejects(
    manager.start('p1', config()),
    (error: unknown) =>
      error instanceof PreConnectError && error.code === 'TSH_NOT_FOUND',
  )
  assert.equal(children.length, 0)
})

test('start fails when the Teleport session is expired', async () => {
  const { manager, children } = harness({
    checkStatus: async () => ({
      loggedIn: true,
      roles: [],
      validUntil: '2020-01-01T00:00:00Z',
    }),
    now: () => Date.parse('2026-01-01T00:00:00Z'),
  })
  await assert.rejects(
    manager.start('p1', config()),
    (error: unknown) =>
      error instanceof PreConnectError &&
      error.code === 'TSH_NOT_LOGGED_IN' &&
      /expired/i.test(error.message),
  )
  assert.equal(children.length, 0)
})

test('start rejects an invalid configuration before spawning', async () => {
  const { manager, children } = harness()
  await assert.rejects(
    manager.start('p1', config({ dbService: '   ' })),
    (error: unknown) =>
      error instanceof PreConnectError && error.code === 'INVALID_CONFIG',
  )
  await assert.rejects(
    manager.start('p1', config({ tunnelPort: 70000 })),
    (error: unknown) =>
      error instanceof PreConnectError && error.code === 'INVALID_CONFIG',
  )
  assert.equal(children.length, 0)
})

test('a tunnel that exits before the port opens fails the start', async () => {
  const { manager, children } = harness({
    spawnTsh: () => {
      const child = new FakeChild()
      children.push(child)
      queueMicrotask(() => child.emitExit(1, null))
      return child as unknown as TunnelProcess
    },
    waitForPort: () => new Promise(() => {}),
  })
  await assert.rejects(
    manager.start('p1', config()),
    (error: unknown) =>
      error instanceof PreConnectError && error.code === 'TUNNEL_FAILED',
  )
  assert.equal(manager.isReady('p1'), false)
})

test('keepalive restarts the tunnel after an unexpected exit', async () => {
  const { manager, children, events } = harness()
  await manager.start('p1', config())
  assert.equal(children.length, 1)

  children[0].emitExit(1, null)
  await wait(30)

  assert.equal(children.length, 2)
  assert.equal(manager.isReady('p1'), true)
  assert.ok(events.some((event) => event.state === 'restarting'))
  assert.equal(events.at(-1)!.state, 'ready')
  await manager.stopAll()
})

test('stop tears the tunnel down and disables keepalive', async () => {
  const { manager, children } = harness()
  await manager.start('p1', config())
  await manager.stop('p1')

  assert.equal(manager.isReady('p1'), false)
  assert.equal(manager.state('p1'), undefined)

  children[0].emitExit(0, null)
  await wait(20)
  assert.equal(children.length, 1)
})

test('a failed health check restarts the tunnel once the port stops responding', async () => {
  let probes = 0
  const { manager, children, events } = harness({
    healthIntervalMs: 5,
    healthFailureThreshold: 1,
    probePort: async () => {
      probes += 1
      return probes > 1
    },
  })
  await manager.start('p1', config())
  await wait(40)

  assert.equal(children.length, 2)
  assert.equal(manager.isReady('p1'), true)
  assert.ok(events.some((event) => event.state === 'restarting'))
  await manager.stopAll()
})

test('starting again supersedes and closes the previous tunnel', async () => {
  const { manager, children } = harness()
  await manager.start('p1', config({ dbService: 'first' }))
  await manager.start('p1', config({ dbService: 'second' }))

  assert.equal(children.length, 2)
  assert.equal(manager.isReady('p1'), true)
  await manager.stopAll()
})

test('keeps independent tunnels per profile', async () => {
  const { manager } = harness()
  await manager.start('p1', config({ tunnelPort: 5433 }))
  await manager.start('p2', config({ tunnelPort: 5434 }))
  assert.equal(manager.isReady('p1'), true)
  assert.equal(manager.isReady('p2'), true)
  await manager.stop('p1')
  assert.equal(manager.isReady('p1'), false)
  assert.equal(manager.isReady('p2'), true)
  await manager.stopAll()
})
