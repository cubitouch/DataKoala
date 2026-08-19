import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxTempoTransport, normalizeTempoSearch, normalizeTempoTrace, type TempoTransport } from './gcx-tempo-transport.ts'
import type { GcxCommandRunner } from './gcx-prometheus-transport.ts'

const traceId = '0123456789abcdef0123456789abcdef'

test('Tempo search uses TraceQL through gcx and normalizes trace summaries', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return {
      stdout: JSON.stringify({ traces: [{
        traceID: traceId,
        rootServiceName: 'checkout',
        rootTraceName: 'POST /checkout',
        startTimeUnixNano: '1723629600000000000',
        durationMs: 1480,
        spanSets: [{ spans: [{ spanID: 'a' }, { spanID: 'b' }] }]
      }] }),
      stderr: ''
    }
  }
  const result = await new GcxTempoTransport('production', run).query('{ duration > 1s }')
  assert.deepEqual(calls, [[
    'traces', 'query', '{ duration > 1s }', '--context', 'production', '--since', '1h', '--limit', '20', '-o', 'json'
  ]])
  assert.equal(result.rowCount, 1)
  assert.deepEqual(result.rows[0], {
    traceId,
    rootService: 'checkout',
    rootOperation: 'POST /checkout',
    startTimeMs: 1723629600000,
    durationMs: 1480,
    matchedSpans: 2
  })
  assert.match(result.notice ?? '', /last 1h/)
})

test('Tempo trace IDs use gcx traces get and normalize OTLP spans', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return {
      stdout: JSON.stringify({ batches: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
        scopeSpans: [{ spans: [
          {
            traceId,
            spanId: 'aaaaaaaaaaaaaaaa',
            name: 'POST /checkout',
            kind: 2,
            startTimeUnixNano: '1723629600000000000',
            endTimeUnixNano: '1723629600200000000',
            attributes: [{ key: 'http.request.method', value: { stringValue: 'POST' } }],
            status: { code: 1 }
          },
          {
            traceId,
            spanId: 'bbbbbbbbbbbbbbbb',
            parentSpanId: 'aaaaaaaaaaaaaaaa',
            name: 'charge card',
            kind: 3,
            startTimeUnixNano: '1723629600050000000',
            endTimeUnixNano: '1723629600190000000',
            status: { code: 2 }
          }
        ] }]
      }] }),
      stderr: ''
    }
  }
  const result = await new GcxTempoTransport('production', run).query(traceId)
  assert.deepEqual(calls, [['traces', 'get', traceId, '--context', 'production', '-o', 'json']])
  assert.equal(result.rowCount, 2)
  assert.equal(result.rows[0].service, 'checkout')
  assert.equal(result.rows[0].durationMs, 200)
  assert.equal(result.rows[0].kind, 'SERVER')
  assert.equal(result.rows[1].parentSpanId, 'aaaaaaaaaaaaaaaa')
  assert.equal(result.rows[1].status, 'ERROR')
  assert.deepEqual(JSON.parse(String(result.rows[0].attributes)), { 'http.request.method': 'POST' })
})

test('Tempo normalizers accept wrapped search and Jaeger-style trace responses', () => {
  const search = normalizeTempoSearch({ data: { traces: [{ traceId, rootService: 'worker', rootOperation: 'consume', durationNanos: '500000000' }] } })
  assert.equal(search.rows[0].durationMs, 500)

  const trace = normalizeTempoTrace({ data: [{
    traceID: traceId,
    processes: { p1: { serviceName: 'worker' } },
    spans: [{
      traceID: traceId,
      spanID: 'aaaaaaaaaaaaaaaa',
      processID: 'p1',
      operationName: 'consume',
      startTime: 1_000_000,
      duration: 250_000,
      tags: [{ key: 'error', value: true }, { key: 'span.kind', value: 'consumer' }]
    }]
  }] })
  assert.equal(trace.rows[0].service, 'worker')
  assert.equal(trace.rows[0].startTimeMs, 1000)
  assert.equal(trace.rows[0].durationMs, 250)
  assert.equal(trace.rows[0].status, 'ERROR')
})

test('Tempo transport rejects empty queries and malformed responses', async () => {
  const transport: TempoTransport = new GcxTempoTransport(undefined, async () => ({ stdout: 'not-json', stderr: '' }))
  await assert.rejects(() => transport.query(''), /TraceQL query or trace ID/)
  await assert.rejects(() => transport.query('{ true }'), /malformed JSON/)
  assert.throws(() => normalizeTempoTrace({ batches: [] }), /could not find any spans/)
})
