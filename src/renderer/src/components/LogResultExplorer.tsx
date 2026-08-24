import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LokiLogRow } from '@shared/loki'
import styles from './LokiExplorer.module.css'

const shortTimestamp = (timestampMs: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false, timeZone: 'UTC' }).format(timestampMs)

interface Props {
  rows: LokiLogRow[]
  truncated?: boolean
  limit: number
  selectionKey?: string | number
  onFilter: (kind: 'label' | 'field', key: string, value: string, exclude: boolean) => void
  onCorrelate?: (traceId: string) => void
}

export function LogResultExplorer({ rows, truncated, limit, selectionKey, onFilter, onCorrelate }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const parent = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => { const term = search.toLowerCase(); return term ? rows.filter((row) => row.line.toLowerCase().includes(term) || JSON.stringify([row.labels, row.structuredMetadata, row.parsedFields]).toLowerCase().includes(term)) : rows }, [rows, search])
  const selected = visible.find((row) => row.id === selectedId) ?? null
  const virtual = useVirtualizer({ count: visible.length, getScrollElement: () => parent.current, estimateSize: () => 42, overscan: 8 })
  useEffect(() => { if (selectedId && !visible.some((row) => row.id === selectedId)) setSelectedId(null) }, [selectedId, visible])
  useEffect(() => setSelectedId(null), [selectionKey])
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [])

  const fields = (record: Record<string, unknown>, kind: 'label' | 'field') => <dl>{Object.entries(record).map(([key, value]) => <div className={styles.fieldRow} key={key}><dt>{key}</dt><dd>{String(value)}</dd><div className={styles.fieldActions} aria-label={`${key} actions`}><button title={`Copy ${key}`} aria-label={`Copy ${key}`} onClick={() => void navigator.clipboard.writeText(String(value))}>Copy</button><button title={`Include ${key}`} aria-label={`Include ${key}`} onClick={() => onFilter(kind, key, String(value), false)}>Include</button><button title={`Exclude ${key}`} aria-label={`Exclude ${key}`} onClick={() => onFilter(kind, key, String(value), true)}>Exclude</button></div></div>)}</dl>

  return <section className={styles.logs} aria-label="Log results">
    <div className={styles.resultToolbar}><input aria-label="Search loaded logs" placeholder="Search loaded logs…" value={search} onChange={(event) => setSearch(event.target.value)} /><span className={styles.loadedCount}>{visible.length} loaded{truncated ? ` · limited to ${limit} · more available` : ''}</span></div>
    <div className={styles.logSplit} data-inspector-open={Boolean(selected) || undefined}>
      {!visible.length ? <div className={styles.empty}>No matching log entries.</div> : <div ref={parent} className={styles.logScroller}><div style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map((item) => { const row = visible[item.index], active = row.id === selectedId, iso = new Date(row.timestampMs).toISOString(); return <article key={row.id} data-index={item.index} className={styles.logRow} style={{ transform: `translateY(${item.start}px)` }}><button className={styles.logSummary} aria-selected={active} onClick={() => setSelectedId(active ? null : row.id)}><time dateTime={iso} title={iso}>{shortTimestamp(row.timestampMs)}</time><strong data-severity={row.severity.toUpperCase()}>{row.severity.toUpperCase()}</strong><span>{row.line}</span></button></article> })}</div></div>}
      {selected && <aside className={styles.logInspector} aria-label="Selected log details"><header><div><strong>Log event</strong><span>{new Date(selected.timestampMs).toISOString()}</span></div><button type="button" className="btn ghost" onClick={() => setSelectedId(null)} aria-label="Close log details">Close</button></header><div className={styles.inspectorBody}><div className={styles.inspectorSeverity}><strong data-severity={selected.severity.toUpperCase()}>{selected.severity.toUpperCase()}</strong>{selected.traceId && <code>{selected.traceId}</code>}</div><p className={styles.fullLine}>{selected.line}</p><div className={styles.logActions}><button className="btn ghost" onClick={() => void navigator.clipboard.writeText(selected.line)}>Copy line</button>{selected.traceId && onCorrelate && <button className="btn ghost" onClick={() => onCorrelate(selected.traceId!)}>Open trace</button>}</div><section className={styles.detailSection}><h3>Indexed labels</h3>{fields(selected.labels, 'label')}</section><section className={styles.detailSection}><h3>Structured metadata</h3>{fields(selected.structuredMetadata, 'field')}</section><section className={styles.detailSection}><h3>Parsed fields</h3>{fields(selected.parsedFields, 'field')}</section></div></aside>}
    </div>
  </section>
}
