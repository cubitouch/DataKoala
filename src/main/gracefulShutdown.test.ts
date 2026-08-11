import assert from 'node:assert/strict'
import test from 'node:test'
import { createGracefulShutdown } from './gracefulShutdown.ts'

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test('before-quit waits for database cleanup exactly once before retrying quit', async () => {
  const cleanup = deferred()
  let disconnectCalls = 0
  let quitCalls = 0
  let prevented = 0
  const handler = createGracefulShutdown(
    () => { disconnectCalls++; return cleanup.promise },
    () => { quitCalls++ }
  )
  const event = { preventDefault: () => { prevented++ } }

  handler(event)
  handler(event)
  await Promise.resolve()

  assert.equal(prevented, 2)
  assert.equal(disconnectCalls, 1)
  assert.equal(quitCalls, 0)

  cleanup.resolve()
  await nextTurn()
  assert.equal(quitCalls, 1)

  handler(event)
  assert.equal(prevented, 2, 'the retry after cleanup must be allowed through')
  assert.equal(disconnectCalls, 1)
})

test('cleanup failure is reported but does not trap the app in a non-quitting state', async () => {
  const error = new Error('pool failed to close')
  const reported: unknown[] = []
  let quitCalls = 0
  let prevented = 0
  const handler = createGracefulShutdown(
    async () => { throw error },
    () => { quitCalls++ },
    (caught) => { reported.push(caught) }
  )

  handler({ preventDefault: () => { prevented++ } })
  await nextTurn()

  assert.equal(prevented, 1)
  assert.deepEqual(reported, [error])
  assert.equal(quitCalls, 1)
})
