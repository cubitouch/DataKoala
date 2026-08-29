import { TextInput } from './ui/TextInput'
import { useEffect, useRef, useState } from 'react'
import { lokiLabelValues } from '../lib/lokiMetadata'
import { useLokiLabelsResource } from '../lib/useLokiLabelsResource'
import { selectActiveSession, useStore } from '../store/useStore'
import styles from './Sidebar.module.css'

const visibleMetadata = (items: string[]) => [...new Set(items)].filter((item) => item && !item.startsWith('__')).sort()

export function LokiSidebarTree({ connectionId }: { connectionId: string }) {
  const session = useStore(selectActiveSession)
  const setLokiState = useStore((state) => state.setLokiState)
  const setMode = useStore((state) => state.setQueryMode)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [valueStatus, setValueStatus] = useState<Record<string, 'loading' | 'error'>>({})
  const revision = useRef(0)
  const connectionGeneration = useStore((state) => state.connectionGeneration)
  const activeProfileId = useStore((state) => state.activeProfileId)
  const connected = useStore((state) => state.connected)
  const canLoadMetadata = connectionId === activeProfileId && connected
  const available = useRef(canLoadMetadata)
  available.current = canLoadMetadata
  const lifecycleKey = useRef('')
  const currentLifecycleKey = `${connectionId}\0${connectionGeneration}\0${session.id}\0${canLoadMetadata}`
  if (lifecycleKey.current !== currentLifecycleKey) { lifecycleKey.current = currentLifecycleKey; revision.current++ }
  const resource = useLokiLabelsResource(connectionId, connectionGeneration, session.id, session.lokiTimeRange, canLoadMetadata)
  const { labels, status, error, bounds } = resource
  useEffect(() => {
    revision.current++; setValueStatus({})
    if (canLoadMetadata) { setValues({}); setExpanded(new Set()) }
  }, [connectionId, connectionGeneration, session.id, canLoadMetadata, JSON.stringify(session.lokiTimeRange)])
  const addLabel = (label: string, value?: string) => {
    const current = session.lokiBuilder.labelMatchers.filter((matcher, index, all) => all.findIndex((item) => item.label === matcher.label) === index)
    const existing = current.find((matcher) => matcher.label === label)
    const next = existing ? current.map((matcher) => matcher.label === label ? { ...matcher, ...(value !== undefined ? { value, values: [value] } : {}) } : matcher) : [...current, { label, operator: '=' as const, value: value ?? '', values: value === undefined ? [] : [value] }]
    setLokiState({ lokiBuilder: { ...session.lokiBuilder, labelMatchers: next } }, session.id); setMode('builder', session.id)
  }
  const toggle = async (label: string) => {
    if (!canLoadMetadata) return
    setExpanded((current) => { const next = new Set(current); next.has(label) ? next.delete(label) : next.add(label); return next })
    if (expanded.has(label) || values[label] || valueStatus[label] === 'loading') return
    const request = revision.current, tabId = session.id
    setValueStatus((current) => ({ ...current, [label]: 'loading' }))
    try { const next = visibleMetadata(await lokiLabelValues(connectionId, label, bounds, session.lokiBuilder.labelMatchers)); if (!available.current || request !== revision.current || useStore.getState().activeTabId !== tabId) return; setValues((current) => ({ ...current, [label]: next })); setValueStatus((current) => { const copy = { ...current }; delete copy[label]; return copy }) }
    catch { if (available.current && request === revision.current && useStore.getState().activeTabId === tabId) setValueStatus((current) => ({ ...current, [label]: 'error' })) }
  }
  const needle = filter.trim().toLowerCase()
  const filteredLabels = labels.filter((label) => !needle || label.toLowerCase().includes(needle) || values[label]?.some((value) => value.toLowerCase().includes(needle)))
  return <section className={styles.objectsSection} aria-label="Loki indexed labels"><h3>Objects</h3>
    {!canLoadMetadata && <div className={styles.objectStatus} role="status">Metadata unavailable</div>}
    {canLoadMetadata && status === 'loading' && <div className={styles.objectStatus} role="status"><span className={styles.spinner} /> Loading indexed labels…</div>}
    {canLoadMetadata && status === 'error' && <div className={styles.objectError} role="alert">Could not load indexed labels.<small>{error}</small><button onClick={() => void resource.retry()}>Retry</button></div>}
    {status === 'loaded' && <div className={styles.objectFilter}><TextInput value={filter} onValueChange={setFilter} placeholder="Filter objects…" label="Filter Loki objects" labelVisibility="sr-only" /></div>}
    {status === 'loaded' && labels.length === 0 && <div className={styles.objectStatus}>No indexed labels in this range</div>}
    {status === 'loaded' && labels.length > 0 && filteredLabels.length === 0 && <div className={styles.objectStatus}>No objects match this filter</div>}
    {status === 'loaded' && labels.length > 0 && <div className={styles.objectTree} role="tree" aria-label="Loki labels">{filteredLabels.map((label) => { const open = expanded.has(label); return <div key={label} role="treeitem" aria-expanded={open}><div className={`${styles.treeRow} ${styles.schemaRow}`}><button disabled={!canLoadMetadata} className={styles.chevronButton} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} onClick={() => void toggle(label)}>{open ? '▾' : '▸'}</button><button disabled={!canLoadMetadata} className={styles.relationName} onClick={() => addLabel(label)}>{label}</button></div>{open && <div role="group">{canLoadMetadata && valueStatus[label] === 'loading' && <div className={styles.columnStatus}>Loading values…</div>}{canLoadMetadata && valueStatus[label] === 'error' && <button className={`${styles.columnStatus} ${styles.error}`} onClick={() => { setValueStatus((current) => { const copy = { ...current }; delete copy[label]; return copy }); void toggle(label) }}>Could not load values — retry</button>}{values[label]?.filter((value) => !needle || label.toLowerCase().includes(needle) || value.toLowerCase().includes(needle)).map((value) => <button disabled={!canLoadMetadata} key={value} role="treeitem" className={`${styles.treeRow} ${styles.columnRow}`} onClick={() => addLabel(label, value)} title={`${label}=${value}`}><span className={styles.truncate}>{value}</span></button>)}</div>}</div> })}</div>}
  </section>
}
