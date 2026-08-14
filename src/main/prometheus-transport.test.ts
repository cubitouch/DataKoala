import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GcxPrometheusTransport, normalizeGcxLabels, normalizeGcxMetadata, normalizeGcxQuery, type GcxCommandRunner } from './gcx-prometheus-transport.ts'
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
    return { stdout: args.includes('--label') ? '{"status":"success","data":["success","failure","success"]}' : '{"status":"success","data":["status","service","method","__name__"]}', stderr: '' }
  }
  const transport = new GcxPrometheusTransport('production', run)
  assert.deepEqual(await transport.labelsForMetric('http_requests_total'), ['method', 'service', 'status'])
  assert.deepEqual(await transport.labelValues('http_requests_total', 'status'), ['failure', 'success'])
  assert.deepEqual(calls, [
    ['metrics', 'labels', '--context', 'production', '--metric', 'http_requests_total', '-o', 'json'],
    ['metrics', 'labels', '--context', 'production', '--metric', 'http_requests_total', '--label', 'status', '-o', 'json']
  ])
})

test('label discovery supports empty and high-cardinality responses', () => {
  assert.deepEqual(normalizeGcxLabels({ status: 'success', data: [] }), [])
  const values = Array.from({ length: 5_000 }, (_, index) => `value-${index}`)
  assert.equal(normalizeGcxLabels({ status: 'success', data: values }).length, 5_000)
})

test('label discovery rejects malformed gcx JSON and gcx errors', async () => {
  assert.throws(() => normalizeGcxLabels({ status: 'success', data: ['ok', 3] }), /string data array/)
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: '{bad', stderr: '' })).labelsForMetric('up'), /malformed JSON/)
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => { throw Object.assign(new Error('exit 1'), { stderr: 'status 403 forbidden' }) }).labelValues('up', 'job'), /Metrics access is not permitted/)
})

test('label cache reuses identical requests without crossing metrics', async () => {
  const calls: string[][] = []
  const transport = new GcxPrometheusTransport(undefined, async (args) => { calls.push(args); return { stdout: `{"status":"success","data":["${args[args.indexOf('--metric') + 1]}-label"]}`, stderr: '' } })
  assert.deepEqual(await Promise.all([transport.labelsForMetric('metric_a'), transport.labelsForMetric('metric_a')]), [['metric_a-label'], ['metric_a-label']])
  assert.deepEqual(await transport.labelsForMetric('metric_b'), ['metric_b-label'])
  assert.equal(calls.length, 2)
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
  assert.deepEqual(result.rows.map((row) => row.series), ['{instance="a",service="api"}', '{instance="b",service="api"}'])
  assert.deepEqual(result.columns.map((column) => column.name), ['timestamp', 'value', 'series', 'instance', 'service'])
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
