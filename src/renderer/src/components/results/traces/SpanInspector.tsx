import type { TraceRow } from '../../../lib/traceViewer'
import styles from './SpanInspector.module.css'
import { traceDurationLabel, traceNumber, traceText } from './tracePresentation'

interface SpanInspectorProps {
  span: TraceRow
  traceStart: number
  onClose: () => void
}

const text = traceText
const number = traceNumber
const durationLabel = traceDurationLabel

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch { return {} }
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

function valueLabel(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function AttributeList({ values, empty = 'No attributes' }: { values: Record<string, unknown>; empty?: string }) {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right))
  if (!entries.length) return <div className={styles.attributeEmpty}>{empty}</div>
  return <dl className={styles.attributeList}>{entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd title={valueLabel(value)}>{valueLabel(value)}</dd></div>)}</dl>
}

function semanticGroups(attributes: Record<string, unknown>) {
  const definitions = [
    ['HTTP & network', ['http.', 'url.', 'server.', 'client.', 'network.']],
    ['Database', ['db.']],
    ['RPC', ['rpc.']],
    ['Messaging', ['messaging.']],
    ['Error', ['error.', 'exception.']]
  ] as const
  const remaining = { ...attributes }
  const groups: Array<{ title: string; values: Record<string, unknown> }> = []
  for (const [title, prefixes] of definitions) {
    const values: Record<string, unknown> = {}
    for (const key of Object.keys(remaining)) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        values[key] = remaining[key]
        delete remaining[key]
      }
    }
    if (Object.keys(values).length) groups.push({ title, values })
  }
  if (Object.keys(remaining).length) groups.push({ title: 'Attributes', values: remaining })
  return groups
}

export function SpanInspector({ span, traceStart, onClose }: SpanInspectorProps) {
  const attributes = jsonRecord(span.attributes)
  const resource = jsonRecord(span.resourceAttributes)
  const events = jsonArray(span.events).filter((event) => event && typeof event === 'object') as Record<string, unknown>[]
  const links = jsonArray(span.links).filter((link) => link && typeof link === 'object') as Record<string, unknown>[]
  const groups = semanticGroups(attributes)
  const status = text(span.status) || 'UNSET'
  return <aside className={styles.details} aria-label="Selected span details">
    <header className={styles.detailsHeader}>
      <div><strong>{text(span.service) || 'unknown service'}</strong><span>{text(span.name) || text(span.spanId)}</span></div>
      <div className={styles.detailsActions}>
        <span className={`${styles.statusBadge} ${status.toUpperCase().includes('ERROR') ? styles.statusError : ''}`}>{status}</span>
        <button type="button" className={styles.detailsClose} aria-label="Close span details" title="Close span details" onClick={onClose}>×</button>
      </div>
    </header>
    <div className={styles.detailSummary}>
      <div><span>Duration</span><strong>{durationLabel(number(span.durationMs))}</strong></div>
      <div><span>Start</span><strong>+{durationLabel(Math.max(0, number(span.startTimeMs) - traceStart))}</strong></div>
      <div><span>Kind</span><strong>{text(span.kind) || 'UNSPECIFIED'}</strong></div>
      <div><span>Scope</span><strong>{text(span.scopeName) || '—'}</strong></div>
    </div>
    {text(span.statusMessage) && <div className={styles.statusMessage}>{text(span.statusMessage)}</div>}
    <details open><summary>Identity</summary><AttributeList values={{ 'trace.id': text(span.traceId), 'span.id': text(span.spanId), 'parent.span.id': text(span.parentSpanId) || '—' }} /></details>
    {Object.keys(resource).length > 0 && <details open><summary>Resource</summary><AttributeList values={resource} /></details>}
    {groups.map((group) => <details key={group.title} open={group.title === 'HTTP & network' || group.title === 'Database' || group.title === 'Messaging' || group.title === 'Error'}><summary>{group.title}</summary><AttributeList values={group.values} /></details>)}
    {events.length > 0 && <details open><summary>Events <span>{events.length}</span></summary><div className={styles.eventList}>{events.map((event, index) => <div key={`${text(event.name)}-${index}`}><strong>{text(event.name) || `Event ${index + 1}`}</strong><AttributeList values={jsonRecord(event.attributes)} empty="No event attributes" /></div>)}</div></details>}
    {links.length > 0 && <details open><summary>Links <span>{links.length}</span></summary><div className={styles.linkList}>{links.map((link, index) => <div key={`${text(link.traceId)}-${text(link.spanId)}-${index}`}><code>{text(link.traceId) || 'same trace'} / {text(link.spanId) || 'unknown span'}</code><AttributeList values={jsonRecord(link.attributes)} empty="No link attributes" /></div>)}</div></details>}
    <details><summary>Raw span data</summary><pre>{JSON.stringify(span, null, 2)}</pre></details>
  </aside>
}
