import { TextInput } from './ui/TextInput'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LokiLogRow } from '@shared/loki'
import styles from './LokiExplorer.module.css'

const shortTimestamp = (timestampMs: number) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false, timeZone: 'UTC' }).format(timestampMs)
const dedicatedKeys = new Set(['message', 'msg', 'body', 'severity', 'level', 'traceid', 'spanid'])
function decodedPayload(line: string): Record<string, unknown> {
  try { const value: unknown = JSON.parse(line); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} } catch { return {} }
}
function eventMessage(row: LokiLogRow): string {
  for (const record of [row.parsedFields, row.structuredMetadata, decodedPayload(row.line)]) for (const key of ['message', 'msg', 'body']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return row.line
}
const isDedicated = (key: string) => dedicatedKeys.has(key.toLowerCase().replace(/[._]/g, ''))
function ActionIcon({ kind }: { kind: 'copy' | 'include' | 'exclude' | 'raw' }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true">{kind === 'copy' ? <><rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 11H2V2h9v1"/></> : kind === 'include' ? <path d="M8 3v10M3 8h10"/> : kind === 'exclude' ? <path d="M3 8h10"/> : <><path d="M3 3h10v10H3zM5 6h6M5 8h6M5 10h4"/></>}</svg>
}

interface Props {
  rows: LokiLogRow[]
  truncated?: boolean
  limit: number
  selectionKey?: string | number
  onFilter: (kind: 'label' | 'field', key: string, value: string, exclude: boolean) => void
}

export function LogResultExplorer({ rows, truncated, limit, selectionKey, onFilter }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const parent = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => { const term = search.toLowerCase(); return term ? rows.filter((row) => eventMessage(row).toLowerCase().includes(term) || row.line.toLowerCase().includes(term) || JSON.stringify([row.labels, row.structuredMetadata, row.parsedFields]).toLowerCase().includes(term)) : rows }, [rows, search])
  const selected = visible.find((row) => row.id === selectedId) ?? null
  const virtual = useVirtualizer({ count: visible.length, getScrollElement: () => parent.current, estimateSize: () => 42, overscan: 8 })
  useEffect(() => { if (selectedId && !visible.some((row) => row.id === selectedId)) setSelectedId(null) }, [selectedId, visible])
  useEffect(() => setSelectedId(null), [selectionKey])
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [])

  const fields = (record: Record<string, unknown>, kind: 'label' | 'field') => <dl>{Object.entries(record).filter(([key]) => !isDedicated(key)).map(([key, value]) => <div className={styles.fieldRow} key={key}><dt>{key}</dt><dd>{String(value)}</dd><div className={styles.fieldActions} aria-label={`${key} actions`}><button title={`Copy ${key}`} aria-label={`Copy ${key}`} onClick={() => void navigator.clipboard.writeText(String(value))}><ActionIcon kind="copy"/></button><button title={`Include ${key}`} aria-label={`Include ${key}`} onClick={() => onFilter(kind, key, String(value), false)}><ActionIcon kind="include"/></button><button title={`Exclude ${key}`} aria-label={`Exclude ${key}`} onClick={() => onFilter(kind, key, String(value), true)}><ActionIcon kind="exclude"/></button></div></div>)}</dl>

  return <section className={styles.logs} aria-label="Log results">
    <div className={styles.resultToolbar}><TextInput mode="inline" labelVisibility="sr-only" label="Search loaded logs" placeholder="Search loaded logs…" value={search} onValueChange={setSearch} /><span className={styles.loadedCount}>{visible.length} loaded{truncated ? ` · limited to ${limit} · more available` : ''}</span></div>
    <div className={styles.logSplit} data-inspector-open={Boolean(selected) || undefined}>
      {!visible.length ? <div className={styles.empty}>No matching log entries.</div> : <div ref={parent} className={styles.logScroller}><div style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map((item) => { const row = visible[item.index], active = row.id === selectedId, iso = new Date(row.timestampMs).toISOString(), message = eventMessage(row); return <article key={row.id} data-index={item.index} className={styles.logRow} style={{ transform: `translateY(${item.start}px)` }}><button className={styles.logSummary} aria-label={`${shortTimestamp(row.timestampMs)}, ${row.severity.toUpperCase()}, ${message}`} aria-selected={active} onClick={() => setSelectedId(active ? null : row.id)}><time dateTime={iso} title={iso}>{shortTimestamp(row.timestampMs)}</time><strong data-severity={row.severity.toUpperCase()}>{row.severity.toUpperCase()}</strong><span>{message}</span><i aria-hidden="true" title="Open details">›</i></button></article> })}</div></div>}
      {selected && <aside className={styles.logInspector} aria-label="Selected log details"><header><div><strong>Log event</strong><span>{new Date(selected.timestampMs).toISOString()}</span></div><button type="button" className="btn ghost" onClick={() => setSelectedId(null)} aria-label="Close log details">Close</button></header><div className={styles.inspectorBody}><div className={styles.inspectorSeverity}><strong data-severity={selected.severity.toUpperCase()}>{selected.severity.toUpperCase()}</strong></div><p className={styles.fullLine}>{eventMessage(selected)}</p><div className={styles.logActions}><button className={styles.iconAction} title="Copy message" aria-label="Copy message" onClick={() => void navigator.clipboard.writeText(eventMessage(selected))}><ActionIcon kind="copy"/></button><button className={styles.iconAction} title="Copy raw log" aria-label="Copy raw log" onClick={() => void navigator.clipboard.writeText(selected.line)}><ActionIcon kind="raw"/></button></div>{(selected.traceId || selected.spanId) && <dl className={styles.traceIdentifiers}>{selected.traceId && <div><dt>Trace ID</dt><dd><code>{selected.traceId}</code><button title="Copy Trace ID" aria-label="Copy Trace ID" onClick={() => void navigator.clipboard.writeText(selected.traceId!)}><ActionIcon kind="copy"/></button></dd></div>}{selected.spanId && <div><dt>Span ID</dt><dd><code>{selected.spanId}</code><button title="Copy Span ID" aria-label="Copy Span ID" onClick={() => void navigator.clipboard.writeText(selected.spanId!)}><ActionIcon kind="copy"/></button></dd></div>}</dl>}<section className={styles.detailSection}><h3>Indexed labels</h3>{fields(selected.labels, 'label')}</section><section className={styles.detailSection}><h3>Structured metadata</h3>{fields(selected.structuredMetadata, 'field')}</section><section className={styles.detailSection}><h3>Parsed fields</h3>{fields(selected.parsedFields, 'field')}</section></div></aside>}
    </div>
  </section>
}
