import assert from 'node:assert/strict'
import test from 'node:test'
import { ProgressiveGcxTempoTransport } from './gcx-tempo-progressive-transport.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'
import type { TempoQueryContext, TempoSearchProgress } from '../shared/tempo.ts'

const traceId = (value: number) => value.toString(16).padStart(32, '0')
const start = '2026-08-18T00:00:00.000Z'
const end = '2026-08-18T00:00:08.000Z'
const startMs = Date.parse(start)

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
  const progress: TempoSearchProgress[] = []
  const pages = new Map<string, ReturnType<typeof searchResponse>>([
    [`${start}|${end}|2`, searchResponse([{ id: 1, startTimeMs: startMs + 1_000 }, { id: 4, startTimeMs: startMs + 7_000 }])],
    [`${start}|2026-08-18T00:00:04.000Z|2`, searchResponse([{ id: 1, startTimeMs: startMs + 1_000 }, { id: 2, startTimeMs: startMs + 3_000 }])],
    [`${start}|2026-08-18T00:00:02.000Z|2`, searchResponse([{ id: 1, startTimeMs: startMs + 1_000 }])],
    [`2026-08-18T00:00:02.000Z|2026-08-18T00:00:04.000Z|2`, searchResponse([{ id: 2, startTimeMs: startMs + 3_000 }])],
    [`2026-08-18T00:00:04.000Z|${end}|2`, searchResponse([{ id: 3, startTimeMs: startMs + 5_000 }, { id: 4, startTimeMs: startMs + 7_000 }])],
    [`2026-08-18T00:00:04.000Z|2026-08-18T00:00:06.000Z|2`, searchResponse([{ id: 3, startTimeMs: startMs + 5_000 }])],
    [`2026-08-18T00:00:06.000Z|${end}|2`, searchResponse([{ id: 4, startTimeMs: startMs + 7_000 }])]
  ])
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    const bounds = queryBounds(args)
    const page = pages.get(`${bounds.from}|${bounds.to}|${bounds.limit}`)
    if (!page) throw new Error(`Unexpected Tempo page ${JSON.stringify(bounds)}`)
    return page
  }
  const request: TempoQueryContext = { start, end, onProgress: (update) => progress.push(update) }

  const result = await new ProgressiveGcxTempoTransport('production', run, undefined, {
    pageLimit: 2,
    minSliceMs: 1_000,
    maxDenseLimit: 8
  }).search('{ true }', request)

  assert.equal(calls.length, 7)
  assert.ok(calls.every((args) => args.includes('--context') && args.includes('production')))
  assert.deepEqual(result.rows.map((row) => row.traceId), [traceId(4), traceId(3), traceId(2), traceId(1)])
  assert.equal(result.rowCount, 4)
  assert.match(result.notice ?? '', /complete period · 4 traces · 7 queries/)
  assert.equal(progress.length, 7)
  assert.equal(progress[0].coveredMs, 0)
  assert.equal(progress[0].totalMs, 8_000)
  assert.equal(progress[0].tracesFound, 2)
  assert.equal(progress[0].completedChunks, 0)
  assert.equal(progress[0].pendingChunks, 2)
  assert.ok(progress.some((update) => update.rows.length > 0))
  assert.deepEqual(progress.at(-1), {
    provider: 'tempo',
    coveredMs: 8_000,
    totalMs: 8_000,
    completedChunks: 4,
    pendingChunks: 0,
    queriesCompleted: 7,
    tracesFound: 4,
    rows: [{
      traceId: traceId(4),
      rootService: 'checkout',
      rootOperation: 'POST /checkout',
      startTimeMs: startMs + 7_000,
      durationMs: 400,
      matchedSpans: 0,
      status: 'unknown'
    }]
  })
})

test('a saturated minimum time slice grows its limit until the dense interval is exhausted', async () => {
  const limits: number[] = []
  const run: GcxCommandRunner = async (args) => {
    const { limit } = queryBounds(args)
    limits.push(limit)
    return limit === 2
      ? searchResponse([{ id: 1, startTimeMs: startMs + 100 }, { id: 2, startTimeMs: startMs + 200 }])
      : searchResponse([{ id: 1, startTimeMs: startMs + 100 }, { id: 2, startTimeMs: startMs + 200 }, { id: 3, startTimeMs: startMs + 300 }])
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

test('sub-second selected ranges never collapse to equal Tempo start/end seconds', async () => {
  const calls: string[][] = []
  const progress: TempoSearchProgress[] = []
  const exactStart = '2026-08-18T00:00:00.250Z'
  const exactEnd = '2026-08-18T00:00:00.750Z'
  const base = Date.parse('2026-08-18T00:00:00.000Z')
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    const { from, to, limit } = queryBounds(args)
    assert.equal(from, '2026-08-18T00:00:00.000Z')
    assert.equal(to, '2026-08-18T00:00:01.000Z')
    assert.ok(Date.parse(to) - Date.parse(from) >= 1_000)
    return limit === 2
      ? searchResponse([
          { id: 1, startTimeMs: base + 100 },
          { id: 2, startTimeMs: base + 300 }
        ])
      : searchResponse([
          { id: 1, startTimeMs: base + 100 },
          { id: 2, startTimeMs: base + 300 },
          { id: 3, startTimeMs: base + 900 }
        ])
  }
  const request: TempoQueryContext = {
    start: exactStart,
    end: exactEnd,
    onProgress: (update) => progress.push(update)
  }

  const result = await new ProgressiveGcxTempoTransport(undefined, run, undefined, {
    pageLimit: 2,
    minSliceMs: 1_000,
    maxDenseLimit: 4
  }).search('{ true }', request)

  assert.deepEqual(calls.map((args) => queryBounds(args).limit), [2, 4])
  assert.deepEqual(result.rows.map((row) => row.traceId), [traceId(2)])
  assert.match(result.notice ?? '', /complete period · 1 traces · 2 queries/)
  assert.equal(progress.at(-1)?.totalMs, 500)
  assert.equal(progress.at(-1)?.coveredMs, 500)
  assert.equal(progress.at(-1)?.tracesFound, 1)
})

test('explicit status enrichment runs once per final unknown trace after exhaustive pagination', async () => {
  const calls: string[][] = []
  const id = traceId(9)
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[1] === 'query') return searchResponse([{ id: 9, startTimeMs: startMs + 100 }])
    return {
      stdout: JSON.stringify({ spans: [{
        traceId: id,
        spanId: 'aaaaaaaaaaaaaaaa',
        serviceName: 'checkout',
        name: 'POST /checkout',
        startTimeMs: startMs + 100,
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
    return searchResponse(Array.from({ length: limit }, (_, index) => ({ id: index + 1, startTimeMs: startMs + index })))
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
