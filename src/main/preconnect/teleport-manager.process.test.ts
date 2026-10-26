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
