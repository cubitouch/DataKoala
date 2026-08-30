import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxTempoTransport } from './gcx-tempo-transport.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'

const traceId = '00000000000000000000000000000001'

function traceResponse() {
  return {
    stdout: JSON.stringify({
      spans: [{
        traceId,
        spanId: '0000000000000001',
        parentSpanId: '',
        serviceName: 'checkout-api',
        name: 'POST /checkout',
        startTimeMs: 1_000,
        durationMs: 250,
        status: 'OK',
        kind: 'SERVER'
      }]
    }),
    stderr: ''
  }
}

test('Tempo trace get forwards a known time bound to gcx', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => { calls.push(args); return traceResponse() }
  const transport = new GcxTempoTransport('production', run, 'tempo-uid')
  const request = { start: '2026-08-29T20:00:00.000Z', end: '2026-08-29T20:00:10.000Z' }

  const result = await transport.get(traceId, request)

  assert.equal(result.rowCount, 1)
  assert.deepEqual(calls, [[
    'traces', 'get', traceId,
    '--context', 'production',
    '--datasource', 'tempo-uid',
    '--from', request.start,
    '--to', request.end,
    '-o', 'json'
  ]])
})
