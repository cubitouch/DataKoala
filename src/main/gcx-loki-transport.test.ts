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
  assert.deepEqual(result.logRows[0].parsedFields, { order_id: 42, span_id: 'span-1' })
  assert.equal(result.logRows[0].timestampNs, '1750000000000000000')
  assert.equal(result.logRows[0].timestampMs, 1_750_000_000_000)
  assert.equal(result.logRows[0].severity, 'warn')
  assert.equal(result.logRows[0].traceId, 'abc')
  assert.equal(result.logRows[0].spanId, 'span-1')
})

function normalizedLog(line: string, options: { parsed?: Record<string, unknown>; structuredMetadata?: Record<string, unknown>; entry?: Record<string, unknown> } = {}) {
  const result = normalizeLokiQuery({ status: 'success', data: { resultType: 'streams', result: [{ stream: { app: 'checkout' }, values: [{ timestamp: '1750000000000000000', line, ...options.entry, parsed: options.parsed, structuredMetadata: options.structuredMetadata }] }] } }, { limit: 10 })
  assert.equal(result.resultKind, 'logs')
  if (result.resultKind !== 'logs') throw new Error('Expected logs')
  return result.logRows[0]
}

test('extracts snake, camel, dotted, and nested identifiers from raw JSON into parsed fields', () => {
  const snake = normalizedLog('{"trace_id":"trace-snake","spanId":"span-camel"}')
  assert.equal(snake.traceId, 'trace-snake')
  assert.equal(snake.spanId, 'span-camel')
  assert.deepEqual(snake.parsedFields, { trace_id: 'trace-snake', span_id: 'span-camel' })
  const nested = normalizedLog('{"trace":{"id":"trace-nested"},"span":{"id":"span-nested"}}')
  assert.equal(nested.traceId, 'trace-nested')
  assert.equal(nested.spanId, 'span-nested')
  assert.deepEqual(nested.parsedFields, { trace_id: 'trace-nested', span_id: 'span-nested' })
  const dotted = normalizedLog('{"trace.id":"trace-dotted","span_id":"span-snake"}')
  assert.deepEqual(dotted.parsedFields, { trace_id: 'trace-dotted', span_id: 'span-snake' })
  const deeplyNested = normalizedLog('{"context":{"observability":{"traceId":"trace-context","span.id":"span-context"}}}')
  assert.deepEqual(deeplyNested.parsedFields, { trace_id: 'trace-context', span_id: 'span-context' })
})

test('extracts identifiers from logfmt without changing the raw log', () => {
  const line = 'level=error msg="provider timeout" traceId=trace-camel span.id="span-dotted"'
  const row = normalizedLog(line)
  assert.equal(row.line, line)
  assert.equal(row.traceId, 'trace-camel')
  assert.equal(row.spanId, 'span-dotted')
  assert.deepEqual(row.parsedFields, { trace_id: 'trace-camel', span_id: 'span-dotted' })
})

test('authoritative parsed, metadata, and row identifiers take precedence over raw content', () => {
  const row = normalizedLog('{"trace_id":"raw-trace","span_id":"raw-span"}', {
    parsed: { traceId: 'parsed-trace' }, structuredMetadata: { span_id: 'metadata-span' }, entry: { traceId: 'row-trace', spanId: 'row-span' }
  })
  assert.equal(row.traceId, 'parsed-trace')
  assert.equal(row.spanId, 'metadata-span')
  assert.deepEqual(row.parsedFields, { traceId: 'parsed-trace' })
  assert.deepEqual(row.structuredMetadata, { span_id: 'metadata-span' })
  const rowProperties = normalizedLog('{"trace_id":"raw-trace","span_id":"raw-span"}', { entry: { traceId: 'row-trace', spanId: 'row-span' } })
  assert.equal(rowProperties.traceId, 'row-trace')
  assert.equal(rowProperties.spanId, 'row-span')
  assert.deepEqual(rowProperties.parsedFields, {})
})

test('missing and malformed raw identifiers are ignored safely', () => {
  for (const line of ['plain log without identifiers', '{"trace_id":', 'trace_id="unterminated span_id=']) {
    const row = normalizedLog(line)
    assert.equal(row.traceId, undefined)
    assert.equal(row.spanId, undefined)
    assert.deepEqual(row.parsedFields, {})
  }
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
