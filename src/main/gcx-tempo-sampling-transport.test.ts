import assert from 'node:assert/strict'
import test from 'node:test'
import type { TempoQueryContext, TempoSearchProgress } from '../shared/tempo.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { SamplingGcxTempoTransport } from './gcx-tempo-sampling-transport.ts'

const start = '2026-08-18T00:00:00.000Z'
const end = '2026-08-18T01:00:00.000Z'
const traceId = '0123456789abcdef0123456789abcdef'

function searchPayload(status = 'error') {
  return {
    stdout: JSON.stringify({ traces: [{
      traceID: traceId,
      rootServiceName: 'checkout',
      rootTraceName: 'POST /checkout',
      startTimeMs: Date.parse(start) + 1_000,
      durationMs: 420,
      spanSets: [{ spans: [{
        spanID: 'a',
        startTimeUnixNano: String(BigInt(Date.parse(start) + 1_000) * 1_000_000n),
        attributes: { 'span:status': status }
      }] }]
    }] }),
    stderr: ''
  }
}

test('sampled Tempo search resolves root status by default without full trace gets', async () => {
  const calls: string[][] = []
  const progress: TempoSearchProgress[] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[2]?.includes('!>>')) return searchPayload('ok')
    return searchPayload('error')
  }
  const request: TempoQueryContext = {
    start,
    end,
    sampleSize: 250,
    onProgress: (update) => progress.push(update)
  }

  const result = await new SamplingGcxTempoTransport('production', run, 'tempo-uid').search('{ true }', request)

  assert.equal(calls.length, 2)
  assert.equal(calls[0][0], 'traces')
  assert.equal(calls[0][1], 'query')
  assert.match(calls[0][2], /select\(span:status\)/)
  assert.ok(calls[0].includes('--context'))
  assert.ok(calls[0].includes('production'))
  assert.ok(calls[0].includes('--datasource'))
  assert.ok(calls[0].includes('tempo-uid'))
  assert.equal(calls[0][calls[0].indexOf('--limit') + 1], '250')
  assert.equal(calls[0][calls[0].indexOf('--from') + 1], start)
  assert.equal(calls[0][calls[0].indexOf('--to') + 1], end)

  assert.match(calls[1][2], /trace:id =~/)
  assert.match(calls[1][2], /!>>/)
  assert.match(calls[1][2], /select\(span:status\)/)
  assert.equal(calls[1][calls[1].indexOf('--limit') + 1], '1')
  assert.equal(calls.filter((args) => args[1] === 'get').length, 0)

  assert.equal(result.rowCount, 1)
  assert.equal(result.rows[0].status, 'ok')
  assert.match(result.notice ?? '', /sample up to 250 traces · 1 returned · 1 search query · 1 root-status query/)
  assert.equal(progress.length, 2)
  assert.equal(progress[0].coveredMs, 0)
  assert.equal(progress[0].totalMs, 3_600_000)
  assert.equal(progress[0].completedChunks, 1)
  assert.equal(progress[0].pendingChunks, 0)
  assert.equal(progress[0].tracesFound, 1)
  assert.equal(progress[0].queriesCompleted, 1)
  assert.equal(progress[0].rows[0].status, 'error')
  assert.equal(progress[1].queriesCompleted, 2)
  assert.equal(progress[1].rows[0].status, 'ok')
})

test('sampled Tempo search can explicitly skip root status enrichment', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return searchPayload()
  }

  const result = await new SamplingGcxTempoTransport(undefined, run).search('{ true }', {
    start,
    end,
    sampleSize: 100,
    includeStatus: false
  })

  assert.equal(calls.length, 1)
  assert.equal(result.rows[0].status, 'error')
})

test('omitting a sample size preserves exhaustive complete-period pagination', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return searchPayload()
  }

  const result = await new SamplingGcxTempoTransport(undefined, run).search('{ true }', { start, end, includeStatus: false })

  assert.equal(calls.length, 1)
  assert.equal(calls[0][calls[0].indexOf('--limit') + 1], '100')
  assert.match(result.notice ?? '', /complete period · 1 traces · 1 search query/)
})

test('sample size validation rejects invalid budgets before querying Tempo', async () => {
  let called = false
  const run: GcxCommandRunner = async () => {
    called = true
    return searchPayload()
  }

  await assert.rejects(
    () => new SamplingGcxTempoTransport(undefined, run).search('{ true }', { start, end, sampleSize: 0 }),
    /positive integer/
  )
  assert.equal(called, false)
})
