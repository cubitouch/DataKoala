import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:net'
import { PortTimeoutError, probePort, waitForPort } from './port-probe.ts'

async function startServer(): Promise<{
  port: number
  close: () => Promise<void>
}> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Test server did not bind a TCP port.')
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

test('probePort resolves true when something is listening', async () => {
  const server = await startServer()
  try {
    assert.equal(await probePort('127.0.0.1', server.port, 500), true)
  } finally {
    await server.close()
  }
})

test('probePort resolves false for a closed port', async () => {
  const server = await startServer()
  const { port } = server
  await server.close()
  assert.equal(await probePort('127.0.0.1', port, 500), false)
})

test('waitForPort resolves against a listening server', async () => {
  const server = await startServer()
  try {
    await waitForPort({ port: server.port, timeoutMs: 2000 })
  } finally {
    await server.close()
  }
})

test('waitForPort raises PortTimeoutError when nothing ever listens', async () => {
  const server = await startServer()
  const { port } = server
  await server.close()
  await assert.rejects(
    waitForPort({ port, timeoutMs: 400, intervalMs: 50 }),
    PortTimeoutError,
  )
})

test('waitForPort stops early when the signal aborts', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    waitForPort({ port: 1, timeoutMs: 5000, signal: controller.signal }),
    PortTimeoutError,
  )
})
