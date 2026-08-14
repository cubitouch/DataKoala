import assert from 'node:assert/strict'
import test from 'node:test'
import { DirectPrometheusTransport, GrafanaPrometheusTransport, listGrafanaPrometheusDatasources } from './prometheus-transport.ts'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('direct transport maps paths, params, and bearer authentication', async () => {
  let request: { url: string; authorization?: string } | undefined
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    request = { url: String(input), authorization: (init?.headers as Record<string, string>)?.Authorization }
    return response({ status: 'success', data: ['up', 'http_requests_total'] })
  }
  const transport = new DirectPrometheusTransport({ kind: 'direct', url: 'https://prom.example/', auth: { kind: 'bearer', token: 'secret' } }, fakeFetch as typeof fetch)
  const result = await transport.request<string[]>('/api/v1/label/__name__/values', new URLSearchParams({ limit: '2' }))
  assert.deepEqual(result, ['up', 'http_requests_total'])
  assert.equal(request?.url, 'https://prom.example/api/v1/label/__name__/values?limit=2')
  assert.equal(request?.authorization, 'Bearer secret')
})

test('Grafana transport maps Prometheus paths through a UID proxy', async () => {
  let url = ''
  const fakeFetch = async (input: string | URL | Request) => { url = String(input); return response({ status: 'success', data: [] }) }
  const transport = new GrafanaPrometheusTransport({ kind: 'grafana', url: 'https://grafana.example', token: 'service-token', datasourceUid: 'prod/prom' }, fakeFetch as typeof fetch)
  await transport.request('/api/v1/metadata')
  assert.equal(url, 'https://grafana.example/api/datasources/proxy/uid/prod%2Fprom/api/v1/metadata')
})

test('Grafana discovery returns only Prometheus-compatible datasources', async () => {
  const fakeFetch = async () => response([
    { uid: 'prom', name: 'Production Prometheus', type: 'prometheus' },
    { uid: 'loki', name: 'Logs', type: 'loki' }
  ])
  assert.deepEqual(await listGrafanaPrometheusDatasources('https://grafana.example/', 'token', fakeFetch as typeof fetch), [
    { uid: 'prom', name: 'Production Prometheus', type: 'prometheus' }
  ])
})

test('transport exposes Prometheus API errors without leaking response credentials', async () => {
  const fakeFetch = async () => response({ status: 'error', errorType: 'bad_data', error: 'invalid label' })
  const transport = new DirectPrometheusTransport({ kind: 'direct', url: 'https://prom.example', auth: { kind: 'none' } }, fakeFetch as typeof fetch)
  await assert.rejects(() => transport.request('/api/v1/labels'), /invalid label/)
})
