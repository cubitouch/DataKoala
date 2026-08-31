import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { boundedProviderDiagnostic, GcxPrometheusTransport, normalizeGcxDatasources, normalizeGcxLabels, normalizeGcxMetadata, normalizeGcxQuery, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
import { migrateStoredProfile } from './profile-migration.ts'

const metadataFixture = readFileSync(fileURLToPath(new URL('./fixtures/gcx-metrics-metadata.json', import.meta.url)), 'utf8')

test('gcx succeeds with structured JSON and normalizes metadata without credentials', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return args[0] === 'version'
      ? { stdout: '{"version":"1.2.3"}', stderr: '' }
      : { stdout: metadataFixture, stderr: '' }
  }
  const transport = new GcxPrometheusTransport(undefined, run)
  const version = await transport.version()
  const metadata = await transport.metadata()
  assert.deepEqual(calls, [['version', '-o', 'json'], ['metrics', 'metadata', '-o', 'json']])
  assert.deepEqual(metadata, [
    { name: 'go_gc_duration_seconds', type: 'histogram', help: 'A summary of the pause duration of garbage collection cycles.', unit: 'seconds' },
    { name: 'http_requests_total', type: 'counter', help: 'Total number of HTTP requests.', unit: 'requests' },
    { name: 'process_resident_memory_bytes', type: 'gauge', help: 'Resident memory size in bytes.', unit: 'bytes' }
  ])
  assert.equal(version, '1.2.3')
  assert.doesNotMatch(JSON.stringify({ version, metadata }), /token|oauth|credential|secret/i)
})

test('gcx executable missing has an actionable error', async () => {
  const run: GcxCommandRunner = async () => { const error = new Error('spawn gcx ENOENT') as NodeJS.ErrnoException; error.code = 'ENOENT'; throw error }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).version(), /gcx is not installed/)
})

test('gcx malformed JSON is rejected', async () => {
  const run: GcxCommandRunner = async () => ({ stdout: 'not-json', stderr: '' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).version(), /malformed JSON/)
})

test('metric-scoped label names and values use structured gcx labels operations', async () => {
  const calls: string[][] = []
  const run: GcxCommandRunner = async (args) => {
    calls.push(args)
    return { stdout: args[1].includes('/label/status/values') ? '{"status":"success","data":["success","failure","success"]}' : '{"status":"success","data":["status","very_specific_label_name","service","method","__name__"]}', stderr: '' }
  }
  const transport = new GcxPrometheusTransport('production', run, 'prom uid/one')
  assert.deepEqual(await transport.labelsForMetric('http_requests_total'), ['method', 'service', 'status', 'very_specific_label_name'])
  assert.deepEqual(await transport.labelValues('http_requests_total', 'status'), ['failure', 'success'])
  assert.deepEqual(calls, [
    ['api', '/api/datasources/proxy/uid/prom%20uid%2Fone/api/v1/labels?match%5B%5D=http_requests_total', '--context', 'production', '-o', 'json'],
    ['api', '/api/datasources/proxy/uid/prom%20uid%2Fone/api/v1/label/status/values?match%5B%5D=http_requests_total', '--context', 'production', '-o', 'json']
  ])
})

test('label discovery supports empty and high-cardinality responses', () => {
  assert.deepEqual(normalizeGcxLabels({ status: 'success', data: [] }), [])
  const values = Array.from({ length: 5_000 }, (_, index) => `value-${index}`)
  assert.equal(normalizeGcxLabels({ status: 'success', data: values }).length, 5_000)
})

test('label discovery rejects malformed gcx JSON and gcx errors', async () => {
  assert.throws(() => normalizeGcxLabels({ status: 'success', data: ['ok', 3] }), /string data array/)
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: '{bad', stderr: '' }), 'uid').labelsForMetric('up'), /malformed JSON/)
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => { throw Object.assign(new Error('exit 1'), { stderr: 'status 403 forbidden' }) }, 'uid').labelValues('up', 'job'), /Metrics access is not permitted/)
})

test('label cache reuses identical requests without crossing metrics', async () => {
  const calls: string[][] = []
  const transport = new GcxPrometheusTransport(undefined, async (args) => { calls.push(args); return { stdout: `{"status":"success","data":["${args[1].includes('metric_a') ? 'metric_a' : 'metric_b'}-label"]}`, stderr: '' } }, 'uid')
  assert.deepEqual(await Promise.all([transport.labelsForMetric('metric_a'), transport.labelsForMetric('metric_a')]), [['metric_a-label'], ['metric_a-label']])
  assert.deepEqual(await transport.labelsForMetric('metric_b'), ['metric_b-label'])
  assert.equal(calls.length, 2)
})

test('discovers only compatible Grafana datasources from structured JSON', async () => {
  const raw = [{ uid: 'loki', name: 'Logs', type: 'loki' }, { uid: 'prom', name: 'Metrics', type: 'prometheus' }, { uid: 'mimir', name: 'Cloud Mimir', type: 'grafana-mimir-datasource' }]
  assert.deepEqual(normalizeGcxDatasources(raw).map(({ uid }) => uid), ['mimir', 'prom'])
  let args: string[] = []
  const result = await new GcxPrometheusTransport('prod', async (value) => { args = value; return { stdout: JSON.stringify(raw), stderr: '' } }).datasources()
  assert.equal(result.length, 2)
  assert.deepEqual(args, ['api', '/api/datasources', '--context', 'prod', '-o', 'json'])
})

test('selected datasource UID scopes metadata and query commands', async () => {
  const calls: string[][] = []
  const transport = new GcxPrometheusTransport(undefined, async (args) => {
    calls.push(args)
    return args[1] === 'metadata' ? { stdout: '{"status":"success","data":{}}', stderr: '' } : { stdout: '{"status":"success","data":{"resultType":"vector","result":[]}}', stderr: '' }
  }, 'selected-uid')
  await transport.metadata()
  await transport.query({ expression: 'up', start: 'a', end: 'b', step: '30s' })
  assert.deepEqual(calls[0], ['metrics', 'metadata', '--datasource', 'selected-uid', '-o', 'json'])
  assert.deepEqual(calls[1], ['api', '/api/datasources/proxy/uid/selected-uid/api/v1/query_range?query=up&start=a&end=b&step=30s', '-o', 'json'])
})

test('gcx non-zero exits are normalized without exposing terminal output', async () => {
  const run: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'unexpected internal detail' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, run).version(), /^Error: gcx could not complete the Prometheus operation/)
})

test('gcx expired and unauthenticated failures have specific recovery guidance', async () => {
  const expired: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'access token expired' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, expired).metadata(), /authentication has expired.*gcx login/)
  const loggedOut: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'not authenticated' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, loggedOut).metadata(), /no authenticated context.*gcx login/)
})

test('gcx permission failures explain that metrics access is required', async () => {
  const forbidden: GcxCommandRunner = async () => { throw Object.assign(new Error('exit 1'), { stderr: 'request forbidden: status 403' }) }
  await assert.rejects(() => new GcxPrometheusTransport(undefined, forbidden).metadata(), /Metrics access is not permitted/)
})

test('metadata wrappers cannot be mistaken for a single metric', () => {
  const metadata = normalizeGcxMetadata(JSON.parse(metadataFixture))
  assert.equal(metadata.length, 3)
  assert.equal(metadata.some((entry) => ['data', 'metadata', 'metrics'].includes(entry.name)), false)
})

test('metadata rejects structurally unexpected wrappers and entries', () => {
  assert.throws(() => normalizeGcxMetadata({ data: { up: [{ type: 'gauge' }] } }), /status "success" and a data object/)
  assert.throws(() => normalizeGcxMetadata({ status: 'success', metadata: {} }), /status "success" and a data object/)
  assert.throws(() => normalizeGcxMetadata({ status: 'success', data: { up: { type: 'gauge' } } }), /unexpected metadata entry/)
  assert.throws(() => normalizeGcxMetadata({ status: 'success', data: { up: [{ type: 42 }] } }), /field "type" must be a string/)
})

test('persisted gcx profiles contain context configuration only', () => {
  const stored = { kind: 'prometheus', version: 1, id: 'p1', name: 'Cloud metrics', readonly: true, transport: { kind: 'gcx', context: 'production' } }
  const result = migrateStoredProfile(stored)
  if (result.status === 'unsupported') assert.fail('gcx profile was rejected')
  assert.equal(result.status, 'current')
  assert.equal(result.profile.kind, 'prometheus')
  if (result.profile.kind !== 'prometheus') assert.fail('wrong profile kind')
  assert.deepEqual(result.profile.transport, { kind: 'gcx', context: 'production' })
  assert.doesNotMatch(JSON.stringify(result), /token|password|oauth|credential|secret/i)
})

test('query maps datasource-neutral range bounds to gcx and normalizes a matrix', async () => {
  let args: string[] = []
  const raw = await readFile(new URL('./testdata/gcx-prometheus/multiple-series.json', import.meta.url), 'utf8')
  const transport = new GcxPrometheusTransport('production', async (value) => { args = value; return { stdout: raw, stderr: '' } })
  const result = await transport.query({ expression: 'up', start: '2026-08-14T10:00:00Z', end: '2026-08-14T10:15:00Z', step: '30s' })
  assert.deepEqual(args, ['metrics', 'query', 'up', '--context', 'production', '--from', '2026-08-14T10:00:00Z', '--to', '2026-08-14T10:15:00Z', '--step', '30s', '-o', 'json'])
  assert.equal(result.rowCount, 2)
  assert.deepEqual(result.rows, [
    { timestamp: '2024-08-14T08:00:00.000Z', value: 1, instance: 'a', service: 'api' },
    { timestamp: '2024-08-14T08:00:00.000Z', value: 2, instance: 'b', service: 'api' }
  ])
  assert.deepEqual(result.columns.map((column) => column.name), ['timestamp', 'value', 'instance', 'service'])
})

test('distinct requested resolutions reach gcx unchanged', async () => {
  const calls: string[][] = []
  const transport = new GcxPrometheusTransport(undefined, async (args) => { calls.push(args); return { stdout: '{"status":"success","data":{"resultType":"matrix","result":[]}}', stderr: '' } })
  for (const step of ['30s', '1m', '5m']) await transport.query({ expression: 'up', start: 'a', end: 'b', step })
  assert.deepEqual(calls.map((args) => args.slice(args.indexOf('--step'), args.indexOf('--step') + 2)), [['--step', '30s'], ['--step', '1m'], ['--step', '5m']])
})

test('selected datasource uses Prometheus query_range with its exact server-side step', async () => {
  const calls: string[][] = []
  const transport = new GcxPrometheusTransport(undefined, async (args) => { calls.push(args); return { stdout: '{"status":"success","data":{"resultType":"matrix","result":[]}}', stderr: '' } }, 'prom')
  for (const step of ['30s', '1m', '5m']) await transport.query({ expression: 'sum(up)', start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z', step })
  assert.deepEqual(calls.map((args) => new URL(`http://localhost${args[1]}`).searchParams.get('step')), ['30s', '1m', '5m'])
})

test('query_range preserves the server sample density produced for each resolution', async () => {
  const counts: Record<string, number> = { '30s': 121, '1m': 61, '5m': 13 }
  const transport = new GcxPrometheusTransport(undefined, async (args) => {
    const step = new URL(`http://localhost${args[1]}`).searchParams.get('step') ?? ''
    const values = Array.from({ length: counts[step] }, (_, index) => [1_700_000_000 + index, String(index)])
    return { stdout: JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { job: 'stable' }, values }] } }), stderr: '' }
  }, 'prom')
  const rowCounts = []
  for (const step of ['30s', '1m', '5m']) rowCounts.push((await transport.query({ expression: 'up', start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z', step })).rowCount)
  assert.deepEqual(rowCounts, [121, 61, 13])
})

test('normalizes range, vector, and empty gcx query fixtures', async () => {
  for (const [name, count] of [['one-series.json', 2], ['vector.json', 1], ['empty.json', 0]] as const) {
    const raw = JSON.parse(await readFile(new URL(`./testdata/gcx-prometheus/${name}`, import.meta.url), 'utf8'))
    const result = normalizeGcxQuery(raw)
    assert.equal(result.rowCount, count)
    if (count) assert.equal(typeof result.rows[0].value, 'number')
  }
})

test('preserves PromQL server errors and identifies malformed JSON', async () => {
  const server = await readFile(new URL('./testdata/gcx-prometheus/error.json', import.meta.url), 'utf8')
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: server, stderr: '' })).query({ expression: 'bad(', start: '2026-08-14T10:00:00Z', end: '2026-08-14T10:15:00Z', step: '30s' }), /bad_data:.*parse error/)
  const malformed = await readFile(new URL('./testdata/gcx-prometheus/malformed.json', import.meta.url), 'utf8')
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: malformed, stderr: '' })).query({ expression: 'up', start: 'a', end: 'b', step: '30s' }), /malformed JSON/)
})

test('non-zero gcx query exits retain actionable stderr without secrets', async () => {
  const failure = Object.assign(new Error('exit 1'), { stderr: 'bad_data: parse error near token; token=supersecret' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => { throw failure }).query({ expression: 'bad(', start: 'a', end: 'b', step: '30s' }), (error: Error) => error.message.includes('parse error') && !error.message.includes('supersecret'))
})

test('structured point-limit errors become concise actionable failures', () => {
  assert.throws(() => normalizeGcxQuery({ status: 'error', errorType: 'execution', error: 'exceeded maximum resolution of 11,000 points per timeseries' }), /Too many data points — use Auto/)
  assert.throws(() => normalizeGcxQuery({ status: 'error', errorType: 'bad_data', error: 'parse error at char 4' }), /bad_data: parse error/)
})

test('sample limits in non-zero gcx stderr become actionable without changing auth errors', async () => {
  const limited = Object.assign(new Error('exit 1'), { stderr: 'Mimir query rejected: maximum number of samples exceeded' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => { throw limited }).query({ expression: 'up', start: 'a', end: 'b', step: '30s' }), /^PrometheusOversizedQueryError: Too many data points — use Auto/)
  const forbidden = Object.assign(new Error('exit 1'), { stderr: 'status 403 forbidden' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => { throw forbidden }).query({ expression: 'up', start: 'a', end: 'b', step: '30s' }), /Metrics access is not permitted/)
})

test('provider diagnostics are sanitized and explicitly bounded', () => {
  const diagnostic = boundedProviderDiagnostic(`token=supersecret too many samples ${'x'.repeat(10_000)}`)
  assert.doesNotMatch(diagnostic, /supersecret/)
  assert.match(diagnostic, /… \[truncated\]$/)
  assert.ok(diagnostic.length < 2_100)
})
