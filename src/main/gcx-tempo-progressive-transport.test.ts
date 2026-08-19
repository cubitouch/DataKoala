import assert from 'node:assert/strict'
import test from 'node:test'
import { ProgressiveGcxTempoTransport } from './gcx-tempo-progressive-transport.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'

const traceId = (value: number) => value.toString(16).padStart(32, '0')
const start = '2026-08-18T00:00:00.000Z'
const end = '2026-08-18T00:00:08.000Z'

function queryBounds(args: string[]): { from: string; to: string; limit: number } {
  const fromIndex = args.indexOf('--from')
  const toIndex = args.indexOf('--to')
  const limitIndex = args.indexOf('--limit')
  return {
    from: args[fromIndex + 1],
    to: args[toIndex + 1],
    limit: Number(args[limitIndex + 1])
  }
}

function searchResponse(rows: Array<{ id: number; startTimeMs: number; status?: string }>) {
  return {
    stdout: JSON.stringify({ traces: rows.map((row) => ({
      traceID: traceId(row.id),
      rootServiceName: 'checkout',
      rootTraceName: 'POST /checkout',
      startTimeMs: row.startTimeMs,
      durationMs: 400,
      ...(row.status ? { status: row.status } : {})
    })) }),
    stderr: ''
  }
}

test('exhaustive Tempo search bisects saturated windows until the whole selected period is covered', async () => {
  const calls: string[][] = []
  const pages = new Map<string, ReturnType<typeof searchResponse>>([
    [`${start}|${end}|2`, searchResponse([{ id: 1, startTimeMs: 1_000 }, { id: 4, startTimeMs: 7_000 }])],
    [`${start}|2026-08-18T00:00:04.000Z|2`, searchResponse([{ id: 1, startTimeMs: 1_000 }, { id: 2, startTimeMs: 3_000 }])],
    [`${start}|2026-08-18T00:00:02.000Z|2`, searchResponse([{ id: 1, startTimeMs: 1_000 }])],
    [`2026-08-18T00:00:02.000Z|2026-08-18T00:00:04.000Z|2`, searchResponse([{ id: 2, startTimeMs: 3_000 }])],
    [`2026-08-18T00:00:04.000Z|${end}|2`, searchResponse([{ id: 3, startTimeMs: 5_000 }, { id: 4, startTimeMs: 7_000 }])],
    [`2026-08-18T00:00:04.000Z|2026-08-18T00:00:06.000Z|2`, searchResponse([{ id: 3, startTimeMs: 5_000 }])],
    [`2026-08-18T00:00:06.000Z|${end}|2`, searchResponse([{ id: 4, startTimeMs: 7_000 }])]
  ])
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    const bounds = queryBounds(args)
    const page = pages.get(`${bounds.from}|${bounds.to}|${bounds.limit}`)
    if (!page) throw new Error(`Unexpected Tempo page ${JSON.stringify(bounds)}`)
    return page
  }

  const result = await new ProgressiveGcxTempoTransport('production', run, undefined, {
    pageLimit: 2,
    minSliceMs: 1_000,
    maxDenseLimit: 8
  }).search('{ true }', { start, end })

  assert.equal(calls.length, 7)
  assert.ok(calls.every((args) => args.includes('--context') && args.includes('production')))
  assert.deepEqual(result.rows.map((row) => row.traceId), [traceId(4), traceId(3), traceId(2), traceId(1)])
  assert.equal(result.rowCount, 4)
  assert.match(result.notice ?? '', /complete period · 4 traces · 7 queries/)
})

test('a saturated minimum time slice grows its limit until the dense interval is exhausted', async () => {
  const limits: number[] = []
  const run: GcxCommandRunner = async (args) => {
    const { limit } = queryBounds(args)
    limits.push(limit)
    return limit === 2
      ? searchResponse([{ id: 1, startTimeMs: 100 }, { id: 2, startTimeMs: 200 }])
      : searchResponse([{ id: 1, startTimeMs: 100 }, { id: 2, startTimeMs: 200 }, { id: 3, startTimeMs: 300 }])
  }

  const result = await new ProgressiveGcxTempoTransport(undefined, run, undefined, {
    pageLimit: 2,
    minSliceMs: 1_000,
    maxDenseLimit: 8
  }).search('{ true }', {
    start,
    end: '2026-08-18T00:00:01.000Z'
  })

  assert.deepEqual(limits, [2, 4])
  assert.equal(result.rowCount, 3)
  assert.match(result.notice ?? '', /complete period · 3 traces · 2 queries/)
})

test('explicit status enrichment runs once per final unknown trace after exhaustive pagination', async () => {
  const calls: string[][] = []
  const id = traceId(9)
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[1] === 'query') return searchResponse([{ id: 9, startTimeMs: 100 }])
    return {
      stdout: JSON.stringify({ spans: [{
        traceId: id,
        spanId: 'aaaaaaaaaaaaaaaa',
        serviceName: 'checkout',
        name: 'POST /checkout',
        startTimeMs: 100,
        durationMs: 400,
        status: { code: 2 }
      }] }),
      stderr: ''
    }
  }

  const result = await new ProgressiveGcxTempoTransport(undefined, run, undefined, {
    pageLimit: 2
  }).search('{ true }', { start, end, includeStatus: true })

  assert.equal(calls.filter((args) => args[1] === 'query').length, 1)
  assert.equal(calls.filter((args) => args[1] === 'get').length, 1)
  assert.equal(result.rows[0].status, 'error')
})

test('dense windows fail explicitly rather than silently claiming an incomplete period is complete', async () => {
  const run: GcxCommandRunner = async (args) => {
    const { limit } = queryBounds(args)
    return searchResponse(Array.from({ length: limit }, (_, index) => ({ id: index + 1, startTimeMs: index })))
  }

  await assert.rejects(
    () => new ProgressiveGcxTempoTransport(undefined, run, undefined, {
      pageLimit: 2,
      minSliceMs: 1_000,
      maxDenseLimit: 4
    }).search('{ true }', { start, end: '2026-08-18T00:00:01.000Z' }),
    /cannot guarantee complete-period results/
  )
})
