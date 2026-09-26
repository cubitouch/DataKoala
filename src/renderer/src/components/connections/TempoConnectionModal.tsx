import { useEffect, useRef, useState } from 'react'
import type { TempoProfile } from '@shared/types'
import type { TempoDatasourceOption } from '@shared/tempoDatasource'
import { normalizeGrafanaBaseUrl } from '@shared/grafanaExplore'
import { api } from '@lib/api'
import { Combobox } from '@components/ui/combobox'
import { TextInput } from '@components/ui/TextInput'
import { CollapsibleSection } from '@components/ui/CollapsibleSection'
import { ConnectionFormHeader } from './ConnectionFormHeader'
import type { ConnectionFormProps } from './connectionFormTypes'
import { failureMessage } from './connectionFormTypes'
import styles from './ConnectionModal.module.css'

export function TempoConnectionModal({ existing, onClose, onSaved, onBack, active = true }: ConnectionFormProps & { existing: TempoProfile | null }) {
  type DiscoveryState = 'idle' | 'discovering' | 'ready' | 'empty' | 'error'
  const savedUid = existing?.transport.datasourceUid ?? ''
  const [name, setName] = useState(existing?.name ?? 'Tempo')
  const [context, setContext] = useState(existing?.transport.context ?? '')
  const [datasources, setDatasources] = useState<TempoDatasourceOption[]>([])
  const [datasourceUid, setDatasourceUid] = useState(savedUid)
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('idle')
  const [datasourceMessage, setDatasourceMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [grafanaUrl, setGrafanaUrl] = useState(existing?.grafana?.baseUrl ?? '')
  const [orgId, setOrgId] = useState(String(existing?.grafana?.orgId ?? 1))
  const discoveryRevision = useRef(0)
  const discoveredContext = useRef<string | null>(null)

  const discover = async (nextContext = context.trim(), preserveSaved = false) => {
    const revision = ++discoveryRevision.current
    const contextChanged = discoveredContext.current !== null && discoveredContext.current !== nextContext
    discoveredContext.current = nextContext
    setDiscoveryState('discovering'); setDatasourceMessage(null); setMessage(null)
    if (contextChanged) setDatasourceUid('')
    try {
      const found = await api.connections.tempo.discoverDatasources({ kind: 'gcx', ...(nextContext ? { context: nextContext } : {}) })
      if (revision !== discoveryRevision.current) return
      setDatasources(found)
      const retainedUid = !contextChanged && preserveSaved && savedUid && found.some((item) => item.uid === savedUid) ? savedUid : ''
      const nextUid = retainedUid || (found.length === 1 ? found[0].uid : '')
      setDatasourceUid(nextUid)
      if (!contextChanged && preserveSaved && savedUid && !found.some((item) => item.uid === savedUid)) setDatasourceMessage('The saved Tempo datasource was not found in this gcx context. Choose a discovered datasource before enabling Grafana handoff.')
      else if (found.length === 0) setDatasourceMessage('No Tempo datasource was found in this gcx context. DataKoala trace queries remain available without Grafana handoff.')
      else if (found.length > 1 && !nextUid) setDatasourceMessage('Choose a Tempo datasource for Grafana handoff.')
      setDiscoveryState(found.length ? 'ready' : 'empty')
    } catch (caught) {
      if (revision !== discoveryRevision.current) return
      setDatasources([])
      if (contextChanged) setDatasourceUid('')
      setDiscoveryState('error'); setDatasourceMessage(`Datasource discovery failed. ${failureMessage(caught)}`)
    }
  }
  useEffect(() => { if (active) void discover(context.trim(), true); return () => { discoveryRevision.current += 1 } }, [active])
  const refreshForContext = () => { if (active && discoveredContext.current !== context.trim()) void discover(context.trim()) }
  const selected = datasources.find((item) => item.uid === datasourceUid)
  const makeProfile = (): TempoProfile => ({ kind: 'tempo', version: 1, id: existing?.id ?? '', name: name.trim(), readonly: true, transport: { kind: 'gcx', ...(context.trim() ? { context: context.trim() } : {}), ...(datasourceUid ? { datasourceUid } : {}) }, ...(grafanaUrl.trim() ? { grafana: { baseUrl: normalizeGrafanaBaseUrl(grafanaUrl), orgId: Number(orgId), datasourceType: selected?.type ?? existing?.grafana?.datasourceType } } : {}) })
  const validate = () => { if (!name.trim()) return 'Connection name is required.'; if (grafanaUrl.trim()) { try { normalizeGrafanaBaseUrl(grafanaUrl) } catch (error) { return failureMessage(error) }; if (!datasourceUid) return 'Select a Tempo datasource for Grafana handoff.'; if (!selected?.type && !existing?.grafana?.datasourceType) return 'Rediscover the Tempo datasource to configure Grafana handoff.'; if (!/^\d+$/.test(orgId) || Number(orgId) < 1) return 'Grafana org ID must be a positive integer.' } return null }
  const test = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); setMessage(null); try { const result = await api.connections.test(makeProfile()); setMessage(result.ok ? { ok: true, text: 'Connected — Tempo trace access verified through gcx.' } : { ok: false, text: result.error }) } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } finally { setBusy(false) } }
  const save = async () => { const error = validate(); if (error) return setMessage({ ok: false, text: error }); setBusy(true); try { onSaved(await api.connections.upsert(makeProfile())); onClose() } catch (error) { setMessage({ ok: false, text: failureMessage(error) }) } finally { setBusy(false) } }
  return <div className={styles.modalOverlay} onClick={onClose}><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tempo-connection-title" onClick={(event) => event.stopPropagation()}><ConnectionFormHeader kind="tempo" editing={!!existing} onBack={onBack} />
    <div className={styles.field}><TextInput label="Connection name" id="tempo-name" value={name} onValueChange={setName} /></div>
    <div className={styles.field}><TextInput label="gcx context" id="tempo-context" value={context} onValueChange={setContext} onBlur={refreshForContext} placeholder="Current gcx context" /><div className={styles.pasteHint}>Change the context, then leave this field or use Discover again.</div></div>
    <div className={styles.field}><button type="button" className="btn ghost" onClick={() => void discover(context.trim())} disabled={discoveryState === 'discovering'}>{discoveryState === 'idle' ? 'Discover' : 'Discover again'}</button><Combobox label="Tempo datasource" value={datasourceUid} onChange={(uid) => { setDatasourceUid(uid); setDatasourceMessage(null) }} loading={discoveryState === 'discovering'} disabled={discoveryState === 'discovering' || datasources.length === 0} placeholder="Select a datasource" options={datasources.map((item) => ({ value: item.uid, label: item.name, subtitle: item.type }))} /><div className={styles.pasteHint}>Optional for DataKoala queries; required for Grafana handoff.</div>{datasourceMessage && <div className={discoveryState === 'error' ? [styles.testMsg, styles.err].join(' ') : styles.discoveryStatus} role={discoveryState === 'error' ? 'alert' : 'status'}>{datasourceMessage}</div>}</div>
    <CollapsibleSection title="Grafana handoff override (optional)"><div className={styles.advancedFields}><TextInput label="Grafana base URL override" value={grafanaUrl} onValueChange={setGrafanaUrl} placeholder="https://example.com/grafana" hint="Leave blank to resolve from the selected gcx context. Navigation only; queries still run through gcx." /><TextInput label="Grafana org ID" inputMode="numeric" value={orgId} onValueChange={setOrgId} /></div></CollapsibleSection>
    {message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}<div className={styles.actions}><button type="button" className="btn ghost" onClick={() => void test()} disabled={busy}>{busy ? 'Testing…' : 'Test trace access'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? 'Working…' : 'Save'}</button></div></div></div>
}
