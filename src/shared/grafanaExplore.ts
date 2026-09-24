export type GrafanaSignal = 'prometheus' | 'loki' | 'tempo'
export interface GrafanaRange { from: string; to: string }
export interface ResolveGrafanaHandoffRequest { context?: string; datasourceUid?: string; signal: GrafanaSignal }
export interface ResolvedGrafanaHandoff { baseUrl: string; orgId?: number; datasourceUid: string; datasourceType: string }
export type GrafanaTimeRange =
  | { kind: 'all' }
  | { kind: 'rolling'; amount: number; unit: 'minute' | 'hour' | 'day' | 'month' }
  | { kind: 'custom'; startDate: string | null; startTime: string; endDate: string | null; endTime: string }

export function normalizeGrafanaBaseUrl(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a valid Grafana URL.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Grafana URL must use http or https.')
  if (url.username || url.password) throw new Error('Grafana URL must not contain credentials.')
  url.search = ''; url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export function grafanaRange(range: GrafanaTimeRange): GrafanaRange {
  if (range.kind === 'all') return { from: '0', to: 'now' }
  if (range.kind === 'rolling') {
    if (range.unit === 'month') return { from: `now-${range.amount * 30}d`, to: 'now' }
    const suffix = { minute: 'm', hour: 'h', day: 'd', month: 'M' }[range.unit]
    return { from: `now-${range.amount}${suffix}`, to: 'now' }
  }
  if (!range.startDate || !range.endDate) throw new Error('Complete the custom time range before opening Grafana.')
  const from = Date.parse(`${range.startDate}T${range.startTime}:00Z`)
  const to = Date.parse(`${range.endDate}T${range.endTime}:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Enter a valid Grafana time range.')
  return { from: String(from), to: String(to) }
}

function signalQuery(signal: GrafanaSignal, query: string, uid: string, type: string): Record<string, unknown> {
  const datasource = { uid, type }
  if (signal === 'prometheus') return { refId: 'A', datasource, expr: query }
  if (signal === 'loki') return { refId: 'A', datasource, expr: query, queryType: 'range' }
  return { refId: 'A', datasource, query, queryType: 'traceql' }
}

export function buildGrafanaExploreUrl(input: { baseUrl: string; orgId?: number; datasourceUid: string; datasourceType: string; signal: GrafanaSignal; query: string; range: GrafanaRange }): string {
  const base = normalizeGrafanaBaseUrl(input.baseUrl)
  if (!input.datasourceUid.trim() || !input.datasourceType.trim()) throw new Error('A Grafana datasource mapping is required.')
  const url = new URL(`${base.replace(/\/$/, '')}/explore`)
  const pane = { datasource: input.datasourceUid, queries: [signalQuery(input.signal, input.query, input.datasourceUid, input.datasourceType)], range: input.range }
  url.searchParams.set('panes', JSON.stringify({ datakoala: pane }))
  url.searchParams.set('schemaVersion', '1')
  url.searchParams.set('orgId', String(input.orgId ?? 1))
  return url.toString()
}
