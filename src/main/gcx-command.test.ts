import assert from 'node:assert/strict'
import test from 'node:test'
import { withGcxConfigReadRetry, type GcxCommandRunner } from './gcx-command.ts'
const race = () =>
  Object.assign(new Error('gcx failed'), {
    stderr:
      'Config ~/.config/gcx/config.yaml changed while loading layered configuration; retry',
  })
const success = { stdout: '[]', stderr: '' }
test('retries only the configuration-read race, with bounded short backoff and unchanged argv', async () => {
  const calls: string[][] = [],
    delays: number[] = []
  const run = withGcxConfigReadRetry(
    async (args) => {
      calls.push(args)
      if (calls.length < 3) throw race()
      return success
    },
    async (ms) => {
      delays.push(ms)
    },
  )
  const args = ['logs', 'labels', '--context', 'example']
  assert.equal(await run(args), success)
  assert.deepEqual(delays, [80, 200])
  assert.deepEqual(calls, [args, args, args])
})
test('persistent configuration race stops after three attempts and remains actionable', async () => {
  let calls = 0
  const error = race()
  await assert.rejects(
    withGcxConfigReadRetry(
      async () => {
        calls++
        throw error
      },
      async () => {},
    )(['traces', 'labels']),
    (e) => e === error,
  )
  assert.equal(calls, 3)
})
test('authentication, backend, malformed response and arbitrary retry advice are never retried', async () => {
  for (const message of [
    'authentication expired',
    'backend unavailable',
    'retry later',
    'malformed JSON',
    'Config invalid',
  ]) {
    let calls = 0
    const error = new Error(message)
    await assert.rejects(
      withGcxConfigReadRetry(
        async () => {
          calls++
          throw error
        },
        async () => {},
      )([]),
      (e) => e === error,
    )
    assert.equal(calls, 1)
  }
})
test('abandonment during backoff prevents another process attempt', async () => {
  const controller = new AbortController()
  let calls = 0
  const run = withGcxConfigReadRetry(
    async () => {
      calls++
      throw race()
    },
    async () => {
      controller.abort()
    },
  )
  await assert.rejects(run([], controller.signal), { name: 'AbortError' })
  assert.equal(calls, 1)
})
test('independent concurrent commands have separate retry budgets and payloads', async () => {
  const counts = new Map<string, number>()
  const runner: GcxCommandRunner = async (args) => {
    const key = args.join(' '),
      n = (counts.get(key) ?? 0) + 1
    counts.set(key, n)
    if (n === 1) throw race()
    return { stdout: key, stderr: '' }
  }
  const run = withGcxConfigReadRetry(runner, async () => {})
  const results = await Promise.all([
    run(['logs', 'labels']),
    run(['traces', 'labels']),
    run(['metrics', 'query']),
  ])
  assert.deepEqual(
    results.map((r) => r.stdout),
    ['logs labels', 'traces labels', 'metrics query'],
  )
  assert.deepEqual([...counts.values()], [2, 2, 2])
})
