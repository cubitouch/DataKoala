import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '../shared/types.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { enrichTempoRootStatuses } from './tempo-root-status.ts'

const request = { start: '2026-08-18T00:00:00.000Z', end: '2026-08-18T00:00:01.000Z' }

function source(traceIds: string[], status = 'unknown'): QueryResult {
  return { columns: [], rows: traceIds.map((traceId) => ({ traceId, status })), rowCount: traceIds.length, durationMs: 0 }
}

function payload(traceIds: string[]) {
  return { stdout: JSON.stringify({ traces: traceIds.map((traceID) => ({ traceID })) }), stderr: '' }
}

test('successful ERROR lookup classifies an unmatched root as ok using its unpadded Tempo trace ID', async () => {
  const shortTraceId = 'abc123'
  const canonicalTraceId = shortTraceId.padStart(32, '0')
  const calls: string[][] = []
  const progress: number[] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    assert.match(args[2], /trace:id =~ "abc123"/)
    assert.doesNotMatch(args[2], new RegExp(canonicalTraceId))
    assert.match(args[2], /!>>/)
    assert.match(args[2], /span:status = error/)
    assert.doesNotMatch(args[2], /span:status = ok/)
    return payload([])
  }

  const enriched = await enrichTempoRootStatuses(source([shortTraceId]), request, run, {
    onProgress: (update) => progress.push(update.queriesCompleted)
  })

  assert.equal(calls.length, 1)
  assert.equal(enriched.queriesCompleted, 1)
  assert.equal(enriched.result.rows[0].status, 'ok')
  assert.deepEqual(progress, [1])
})

test('one ERROR lookup classifies ERROR, explicit OK, and UNSET roots into binary outcomes', async () => {
  const ids = ['1', '22', '333']
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => { calls.push(args); return payload(['1']) }

  const enriched = await enrichTempoRootStatuses(source(ids), request, run)

  assert.deepEqual(enriched.result.rows.map((row) => row.status), ['error', 'ok', 'ok'])
  assert.equal(enriched.queriesCompleted, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls.some((args) => args[2].includes('span:status = ok')), false)
})

test('failed ERROR classification never creates false successes and preserves existing statuses', async () => {
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    const run: GcxCommandRunner = async () => { throw new Error('provider unavailable') }
    const input: QueryResult = { ...source(['1', '2']), rows: [{ traceId: '1', status: 'unknown' }, { traceId: '2', status: 'error' }] }
    const enriched = await enrichTempoRootStatuses(input, request, run)
    assert.deepEqual(enriched.result.rows.map((row) => row.status), ['unknown', 'error'])
    assert.equal(enriched.queriesCompleted, 1)
    assert.equal(warnings.some((warning) => warning[0] === '[tempo-status] root predicate failed'), true)
  } finally { console.warn = originalWarn }
})

test('malformed ERROR response preserves unknown rather than classifying it as ok', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    const run: GcxCommandRunner = async () => ({ stdout: '{bad json', stderr: '' })
    const enriched = await enrichTempoRootStatuses(source(['1']), request, run)
    assert.equal(enriched.result.rows[0].status, 'unknown')
    assert.equal(enriched.queriesCompleted, 1)
  } finally { console.warn = originalWarn }
})

test('batching issues one ERROR query per batch and uses each candidate count as its limit', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => { calls.push(args); return payload([]) }
  const enriched = await enrichTempoRootStatuses(source(['1', '2', '3', '4', '5']), request, run, { batchSize: 2 })

  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map((args) => args[args.indexOf('--limit') + 1]), ['2', '2', '1'])
  assert.equal(calls.every((args) => args[2].includes('span:status = error')), true)
  assert.equal(calls.some((args) => args[2].includes('span:status = ok')), false)
  assert.equal(enriched.queriesCompleted, 3)
})
