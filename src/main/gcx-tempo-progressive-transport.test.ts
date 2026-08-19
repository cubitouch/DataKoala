import assert from 'node:assert/strict'
import test from 'node:test'
import { ProgressiveGcxTempoTransport } from './gcx-tempo-progressive-transport.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'

const oldTrace = '0123456789abcdef0123456789abcdef'
const newTrace = 'fedcba9876543210fedcba9876543210'

test('progressive Tempo search grows the gcx limit and only enriches newly exposed traces', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[1] === 'query') {
      return {
        stdout: JSON.stringify({ traces: [
          { traceID: oldTrace, rootServiceName: 'checkout', rootTraceName: 'POST /checkout', durationMs: 400 },
          { traceID: newTrace, rootServiceName: 'checkout', rootTraceName: 'POST /checkout', durationMs: 900 }
        ] }),
        stderr: ''
      }
    }
    return {
      stdout: JSON.stringify({ spans: [{
        traceId: newTrace,
        spanId: 'aaaaaaaaaaaaaaaa',
        serviceName: 'checkout',
        name: 'POST /checkout',
        startTimeMs: 1000,
        durationMs: 900,
        status: { code: 2 }
      }] }),
      stderr: ''
    }
  }

  const result = await new ProgressiveGcxTempoTransport('production', run).search('{ true }', {
    start: '2026-08-18T00:00:00.000Z',
    end: '2026-08-19T00:00:00.000Z',
    includeStatus: true,
    limit: 40,
    skipStatusTraceIds: [oldTrace]
  })

  assert.deepEqual(calls[0], [
    'traces', 'query', '{ true }', '--context', 'production',
    '--from', '2026-08-18T00:00:00.000Z', '--to', '2026-08-19T00:00:00.000Z',
    '--limit', '40', '-o', 'json'
  ])
  assert.equal(calls.filter((args) => args[1] === 'get').length, 1)
  assert.deepEqual(calls[1], ['traces', 'get', newTrace, '--context', 'production', '-o', 'json'])
  assert.equal(result.rows[0].status, 'unknown')
  assert.equal(result.rows[1].status, 'error')
  assert.match(result.notice ?? '', /up to 40 traces/)
})
