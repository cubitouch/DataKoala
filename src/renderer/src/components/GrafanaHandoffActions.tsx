import type { BuilderTimeRange } from '../lib/builderTimeRange'
import type { GrafanaSignal, GrafanaRange } from '@shared/grafanaExplore'
import { buildGrafanaExploreUrl, grafanaRange } from '@shared/grafanaExplore'
import type { DataSourceProfile } from '@shared/types'
import { copyTextToClipboard } from '../lib/clipboardText'
import { api } from '../lib/api'

type ObservabilityProfile = Extract<DataSourceProfile, { kind: GrafanaSignal }>

export function grafanaUrlFor(profile: ObservabilityProfile | undefined, query: string, range: BuilderTimeRange | GrafanaRange): string | null {
  if (!profile?.grafana?.baseUrl || !query.trim()) return null
  const datasourceUid = profile.grafana.datasourceUid || profile.transport.datasourceUid
  const datasourceType = profile.grafana.datasourceType
  if (!datasourceUid || !datasourceType) return null
  try {
    const converted = 'from' in range ? range : grafanaRange(range)
    return buildGrafanaExploreUrl({ ...profile.grafana, datasourceUid, datasourceType, signal: profile.kind, query, range: converted })
  } catch { return null }
}

export function GrafanaHandoffActions({ profile, query, range }: { profile?: ObservabilityProfile; query: string; range: BuilderTimeRange | GrafanaRange }) {
  const url = grafanaUrlFor(profile, query, range)
  const hint = url ? 'Open this query and time range in Grafana Explore' : 'Configure the Grafana URL and datasource mapping in this connection'
  return <>
    <button type="button" className="btn ghost" disabled={!url} title={hint} onClick={() => { if (url) void api.external.openUrl(url) }}>Open in Grafana ↗</button>
    <button type="button" className="btn ghost" disabled={!url} title={url ? 'Copy Grafana Explore link' : hint} onClick={() => { if (url) void copyTextToClipboard(url) }}>Copy Grafana link</button>
  </>
}
