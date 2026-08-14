import assert from 'node:assert/strict'
import test from 'node:test'
import { GcxPrometheusTransport, normalizeGcxFormattedQuery } from './gcx-prometheus-transport.ts'

test('format query GETs encoded PromQL through the safely encoded Grafana datasource proxy path', async () => {
  let args: string[] = []
  const transport = new GcxPrometheusTransport('production', async (value) => {
    args = value
    return { stdout: JSON.stringify({ status: 'success', data: 'sum by (status) (\n  rate(requests_total[5m])\n)' }), stderr: '' }
  }, 'prom uid/primary')
  const formatted = await transport.formatQuery('sum by(status)(rate(requests_total{service="api & web"}[5m]))')
  assert.equal(formatted, 'sum by (status) (\n  rate(requests_total[5m])\n)')
  const url = new URL(args[1], 'https://grafana.invalid')
  assert.equal(url.pathname, '/api/datasources/proxy/uid/prom%20uid%2Fprimary/api/v1/format_query')
  assert.equal(url.searchParams.get('query'), 'sum by(status)(rate(requests_total{service="api & web"}[5m]))')
  assert.deepEqual(args.slice(2), ['--context', 'production', '-o', 'json'])
  assert.equal(args.includes('-d'), false)
})

test('format query handles Prometheus errors, malformed JSON, and non-zero gcx exits safely', async () => {
  assert.throws(() => normalizeGcxFormattedQuery({ status: 'error', errorType: 'bad_data', error: 'parse error' }), /bad_data: parse error/)
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: '{bad', stderr: '' }), 'uid').formatQuery('up'), /malformed JSON/)
  const failure = Object.assign(new Error('exit 1'), { code: 1, stderr: 'HTTP 405 Method Not Allowed; token=supersecret; Authorization: Bearer oauth-value; Cookie: session=private' })
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => { throw failure }, 'uid').formatQuery('up'), (error: Error) => error.message.includes('exit code 1') && error.message.includes('HTTP 405') && !/supersecret|oauth-value|private/.test(error.message))
})

test('format query rejects invalid success responses and missing datasource selection', async () => {
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: '{"status":"success","data":{}}', stderr: '' }), 'uid').formatQuery('up'), /string data/)
  await assert.rejects(() => new GcxPrometheusTransport(undefined, async () => ({ stdout: '', stderr: '' })).formatQuery('up'), /Select a Grafana Prometheus datasource/)
})
