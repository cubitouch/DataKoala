import { useEffect, useState } from 'react'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import type { GrafanaSignal, GrafanaRange, ResolvedGrafanaHandoff } from '@shared/grafanaExplore'
import { buildGrafanaExploreUrl, grafanaRange } from '@shared/grafanaExplore'
import type { DataSourceProfile } from '@shared/types'
import { copyTextToClipboard } from '../lib/clipboardText'
import { api } from '../lib/api'
import { Popover, PopoverChevron, usePopover } from './ui/Popover'
import styles from './GrafanaHandoffActions.module.css'

type ObservabilityProfile = Extract<DataSourceProfile, { kind: GrafanaSignal }>
type ResolutionState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; value: ResolvedGrafanaHandoff }
  | { status: 'error'; message: string }

export function grafanaUrlFor(
  profile: ObservabilityProfile | undefined,
  query: string,
  range: BuilderTimeRange | GrafanaRange,
  resolved?: ResolvedGrafanaHandoff
): string | null {
  if (!profile || !query.trim()) return null
  const baseUrl = profile.grafana?.baseUrl || resolved?.baseUrl
  const datasourceUid = profile.grafana?.datasourceUid || profile.transport.datasourceUid || resolved?.datasourceUid
  const datasourceType = profile.grafana?.datasourceType || resolved?.datasourceType
  if (!baseUrl || !datasourceUid || !datasourceType) return null
  try {
    const converted = 'from' in range ? range : grafanaRange(range)
    return buildGrafanaExploreUrl({
      baseUrl,
      orgId: profile.grafana?.orgId ?? resolved?.orgId,
      datasourceUid,
      datasourceType,
      signal: profile.kind,
      query,
      range: converted
    })
  } catch { return null }
}

export function GrafanaHandoffActions({ profile, query, range }: { profile?: ObservabilityProfile; query: string; range: BuilderTimeRange | GrafanaRange }) {
  const configuredUrl = grafanaUrlFor(profile, query, range)
  const needsResolution = Boolean(profile && query.trim() && !configuredUrl)
  const [resolution, setResolution] = useState<ResolutionState>({ status: 'idle' })

  useEffect(() => {
    if (!needsResolution || !profile) {
      setResolution({ status: 'idle' })
      return
    }
    let active = true
    setResolution({ status: 'loading' })
    api.connections.grafana.resolveHandoff({
      signal: profile.kind,
      context: profile.transport.context,
      datasourceUid: profile.grafana?.datasourceUid || profile.transport.datasourceUid
    }).then((value) => {
      if (active) setResolution({ status: 'ready', value })
    }).catch((error: unknown) => {
      if (active) setResolution({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return () => { active = false }
  }, [
    needsResolution,
    profile?.id,
    profile?.kind,
    profile?.transport.context,
    profile?.transport.datasourceUid,
    profile?.grafana?.baseUrl,
    profile?.grafana?.datasourceUid,
    profile?.grafana?.datasourceType,
    profile?.grafana?.orgId
  ])

  const url = configuredUrl ?? (resolution.status === 'ready' ? grafanaUrlFor(profile, query, range, resolution.value) : null)
  const hint = url
    ? 'Open this query and time range in Grafana Explore'
    : resolution.status === 'loading'
      ? 'Resolving the Grafana destination from gcx…'
      : resolution.status === 'error'
        ? `Grafana handoff unavailable: ${resolution.message}`
        : 'Grafana handoff is unavailable for this query'

  return <Popover ariaLabel="Grafana handoff" trigger={<><span>Grafana</span><PopoverChevron /></>} disabled={!url} popupType="menu" contentRole="menu" preferredWidth={190} triggerClassName={styles.trigger} triggerButtonProps={{ title: hint }}>
    {url && <GrafanaMenu url={url} />}
  </Popover>
}

function GrafanaMenu({ url }: { url: string }) {
  const popover = usePopover()
  return <div className={styles.menu}>
    <button type="button" role="menuitem" onClick={() => { popover?.close(); void api.external.openUrl(url) }}>Open in Grafana ↗</button>
    <button type="button" role="menuitem" onClick={() => { popover?.close(); void copyTextToClipboard(url) }}>Copy Grafana link</button>
  </div>
}
