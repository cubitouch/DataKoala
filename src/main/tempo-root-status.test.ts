import assert from 'node:assert/strict'
import test from 'node:test'
import type { QueryResult } from '../shared/types.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { enrichTempoRootStatuses } from './tempo-root-status.ts'

const shortTraceId = 'abc123'
const canonicalTraceId = shortTraceId.padStart(32, '0')

const result: QueryResult = {
  columns: [],
  rows: [{ traceId: shortTraceId, status: 'unknown', startTimeMs: Date.parse('2026-08-18T00:00:00.500Z') }],
  rowCount: 1,
  durationMs: 0
}

function membershipPayload(matches: boolean) {
  return {
    stdout: JSON.stringify({
      traces: matches ? [{
        traceID: shortTraceId,
        spanSets: [{ spans: [{ spanID: 'a', startTimeMs: Date.parse('2026-08-18T00:00:00.500Z') }] }]
      }] : []
    }),
    stderr: ''
  }
}

test('root status lookup classifies by predicates using the unpadded Tempo trace ID', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    assert.match(args[2], /trace:id =~ "abc123"/)
    assert.doesNotMatch(args[2], new RegExp(canonicalTraceId))
    assert.match(args[2], /!>>/)
    if (args[2].includes('span:status = error')) return membershipPayload(false)
    if (args[2].includes('span:status = ok')) return membershipPayload(true)
    throw new Error(`Unexpected root-status query: ${args[2]}`)
  }

  const enriched = await enrichTempoRootStatuses(result, {
    start: '2026-08-18T00:00:00.000Z',
    end: '2026-08-18T00:00:01.000Z'
  }, run)

  assert.equal(calls.length, 2)
  assert.equal(calls.some((args) => args[1] === 'get'), false)
  assert.equal(enriched.queriesCompleted, 2)
  assert.equal(enriched.result.rows[0].status, 'ok')
})

test('root status predicates distinguish errors, successes and unset roots without reading selected attributes', async () => {
  const errorId = '1'
  const okId = '22'
  const unsetId = '333'
  const source: QueryResult = {
    columns: [],
    rows: [
      { traceId: errorId, status: 'unknown' },
      { traceId: okId, status: 'unknown' },
      { traceId: unsetId, status: 'unknown' }
    ],
    rowCount: 3,
    durationMs: 0
  }
  const run: GcxCommandRunner = async (args) => {
    if (args[2].includes('span:status = error')) {
      return { stdout: JSON.stringify({ traces: [{ traceID: errorId, spanSets: [{ spans: [{ spanID: 'e' }] }] }] }), stderr: '' }
    }
    if (args[2].includes('span:status = ok')) {
      assert.doesNotMatch(args[2], /trace:id =~ "[^"]*\b1\b/)
      return { stdout: JSON.stringify({ traces: [{ traceID: okId, spanSets: [{ spans: [{ spanID: 'o' }] }] }] }), stderr: '' }
    }
    throw new Error(`Unexpected root-status query: ${args[2]}`)
  }

  const enriched = await enrichTempoRootStatuses(source, {
    start: '2026-08-18T00:00:00.000Z',
    end: '2026-08-18T00:00:01.000Z'
  }, run)

  assert.deepEqual(enriched.result.rows.map((row) => row.status), ['error', 'ok', 'unknown'])
  assert.equal(enriched.queriesCompleted, 2)
})
