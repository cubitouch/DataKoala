import assert from 'node:assert/strict'
import test from 'node:test'
import { ProgressiveGcxTempoTransport } from './gcx-tempo-progressive-transport.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { applyTempoSearchStatuses, ensureTempoSearchStatusSelection } from './tempo-search-status.ts'

const traceId = '0123456789abcdef0123456789abcdef'

test('Tempo trace search requests span status without changing metrics expressions', () => {
  assert.equal(ensureTempoSearchStatusSelection('{ true }'), '{ true } | select(span:status)')
  assert.equal(ensureTempoSearchStatusSelection('{ true } | select(span:status)'), '{ true } | select(span:status)')
  assert.equal(ensureTempoSearchStatusSelection('{ true } | rate()'), '{ true } | rate()')
})

test('Tempo search span sets mark known failed traces without claiming partial OK spans mean trace success', () => {
  const result = {
    columns: [],
    rows: [
      { traceId, status: 'unknown' },
      { traceId: '11111111111111111111111111111111', status: 'unknown' }
    ],
    rowCount: 2,
    durationMs: 0
  }
  const annotated = applyTempoSearchStatuses(result, {
    traces: [
      {
        traceID: traceId,
        spanSets: [{ spans: [{ attributes: [{ key: 'status', value: { stringValue: 'error' } }] }] }]
      },
      {
        traceID: '11111111111111111111111111111111',
        spanSets: [{ spans: [{ attributes: [{ key: 'status', value: { stringValue: 'ok' } }] }] }]
      }
    ]
  })
  assert.equal(annotated.rows[0].status, 'error')
  assert.equal(annotated.rows[1].status, 'unknown')
})

test('progressive Tempo summary search annotates matched errors from one request without trace get calls', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return {
      stdout: JSON.stringify({
        traces: [{
          traceID: traceId,
          rootServiceName: 'checkout',
          rootTraceName: 'POST /checkout',
          startTimeMs: Date.parse('2026-08-18T00:00:00.500Z'),
          durationMs: 1_500,
          spanSets: [{
            spans: [{
              spanID: 'aaaaaaaaaaaaaaaa',
              attributes: [{ key: 'status', value: { stringValue: 'error' } }]
            }]
          }]
        }]
      }),
      stderr: ''
    }
  }

  // This test isolates the immediate search-summary evidence path. The normal viewer
  // now performs an additional batched root-status query by default; that behavior is
  // covered separately by the progressive/sampling transport tests.
  const result = await new ProgressiveGcxTempoTransport(undefined, run).search('{ resource.service.name = "checkout" }', {
    start: '2026-08-18T00:00:00.000Z',
    end: '2026-08-18T00:00:01.000Z',
    includeStatus: false
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0][1], 'query')
  assert.equal(calls[0][2], '{ resource.service.name = "checkout" } | select(span:status)')
  assert.equal(calls.some((args) => args[1] === 'get'), false)
  assert.equal(result.rows[0].status, 'error')
})
