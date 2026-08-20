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

test('root status lookup queries Tempo with the unpadded trace ID returned by search', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    assert.match(args[2], /trace:id =~ "abc123"/)
    assert.doesNotMatch(args[2], new RegExp(canonicalTraceId))
    return {
      stdout: JSON.stringify({
        traces: [{
          traceID: shortTraceId,
          spanSets: [{ spans: [{ status: 'ok', startTimeMs: Date.parse('2026-08-18T00:00:00.500Z') }] }]
        }]
      }),
      stderr: ''
    }
  }

  const enriched = await enrichTempoRootStatuses(result, {
    start: '2026-08-18T00:00:00.000Z',
    end: '2026-08-18T00:00:01.000Z'
  }, run)

  assert.equal(calls.length, 1)
  assert.equal(calls.some((args) => args[1] === 'get'), false)
  assert.equal(enriched.result.rows[0].status, 'ok')
})
