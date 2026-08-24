import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxLokiTransport, classifyLogql, normalizeLokiQuery } from './gcx-loki-transport.ts'

test('uses exact gcx argv without shell interpolation or unsupported direction', async () => {
  const calls: string[][] = []
  const transport = new GcxLokiTransport('prod context', async (args) => {
    calls.push(args)
    return { stdout: JSON.stringify({ status: 'success', data: { resultType: 'streams', result: [] } }), stderr: '' }
  }, 'loki/uid')
  await transport.query({ expression: '{app="checkout"} |= "$(touch /tmp/nope)"', start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z', step: '30s', limit: 50, direction: 'forward' })
  assert.deepEqual(calls[0], ['logs', 'query', '{app="checkout"} |= "$(touch /tmp/nope)"', '--context', 'prod context', '--datasource', 'loki/uid', '--from', '2026-01-01T00:00:00Z', '--to', '2026-01-01T01:00:00Z', '--step', '30s', '--limit', '51', '-o', 'json'])
  assert.equal(calls[0].includes('--direction'), false)
})

test('normalizes primary gcx object entries without mixing field namespaces', () => {
  const result = normalizeLokiQuery({ status: 'success', data: { resultType: 'streams', result: [{
    stream: { service: 'checkout', environment: 'prod' },
    values: [{ timestamp: '1750000000000000000', line: '{"message":"failed","span.id":"span-1"}', structuredMetadata: { trace_id: 'abc', level: 'WARN' }, parsed: { order_id: 42 } }]
  }] } }, { limit: 10 })
  assert.equal(result.resultKind, 'logs')
  if (result.resultKind !== 'logs') return
  assert.deepEqual(result.logRows[0].labels, { service: 'checkout', environment: 'prod' })
  assert.deepEqual(result.logRows[0].structuredMetadata, { trace_id: 'abc', level: 'WARN' })
  assert.deepEqual(result.logRows[0].parsedFields, { order_id: 42 })
  assert.equal(result.logRows[0].timestampNs, '1750000000000000000')
  assert.equal(result.logRows[0].timestampMs, 1_750_000_000_000)
  assert.equal(result.logRows[0].severity, 'warn')
  assert.equal(result.logRows[0].traceId, 'abc')
  assert.equal(result.logRows[0].spanId, 'span-1')
})

test('requests limit plus one and reports truncation', async () => {
  let argv: string[] = []
  const entries = [1, 2, 3].map((value) => ({ timestamp: `${1_750_000_000_000_000_000n + BigInt(value)}`, line: String(value) }))
  const transport = new GcxLokiTransport(undefined, async (args) => { argv = args; return { stdout: JSON.stringify({ status: 'success', data: { resultType: 'streams', result: [{ stream: { app: 'x' }, values: entries }] } }), stderr: '' } })
  const result = await transport.query({ expression: '{app="x"}', start: 'now-1h', end: 'now', step: '30s', limit: 2 })
  assert.equal(argv[argv.indexOf('--limit') + 1], '3')
  assert.equal(result.rowCount, 2)
  assert.equal(result.execution?.truncated, true)
})

test('routes metric LogQL through gcx logs metrics and Prometheus normalization', async () => {
  let argv: string[] = []
  const transport = new GcxLokiTransport(undefined, async (args) => { argv = args; return { stdout: JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { app: 'x' }, values: [[10, '2']] }] } }), stderr: '' } })
  const result = await transport.query({ expression: 'sum(count_over_time({app="x"}[1m]))', start: '0', end: '10', step: '1s', limit: 10 })
  assert.equal(classifyLogql('sum(count_over_time({app="x"}[1m]))'), 'metrics')
  assert.equal(argv[1], 'metrics')
  assert.equal(argv.includes('--limit'), false)
  assert.equal(result.resultKind, 'metrics')
  assert.equal(result.rows[0].value, 2)
})

test('probe uses datasource discovery and never sends millisecond metadata timestamps', async () => {
  const calls: string[][] = []
  const transport = new GcxLokiTransport(undefined, async (args) => { calls.push(args); return { stdout: JSON.stringify([{ uid: 'loki', name: 'Loki', type: 'loki' }]), stderr: '' } }, 'loki')
  await transport.probe()
  assert.deepEqual(calls, [['api', '/api/datasources', '-o', 'json']])
})

test('metric queries use the authenticated canonical Loki range proxy when a datasource UID is selected', async () => {
  let argv: string[] = []
  const transport = new GcxLokiTransport('prod', async (args) => { argv = args; return { stdout: JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { level: 'error' }, values: [[10, '2']] }] } }), stderr: '' } }, 'loki/uid')
  const result = await transport.query({ expression: 'sum by (level) (count_over_time(({service_name="checkout"})[30s]))', start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z', step: '30s', limit: 100 })
  assert.equal(argv[0], 'api')
  const url = new URL(argv[1], 'https://grafana.invalid')
  assert.equal(url.pathname, '/api/datasources/proxy/uid/loki%2Fuid/loki/api/v1/query_range')
  assert.equal(url.searchParams.get('query'), 'sum by (level) (count_over_time(({service_name="checkout"})[30s]))')
  assert.equal(url.searchParams.get('start'), '2026-01-01T00:00:00Z')
  assert.equal(url.searchParams.get('end'), '2026-01-01T01:00:00Z')
  assert.equal(url.searchParams.get('step'), '30s')
  assert.deepEqual(argv.slice(2), ['--context', 'prod', '-o', 'json'])
  assert.equal(result.rows[0].level, 'error')
})

test('explicit single-value matrix samples are normalized without weakening malformed-series validation', () => {
  const result = normalizeLokiQuery({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { level: 'warn' }, value: [10, '3'] }] } }, { limit: 10 }, 0, 'metrics')
  assert.equal(result.rows[0].value, 3)
  assert.throws(() => normalizeLokiQuery({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { level: 'warn' } }] } }, { limit: 10 }, 0, 'metrics'), /without values/)
})
