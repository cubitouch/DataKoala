import type { GrafanaPrometheusDatasource } from '../shared/prometheus.ts'
import type { PrometheusTransportConfig } from '../shared/types.ts'

type Fetch = typeof globalThis.fetch
interface PrometheusEnvelope<T> { status: 'success' | 'error'; data?: T; error?: string; errorType?: string }

export interface PrometheusTransport {
  request<T>(path: string, params?: URLSearchParams): Promise<T>
}

function baseUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL must use HTTP or HTTPS.')
  return url.toString().replace(/\/$/, '')
}

abstract class HttpPrometheusTransport implements PrometheusTransport {
  protected readonly fetchImpl: Fetch
  constructor(fetchImpl: Fetch) { this.fetchImpl = fetchImpl }
  protected abstract url(path: string): string
  protected abstract headers(): Record<string, string>

  async request<T>(path: string, params?: URLSearchParams): Promise<T> {
    const url = new URL(this.url(path))
    params?.forEach((value, key) => url.searchParams.append(key, value))
    const response = await this.fetchImpl(url, { headers: this.headers(), signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Prometheus request failed (${response.status} ${response.statusText}).`)
    const body = await response.json() as PrometheusEnvelope<T>
    if (body.status !== 'success' || body.data === undefined) throw new Error(body.error || 'Prometheus returned an unsuccessful response.')
    return body.data
  }
}

export class DirectPrometheusTransport extends HttpPrometheusTransport {
  private readonly base: string
  constructor(config: Extract<PrometheusTransportConfig, { kind: 'direct' }>, fetchImpl: Fetch = fetch) {
    super(fetchImpl); this.base = baseUrl(config.url); this.auth = config.auth
  }
  private readonly auth: Extract<PrometheusTransportConfig, { kind: 'direct' }>['auth']
  protected url(path: string) { return `${this.base}${path}` }
  protected headers(): Record<string, string> {
    if (this.auth.kind === 'bearer') return { Authorization: `Bearer ${this.auth.token}` }
    if (this.auth.kind === 'basic') return { Authorization: `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64')}` }
    return {}
  }
}

export class GrafanaPrometheusTransport extends HttpPrometheusTransport {
  private readonly base: string
  private readonly config: Extract<PrometheusTransportConfig, { kind: 'grafana' }>
  constructor(config: Extract<PrometheusTransportConfig, { kind: 'grafana' }>, fetchImpl: Fetch = fetch) {
    super(fetchImpl); this.config = config; this.base = baseUrl(config.url)
  }
  protected url(path: string) { return `${this.base}/api/datasources/proxy/uid/${encodeURIComponent(this.config.datasourceUid)}${path}` }
  protected headers(): Record<string, string> { return { Authorization: `Bearer ${this.config.token}` } }
}

export function createPrometheusTransport(config: PrometheusTransportConfig, fetchImpl: Fetch = fetch): PrometheusTransport {
  return config.kind === 'direct' ? new DirectPrometheusTransport(config, fetchImpl) : new GrafanaPrometheusTransport(config, fetchImpl)
}

export async function listGrafanaPrometheusDatasources(url: string, token: string, fetchImpl: Fetch = fetch): Promise<GrafanaPrometheusDatasource[]> {
  const response = await fetchImpl(`${baseUrl(url)}/api/datasources`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Grafana request failed (${response.status} ${response.statusText}).`)
  const values = await response.json() as Array<Record<string, unknown>>
  if (!Array.isArray(values)) throw new Error('Grafana returned an invalid datasource list.')
  return values.filter((item) => ['prometheus', 'grafana-pyroscope-datasource'].includes(String(item.type)))
    .filter((item) => typeof item.uid === 'string' && typeof item.name === 'string')
    .map((item) => ({ uid: String(item.uid), name: String(item.name), type: String(item.type) }))
}
