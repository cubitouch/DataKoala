import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import {
  TeleportTunnelManager,
  type TunnelProcess,
} from './teleport-manager.ts'
import { probePort, waitForPort } from './port-probe.ts'

test('stopAll joins cleanup already started by readiness failure or stop', async () => {
  for (const action of ['readiness-failure', 'stop'] as const) {
    const reservation = createServer().listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const address = reservation.address()
    assert.ok(address && typeof address !== 'string')
    const port = address.port
    await new Promise<void>((resolve) => reservation.close(() => resolve()))
    let child: ChildProcess | undefined
    let sawTerm!: () => void
    const terminating = new Promise<void>((resolve) => {
      sawTerm = resolve
    })
    const manager = new TeleportTunnelManager({
      checkStatus: async () => ({ loggedIn: true, roles: [] }),
      spawnTsh: () => {
        child = spawn(
          process.execPath,
          [
            '-e',
            `process.on('SIGTERM',()=>process.stdout.write('TERM'));require('net').createServer().listen(${port},'127.0.0.1')`,
          ],
          { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
        )
        child.stdout!.on('data', () => sawTerm())
        return child as unknown as TunnelProcess
      },
      killGraceMs: 250,
      waitForPort: async (configuredPort, timeoutMs, signal) => {
        await waitForPort({
          host: '127.0.0.1',
          port: configuredPort,
          timeoutMs,
          signal,
        })
        if (action === 'readiness-failure')
          throw Error('Synthetic readiness failure')
      },
    })
    let cleanup: Promise<unknown> | undefined
    try {
      const opening = manager.start('owned', {
        mode: 'teleport',
        dbService: 'synthetic',
        tunnelPort: port,
        keepalive: false,
      })
      if (action === 'readiness-failure')
        cleanup = opening.catch((error) => error)
      else {
        await opening
        cleanup = manager.stop('owned')
      }
      await terminating
      assert.equal(
        await probePort('127.0.0.1', port, 100),
        true,
        'TERM-resistant listener is still owned during cleanup',
      )
      await manager.stopAll()
      assert.equal(
        await probePort('127.0.0.1', port, 100),
        false,
        'stopAll must await concurrent TERM/KILL cleanup',
      )
      assert.ok(child?.exitCode !== null || child?.signalCode !== null)
      await cleanup
      await delay(300)
      assert.equal(
        await probePort('127.0.0.1', port, 100),
        false,
        'no restart after shutdown',
      )
      console.log(
        JSON.stringify({
          action,
          port,
          pid: child?.pid,
          phase: 'concurrent-stopAll-joined-cleanup',
        }),
      )
    } finally {
      await cleanup
      await manager.stopAll()
      if (child?.pid && child.exitCode === null && child.signalCode === null)
        process.kill(-child.pid, 'SIGKILL')
    }
  }
})

test('owned real listener exits on stop/stopAll/readiness failure, including TERM-resistant helpers', async () => {
  for (const action of ['stop', 'stopAll', 'readiness-failure'] as const) {
    const reservation = createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const address = reservation.address()
    assert.ok(address && typeof address !== 'string')
    const port = address.port
    await new Promise<void>((resolve) => reservation.close(() => resolve()))
    let child: ChildProcess | undefined
    const manager = new TeleportTunnelManager({
      checkStatus: async () => ({ loggedIn: true, roles: [] }),
      spawnTsh: () => {
        child = spawn(
          process.execPath,
          [
            '-e',
            `process.on('SIGTERM',()=>{});require('net').createServer().listen(${port},'127.0.0.1')`,
          ],
          { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
        )
        return child as unknown as TunnelProcess
      },
      killGraceMs: 80,
      waitForPort: async (configuredPort, timeoutMs, signal) => {
        await waitForPort({
          host: '127.0.0.1',
          port: configuredPort,
          timeoutMs,
          signal,
        })
        if (action === 'readiness-failure')
          throw Error('Synthetic readiness failure after listener start')
      },
    })
    try {
      const opening = manager.start('owned', {
        mode: 'teleport',
        dbService: 'synthetic',
        tunnelPort: port,
        keepalive: false,
      })
      if (action === 'readiness-failure')
        await assert.rejects(opening, /Synthetic readiness/)
      else {
        await opening
        assert.equal(await probePort('127.0.0.1', port, 100), true)
        assert.ok(child?.pid)
        console.log(
          JSON.stringify({
            action,
            port,
            pid: child.pid,
            phase: 'owned-listener-before-stop',
          }),
        )
        if (action === 'stop') await manager.stop('owned')
        else await manager.stopAll()
      }
      await delay(150)
      assert.equal(await probePort('127.0.0.1', port, 100), false)
      assert.ok(child?.exitCode !== null || child?.signalCode !== null)
      await delay(150)
      assert.equal(
        await probePort('127.0.0.1', port, 100),
        false,
        'listener must not restart',
      )
      console.log(
        JSON.stringify({
          action,
          port,
          pid: child?.pid,
          phase: 'listener-absent-after-grace',
        }),
      )
    } finally {
      await manager.stopAll()
      if (child?.pid && child.exitCode === null && child.signalCode === null)
        process.kill(-child.pid, 'SIGKILL')
    }
  }
})
