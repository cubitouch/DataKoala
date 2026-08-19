import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxTempoTransport, normalizeTempoSearch, normalizeTempoServices, normalizeTempoTrace, type TempoTransport } from './gcx-tempo-transport.ts'
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
  assert.equal(result.execution?.provider, 'tempo')
  assert.match(result.notice ?? '', /last 1h/)
})

test('Tempo trace IDs use gcx traces get and preserve OpenTelemetry inspection data', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return {
      stdout: JSON.stringify({ batches: [{
        resource: { attributes: [
          { key: 'service.name', value: { stringValue: 'checkout' } },
          { key: 'service.namespace', value: { stringValue: 'commerce' } },
          { key: 'deployment.environment.name', value: { stringValue: 'production' } }
        ] },
        scopeSpans: [{ scope: { name: 'checkout-http' }, spans: [
          {
            traceId,
            spanId: 'aaaaaaaaaaaaaaaa',
            name: 'POST /checkout',
            kind: 2,
            startTimeUnixNano: '1723629600000000000',
            endTimeUnixNano: '1723629600200000000',
            attributes: [{ key: 'http.request.method', value: { stringValue: 'POST' } }],
            events: [{ name: 'validated', timeUnixNano: '1723629600050000000', attributes: [{ key: 'cart.items', value: { intValue: '3' } }] }],
            links: [{ traceId: 'fedcba9876543210fedcba9876543210', spanId: 'cccccccccccccccc', attributes: [{ key: 'messaging.operation.type', value: { stringValue: 'publish' } }] }],
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
            status: { code: 2, message: 'payment timed out' }
          }
        ] }]
      }] }),
      stderr: ''
    }
  }
  const result = await new GcxTempoTransport('production', run).query(traceId)
  assert.deepEqual(calls, [['traces', 'get', traceId, '--context', 'production', '-o', 'json']])
  assert.equal(result.rowCount, 2)
  assert.equal(result.execution?.provider, 'tempo')
  assert.equal(result.rows[0].service, 'checkout')
  assert.equal(result.rows[0].serviceNamespace, 'commerce')
  assert.equal(result.rows[0].durationMs, 200)
  assert.equal(result.rows[0].kind, 'SERVER')
  assert.equal(result.rows[0].scopeName, 'checkout-http')
  assert.equal(result.rows[1].parentSpanId, 'aaaaaaaaaaaaaaaa')
  assert.equal(result.rows[1].status, 'ERROR')
  assert.equal(result.rows[1].statusMessage, 'payment timed out')
  assert.deepEqual(JSON.parse(String(result.rows[0].attributes)), { 'http.request.method': 'POST' })
  assert.equal(JSON.parse(String(result.rows[0].resourceAttributes))['deployment.environment.name'], 'production')
  assert.equal(JSON.parse(String(result.rows[0].events))[0].name, 'validated')
  assert.equal(JSON.parse(String(result.rows[0].links))[0].spanId, 'cccccccccccccccc')
})

test('Tempo normalizers accept wrapped search and Jaeger-style trace responses', () => {
  const search = normalizeTempoSearch({ data: { traces: [{ traceId, rootService: 'worker', rootOperation: 'consume', durationNanos: '500000000' }] } })
  assert.equal(search.rows[0].durationMs, 500)

  const trace = normalizeTempoTrace({ data: [{
    traceID: traceId,
    processes: { p1: { serviceName: 'worker', tags: [{ key: 'service.namespace', value: 'async' }] } },
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
  assert.equal(trace.rows[0].serviceNamespace, 'async')
  assert.equal(trace.rows[0].startTimeMs, 1000)
  assert.equal(trace.rows[0].durationMs, 250)
  assert.equal(trace.rows[0].status, 'ERROR')
})

test('Tempo service discovery groups service names by OpenTelemetry namespace', () => {
  const services = normalizeTempoServices({ traces: [
    { rootServiceName: 'checkout-api', rootServiceNamespace: 'commerce' },
    { rootServiceName: 'legacy-worker' },
    { spanSets: [{ spans: [{ serviceName: 'payment-service', resourceAttributes: { 'service.namespace': 'commerce' } }] }] }
  ] })
  assert.deepEqual(services, [
    { name: 'legacy-worker' },
    { name: 'checkout-api', namespace: 'commerce' },
    { name: 'payment-service', namespace: 'commerce' }
  ])
})

test('Tempo probe and service discovery keep gcx context and datasource selection', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[1] === 'labels') return { stdout: JSON.stringify({ labels: ['service.name'] }), stderr: '' }
    return { stdout: JSON.stringify({ traces: [{ rootServiceName: 'checkout-api' }] }), stderr: '' }
  }
  const transport = new GcxTempoTransport('production', run, 'tempo-uid')
  await transport.probe()
  assert.deepEqual(await transport.services(), [{ name: 'checkout-api' }])
  assert.deepEqual(calls, [
    ['traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid', '-o', 'json'],
    ['traces', 'query', '{}', '--context', 'production', '--datasource', 'tempo-uid', '--since', '1h', '--limit', '100', '-o', 'json']
  ])
})

test('Tempo transport rejects empty queries and malformed responses', async () => {
  const transport: TempoTransport = new GcxTempoTransport(undefined, async () => ({ stdout: 'not-json', stderr: '' }))
  await assert.rejects(() => transport.query(''), /TraceQL query or trace ID/)
  await assert.rejects(() => transport.query('{ true }'), /malformed JSON/)
  await assert.rejects(() => transport.probe(), /malformed JSON/)
  assert.throws(() => normalizeTempoTrace({ batches: [] }), /could not find any spans/)
})
