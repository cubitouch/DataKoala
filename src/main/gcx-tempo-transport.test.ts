import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxTempoTransport, normalizeTempoLabelValues, normalizeTempoSearch, normalizeTempoServices, normalizeTempoTrace, type TempoTransport } from './gcx-tempo-transport.ts'
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
    matchedSpans: 2,
    status: 'unknown'
  })
  assert.equal(result.execution?.provider, 'tempo')
  assert.match(result.notice ?? '', /last 1h/)
})

test('Tempo ranged search uses from/to and enriches trace success/error status', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    if (args[1] === 'query') {
      return { stdout: JSON.stringify({ traces: [{ traceID: traceId, rootServiceName: 'checkout', rootTraceName: 'POST /checkout', durationMs: 700 }] }), stderr: '' }
    }
    return {
      stdout: JSON.stringify({ spans: [{
        traceId,
        spanId: 'aaaaaaaaaaaaaaaa',
        serviceName: 'checkout',
        name: 'POST /checkout',
        startTimeMs: 1000,
        durationMs: 700,
        status: { code: 2 }
      }] }),
      stderr: ''
    }
  }
  const result = await new GcxTempoTransport('production', run).search('{ duration > 500ms }', {
    start: '2026-08-18T00:00:00.000Z',
    end: '2026-08-19T00:00:00.000Z',
    includeStatus: true
  })
  assert.deepEqual(calls[0], [
    'traces', 'query', '{ duration > 500ms }', '--context', 'production',
    '--from', '2026-08-18T00:00:00.000Z', '--to', '2026-08-19T00:00:00.000Z', '--limit', '20', '-o', 'json'
  ])
  assert.deepEqual(calls[1], ['traces', 'get', traceId, '--context', 'production', '-o', 'json'])
  assert.equal(result.rows[0].status, 'error')
  assert.match(result.notice ?? '', /2026-08-18T00:00:00Z/)
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
  assert.equal(search.rows[0].status, 'unknown')

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

test('Tempo label-value normalizer accepts standard and LLM-friendly gcx JSON', () => {
  assert.deepEqual(normalizeTempoLabelValues({ tagValues: [{ type: 'string', value: 'checkout' }, { type: 'string', value: 'worker' }] }), ['checkout', 'worker'])
  assert.deepEqual(normalizeTempoLabelValues({ tagValues: { string: ['worker', 'checkout'] } }), ['checkout', 'worker'])
})

test('Tempo service discovery uses label values and keeps gcx context and datasource selection', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    const labelIndex = args.indexOf('--label')
    if (labelIndex < 0) return { stdout: JSON.stringify({ scopes: [] }), stderr: '' }
    const label = args[labelIndex + 1]
    const queryIndex = args.indexOf('--query')
    const query = queryIndex >= 0 ? args[queryIndex + 1] : ''
    if (label === 'resource.service.namespace') {
      return { stdout: JSON.stringify({ tagValues: [{ type: 'string', value: 'commerce' }] }), stderr: '' }
    }
    if (query.includes('commerce')) {
      return { stdout: JSON.stringify({ tagValues: [{ type: 'string', value: 'checkout-api' }] }), stderr: '' }
    }
    return { stdout: JSON.stringify({ tagValues: [{ type: 'string', value: 'checkout-api' }, { type: 'string', value: 'legacy-worker' }] }), stderr: '' }
  }
  const transport = new GcxTempoTransport('production', run, 'tempo-uid')
  await transport.probe()
  assert.deepEqual(await transport.services(), [
    { name: 'legacy-worker' },
    { name: 'checkout-api', namespace: 'commerce' }
  ])
  assert.deepEqual(calls, [
    ['traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid', '-o', 'json'],
    ['traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid', '--label', 'resource.service.name', '-o', 'json'],
    ['traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid', '--label', 'resource.service.namespace', '-o', 'json'],
    ['traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid', '--label', 'resource.service.name', '--query', '{ resource.service.namespace = "commerce" }', '-o', 'json']
  ])
})

test('Tempo transport rejects empty queries and malformed responses', async () => {
  const transport: TempoTransport = new GcxTempoTransport(undefined, async () => ({ stdout: 'not-json', stderr: '' }))
  await assert.rejects(() => transport.query(''), /TraceQL query or trace ID/)
  await assert.rejects(() => transport.query('{ true }'), /malformed JSON/)
  await assert.rejects(() => transport.probe(), /malformed JSON/)
  assert.throws(() => normalizeTempoTrace({ batches: [] }), /could not find any spans/)
})

test('Tempo attribute discovery requests the generic span attribute and normalizes values', async () => {
  const calls: string[][] = []
  const transport = new GcxTempoTransport('production', async (args) => {
    calls.push(args)
    return { stdout: JSON.stringify({ tagValues: [{ type: 'string', value: 'rabbitmq' }, { type: 'string', value: 'kafka' }, { type: 'string', value: 'kafka' }] }), stderr: '' }
  }, 'tempo-uid')
  assert.deepEqual(await transport.attributeValues('span.messaging.system', '{ resource.service.name = "worker" }'), ['kafka', 'rabbitmq'])
  assert.deepEqual(calls, [[
    'traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid',
    '--label', 'span.messaging.system', '--query', '{ resource.service.name = "worker" }', '-o', 'json'
  ]])
})

test('Tempo attribute-name discovery normalizes supported scopes without a label argument', async () => {
  const calls: string[][] = []
  const transport = new GcxTempoTransport('production', async (args) => {
    calls.push(args)
    return { stdout: JSON.stringify({ scopes: { resource: { tags: ['cloud.region', 'cloud.region'] }, span: { tags: [{ name: 'http.route' }] }, event: { tags: ['ignored'] } } }), stderr: '' }
  }, 'tempo-uid')
  assert.deepEqual(await transport.attributeNames('{ true }'), [
    { scope: 'resource', name: 'cloud.region', traceql: 'resource.cloud.region' },
    { scope: 'span', name: 'http.route', traceql: 'span.http.route' }
  ])
  assert.deepEqual(calls[0], ['traces', 'labels', '--context', 'production', '--datasource', 'tempo-uid', '--query', '{ true }', '-o', 'json'])
  assert.equal(calls[0].includes('--label'), false)
})

test('Tempo attribute discovery reports useful gcx errors', async () => {
  const transport = new GcxTempoTransport(undefined, async () => { throw Object.assign(new Error('exit 1'), { stderr: 'status 403 forbidden' }) })
  await assert.rejects(() => transport.attributeValues('span.messaging.system'), /Trace access is not permitted/)
})
