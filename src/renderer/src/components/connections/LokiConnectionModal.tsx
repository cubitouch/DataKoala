import { useEffect, useRef, useState } from 'react'
import type { LokiProfile } from '@shared/types'
import type { LokiDatasourceOption } from '@shared/loki'
import { normalizeGrafanaBaseUrl } from '@shared/grafanaExplore'
import { api } from '@lib/api'
import { Combobox } from '@components/ui/combobox'
import { TextInput } from '@components/ui/TextInput'
import { CollapsibleSection } from '@components/ui/CollapsibleSection'
import { ConnectionFormHeader } from './ConnectionFormHeader'
import type { ConnectionFormProps } from './connectionFormTypes'
import { failureMessage } from './connectionFormTypes'
import styles from './ConnectionModal.module.css'

export function LokiConnectionModal({ existing, onClose, onSaved, onBack, active = true }: ConnectionFormProps & { existing: LokiProfile | null }) {
  type DiscoveryState = 'idle' | 'discovering' | 'ready' | 'empty' | 'error'
  const savedUid = existing?.transport.datasourceUid ?? ''
  const [name, setName] = useState(existing?.name ?? 'Loki')
  const [context, setContext] = useState(existing?.transport.context ?? '')
  const [selectedUid, setSelectedUid] = useState(savedUid)
  const [manualUid, setManualUid] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [datasources, setDatasources] = useState<LokiDatasourceOption[]>([])
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('idle')
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [savedDatasourceMissing, setSavedDatasourceMissing] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [grafanaUrl, setGrafanaUrl] = useState(existing?.grafana?.baseUrl ?? '')
  const [orgId, setOrgId] = useState(String(existing?.grafana?.orgId ?? 1))
  const discoveryRevision = useRef(0)
  const discoveredContext = useRef<string | null>(null)
  const manualUidRef = useRef('')
  const savedFallbackRef = useRef(false)
  const effectiveUid = selectedUid.trim() || manualUid.trim()
  const selectedDatasource = datasources.find((source) => source.uid === selectedUid)
  const contextLabel = context.trim() || 'Current gcx context'
  const transport = () => ({ kind: 'gcx' as const, ...(context.trim() ? { context: context.trim() } : {}), ...(effectiveUid ? { datasourceUid: effectiveUid } : {}) })
  const grafanaType = selectedDatasource?.type ?? existing?.grafana?.datasourceType
  const profile = (): LokiProfile => ({ kind: 'loki', version: 1, id: existing?.id ?? '', name: name.trim(), readonly: true, transport: transport(), ...(grafanaUrl.trim() ? { grafana: { baseUrl: normalizeGrafanaBaseUrl(grafanaUrl), orgId: Number(orgId), datasourceType: grafanaType } } : {}) })

  const discover = async (nextContext = context.trim(), preserveSaved = false) => {
    const revision = ++discoveryRevision.current
    const previousContext = discoveredContext.current
    const contextChanged = previousContext !== null && previousContext !== nextContext
    const manualForRequest = contextChanged ? '' : manualUidRef.current.trim()
    const protectSaved = !contextChanged && Boolean(savedUid) && (preserveSaved || savedFallbackRef.current)
    discoveredContext.current = nextContext
    setDiscoveryState('discovering'); setDiscoveryError(null); setSavedDatasourceMissing(false); setDatasources([]); setSelectedUid(''); setMessage(null)
    if (contextChanged) { manualUidRef.current = ''; savedFallbackRef.current = false; setManualUid(''); setManualOpen(false) }
    try {
      const found = await api.connections.loki.discover({ kind: 'gcx', ...(nextContext ? { context: nextContext } : {}) })
      if (revision !== discoveryRevision.current) return
      setDatasources(found)
      const savedFound = protectSaved && found.some((source) => source.uid === savedUid)
      if (savedFound) {
        setSelectedUid(savedUid); setManualUid(''); manualUidRef.current = ''; savedFallbackRef.current = false; setManualOpen(false)
      } else if (protectSaved) {
        setManualUid(savedUid); manualUidRef.current = savedUid; savedFallbackRef.current = true; setSavedDatasourceMissing(true); setManualOpen(true)
      } else if (manualForRequest) {
        setManualUid(manualForRequest); manualUidRef.current = manualForRequest; setManualOpen(true)
      } else {
        setSelectedUid(found.length === 1 ? found[0].uid : '')
        if (found.length > 0) setManualOpen(false)
      }
      if (found.length === 0) { setDiscoveryState('empty'); setManualOpen(true) } else setDiscoveryState('ready')
    } catch (caught) {
      if (revision !== discoveryRevision.current) return
      if (protectSaved) { setManualUid(savedUid); manualUidRef.current = savedUid; savedFallbackRef.current = true; setSavedDatasourceMissing(true) }
      else if (manualForRequest) { setManualUid(manualForRequest); manualUidRef.current = manualForRequest }
      setDiscoveryState('error'); setDiscoveryError(failureMessage(caught)); setManualOpen(true)
    }
  }

  useEffect(() => { if (active) void discover(context.trim(), true); return () => { discoveryRevision.current += 1 } }, [active])
  const refreshForContext = () => { if (active && discoveredContext.current !== context.trim()) void discover(context.trim()) }
  const chooseDatasource = (uid: string) => { setSelectedUid(uid); if (uid) { setManualUid(''); manualUidRef.current = ''; savedFallbackRef.current = false; setSavedDatasourceMissing(false); setManualOpen(false) } setMessage(null) }
  const enterManualUid = (uid: string) => { setManualUid(uid); manualUidRef.current = uid; savedFallbackRef.current = uid.trim() === savedUid && Boolean(savedUid); if (uid.trim()) setSelectedUid(''); setMessage(null) }
  const missingDatasourceMessage = datasources.length > 1 ? 'Choose one of the discovered Loki datasources before continuing.' : 'Choose a Loki datasource before continuing.'
  const test = async () => {
    if (!effectiveUid) return setMessage({ ok: false, text: missingDatasourceMessage })
    setBusy(true); setMessage(null)
    try {
      const result = await api.connections.test(profile())
      const datasourceName = selectedDatasource?.name ?? 'the manually configured Loki datasource'
      setMessage(result.ok ? { ok: true, text: `Connected — ${datasourceName} is available through ${contextLabel}.` } : { ok: false, text: result.error })
    } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }) } finally { setBusy(false) }
  }
  const save = async () => {
    if (!name.trim()) return setMessage({ ok: false, text: 'Connection name is required.' })
    if (!effectiveUid) return setMessage({ ok: false, text: missingDatasourceMessage })
    if (grafanaUrl.trim()) {
      try { normalizeGrafanaBaseUrl(grafanaUrl) } catch (caught) { return setMessage({ ok: false, text: failureMessage(caught) }) }
      if (!/^\d+$/.test(orgId) || Number(orgId) < 1) return setMessage({ ok: false, text: 'Grafana org ID must be a positive integer.' })
      if (!grafanaType) return setMessage({ ok: false, text: 'Choose a discovered datasource to configure Grafana handoff.' })
    }
    setBusy(true)
    try { onSaved(await api.connections.upsert(profile())); onClose() } catch (caught) { setMessage({ ok: false, text: failureMessage(caught) }); setBusy(false) }
  }
  const datasourceOptions = datasources.map((source) => ({ value: source.uid, label: source.name, subtitle: `${source.type} · ID ${source.uid}` }))
  const discoveryMessage = discoveryState === 'discovering' ? 'Discovering Loki datasources…'
    : discoveryState === 'ready' && datasources.length === 1 ? `One Loki datasource found in ${contextLabel} and selected automatically.`
      : discoveryState === 'ready' ? `${datasources.length} Loki datasources found in ${contextLabel}. Choose the one you want to explore.`
        : discoveryState === 'empty' ? `No Loki datasource found in ${contextLabel}.`
          : null
  const canUseDatasource = Boolean(effectiveUid) && discoveryState !== 'discovering'

  return <div className={styles.modalOverlay} onClick={onClose}><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="loki-connection-title" onClick={(event) => event.stopPropagation()}>
    <ConnectionFormHeader kind="loki" editing={!!existing} onBack={onBack} />
    <div className={styles.field}><TextInput label="Connection name" id="loki-name" value={name} onValueChange={setName} /></div>
    <div className={styles.field}><TextInput label="gcx context" id="loki-context" value={context} onValueChange={setContext} onBlur={refreshForContext} placeholder="Current gcx context" /><div className={styles.pasteHint}>Discovering from: <strong>{contextLabel}</strong>. Change the context, then leave this field or use Discover again.</div></div>
    <div className={styles.field}><div className={styles.discoveryHeading}><button type="button" className="btn ghost" onClick={() => void discover(context.trim())} disabled={discoveryState === 'discovering'}>{discoveryState === 'idle' ? 'Discover' : 'Discover again'}</button></div><Combobox label="Loki datasource" value={selectedUid} options={datasourceOptions} onChange={chooseDatasource} searchable disabled={discoveryState === 'discovering' || datasources.length === 0} loading={discoveryState === 'discovering'} placeholder={datasources.length > 1 ? 'Choose a Loki datasource' : 'No datasource selected'} emptyMessage="No Loki datasources discovered" />
      {discoveryMessage && <div className={styles.discoveryStatus} role="status">{discoveryMessage}</div>}
      {discoveryState === 'error' && <div className={[styles.testMsg, styles.err].join(' ')} role="alert"><strong>Datasource discovery failed.</strong> {discoveryError}<br />Check that gcx is installed. Run <code>gcx login</code>, or re-authenticate {context.trim() ? `the ${context.trim()} context` : 'your current gcx context'}.</div>}
      {savedDatasourceMissing && <div className={styles.fieldError} role="status">The saved Loki datasource was not found in {contextLabel}. Its saved ID remains available under Advanced, or choose a different discovered datasource deliberately.</div>}
      {datasources.length > 1 && !selectedUid && !manualUid.trim() && <div className={styles.fieldError}>Selection required: choose one of the discovered Loki datasources.</div>}
    </div>
    <div className={styles.lokiAdvancedStack}>
      <CollapsibleSection title="Advanced — enter a datasource UID manually" open={manualOpen} onOpenChange={setManualOpen}><div className={styles.advancedFields}><TextInput label="Datasource UID" id="loki-uid" value={manualUid} onValueChange={enterManualUid} placeholder="Enter a datasource UID" /><div className={styles.pasteHint}>Use this only when authenticated discovery cannot list the datasource.</div></div></CollapsibleSection>
      <CollapsibleSection title="Grafana handoff override (optional)"><div className={styles.advancedFields}><TextInput label="Grafana base URL override" value={grafanaUrl} onValueChange={setGrafanaUrl} placeholder="https://example.com/grafana" hint="Leave blank to resolve from the selected gcx context. Navigation only; queries still run through gcx." /><TextInput label="Grafana org ID" inputMode="numeric" value={orgId} onValueChange={setOrgId} /></div></CollapsibleSection>
    </div>
    <div className={[styles.testMsg, styles.info].join(' ')}>Uses your existing gcx authentication. DataKoala never reads, copies, or stores Grafana credentials.</div>
    {message && <div className={[styles.testMsg, message.ok ? styles.ok : styles.err].join(' ')} role={message.ok ? 'status' : 'alert'}>{message.text}</div>}
    <div className={styles.actions}><button type="button" className="btn ghost" onClick={() => void test()} disabled={busy || !canUseDatasource}>{busy ? 'Testing…' : 'Test datasource'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy || !canUseDatasource}>{busy ? 'Working…' : 'Save'}</button></div>
  </div></div>
}
