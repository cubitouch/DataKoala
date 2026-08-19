import { type FormEvent, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { QueryResult } from '@shared/types'
import { api } from '../lib/api'
import { selectActiveSession, useStore } from '../store/useStore'
import { TimeRangeField } from './time-range/TimeRangeField'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import styles from './TraceExplorer.module.css'

interface TraceExplorerProps {
  connectionId: string
}

type TraceRow = Record<string, unknown>
type TraceStatus = 'any' | 'error' | 'ok'
type ResultView = 'list' | 'scatter'
interface TraceBuilderState {
  serviceNamespace: string
  service: string
  spanName: string
  status: TraceStatus
  minDurationMs: string
}

const MAX_RENDERED_SPANS = 500
const TRACE_ID = /^[0-9a-f]{32}$/i
const EMPTY_BUILDER: TraceBuilderState = { serviceNamespace: '', service: '', spanName: '', status: 'any', minDurationMs: '' }
const DEFAULT_TRACE_RANGE: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function durationLabel(milliseconds: number): string {
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`
  if (milliseconds >= 1) return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`
  return `${Math.max(0, milliseconds * 1_000).toFixed(0)}µs`
}

function dateTimeLabel(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(milliseconds))
}

function isSpanResult(result: QueryResult): boolean {
  return result.columns.some((column) => column.name === 'spanId')
}

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

function extractQuoted(query: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = query.match(new RegExp(`(?:^|[\\s{(&|])${escaped}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`))
  if (!match) return ''
  try { return JSON.parse(`"${match[1]}"`) } catch { return match[1] }
}

function builderFromTraceql(query: string): TraceBuilderState {
  const duration = query.match(/(?:^|[\s{(&|])duration\s*>\s*([0-9.]+)ms/i)?.[1] ?? ''
  const status = /(?:^|[\s{(&|])status\s*=\s*error/i.test(query) ? 'error' : /(?:^|[\s{(&|])status\s*=\s*ok/i.test(query) ? 'ok' : 'any'
  return {
    serviceNamespace: extractQuoted(query, 'resource.service.namespace'),
    service: extractQuoted(query, 'resource.service.name'),
    spanName: extractQuoted(query, 'name'),
    status,
    minDurationMs: duration
  }
}

function buildTraceql(builder: TraceBuilderState): string {
  const conditions: string[] = []
  if (builder.serviceNamespace.trim()) conditions.push(`resource.service.namespace = ${JSON.stringify(builder.serviceNamespace.trim())}`)
  if (builder.service.trim()) conditions.push(`resource.service.name = ${JSON.stringify(builder.service.trim())}`)
  if (builder.spanName.trim()) conditions.push(`name = ${JSON.stringify(builder.spanName.trim())}`)
  if (builder.status === 'error') conditions.push('status = error')
  if (builder.status === 'ok') conditions.push('status = ok')
  const duration = Number(builder.minDurationMs)
  if (builder.minDurationMs.trim() && Number.isFinite(duration) && duration >= 0) conditions.push(`duration > ${duration}ms`)
  return `{ ${conditions.join(' && ')} }`
}

interface TreeSpan {
  row: TraceRow
  id: string
  depth: number
  hasChildren: boolean
}

function buildVisibleTree(rows: TraceRow[], collapsed: Set<string>): TreeSpan[] {
  const sorted = [...rows].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs))
  const byId = new Map<string, TraceRow>()
  for (const row of sorted) {
    const id = text(row.spanId)
    if (id) byId.set(id, row)
  }
  const children = new Map<string, TraceRow[]>()
  for (const row of sorted) {
    const parent = text(row.parentSpanId)
    if (!parent || !byId.has(parent)) continue
    const list = children.get(parent) ?? []
    list.push(row)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs))
  const roots = sorted.filter((row) => !text(row.parentSpanId) || !byId.has(text(row.parentSpanId)))
  const output: TreeSpan[] = []
  const visited = new Set<string>()
  const visit = (row: TraceRow, depth: number) => {
    const id = text(row.spanId)
    if (!id || visited.has(id)) return
    visited.add(id)
    const childRows = children.get(id) ?? []
    output.push({ row, id, depth: Math.min(depth, 16), hasChildren: childRows.length > 0 })
    if (!collapsed.has(id)) childRows.forEach((child) => visit(child, depth + 1))
  }
  roots.forEach((root) => visit(root, 0))
  sorted.forEach((row) => visit(row, 0))
  return output
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

function SpanInspector({ span, traceStart, onClose }: { span: TraceRow; traceStart: number; onClose: () => void }) {
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

function resultStatus(row: TraceRow): 'ok' | 'error' | 'unknown' {
  const value = text(row.status).toLowerCase()
  if (value.includes('error')) return 'error'
  if (value === 'ok' || value.includes('success')) return 'ok'
  return 'unknown'
}

export function TraceExplorer({ connectionId }: TraceExplorerProps) {
  const mode = useStore((state) => selectActiveSession(state).queryMode)
  const traceql = useStore((state) => selectActiveSession(state).sql)
  const setSql = useStore((state) => state.setSql)
  const setQueryMode = useStore((state) => state.setQueryMode)
  const [builder, setBuilder] = useState<TraceBuilderState>(() => builderFromTraceql(traceql))
  const [traceId, setTraceId] = useState('')
  const [searchRows, setSearchRows] = useState<TraceRow[]>([])
  const [spans, setSpans] = useState<TraceRow[]>([])
  const [searchNotice, setSearchNotice] = useState('')
  const [selectedSpanId, setSelectedSpanId] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<'search' | 'trace' | null>(null)
  const [error, setError] = useState('')
  const [cohortHint, setCohortHint] = useState('')
  const [searchRange, setSearchRange] = useState<BuilderTimeRange>(DEFAULT_TRACE_RANGE)
  const [resultView, setResultView] = useState<ResultView>('list')

  useEffect(() => {
    setBuilder(builderFromTraceql(traceql))
  }, [traceql])

  useEffect(() => {
    setSearchRows([])
    setSpans([])
    setTraceId('')
    setSelectedSpanId('')
    setCollapsed(new Set())
    setError('')
    setCohortHint('')
    setSearchRange(DEFAULT_TRACE_RANGE)
    setResultView('list')
  }, [connectionId])

  const runSearch = async () => {
    const request = traceql.trim()
    if (!request) return
    if (searchRange.recurringWindows?.some((window) => window.from || window.to)) {
      setError('Recurring daily windows are not supported for Tempo trace searches yet. Choose a continuous range.')
      return
    }
    let range: { start: string; end: string }
    try {
      range = prometheusRangeBounds(searchRange)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return
    }

    const tempoSearchRequest = {
      start: range.start,
      end: range.end,
      step: '1s'
    }

    setLoading('search')
    setError('')
    setCohortHint('')
    setSearchRows([])
    setSearchNotice('Fetching the complete selected period…')
    try {
      const result = await api.query.run(connectionId, request, [], tempoSearchRequest)
      if (isSpanResult(result)) throw new Error('TraceQL search returned a trace instead of search results.')
      setSearchRows(result.rows)
      setSearchNotice(result.notice ?? '')
      setSpans([])
      setSelectedSpanId('')
      setCollapsed(new Set())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(null) }
  }

  const openTrace = async (candidate = traceId) => {
    const request = candidate.trim()
    if (!TRACE_ID.test(request)) {
      setError('Trace ID must be a 32-character hexadecimal identifier.')
      return
    }
    setTraceId(request)
    setLoading('trace')
    setError('')
    setCohortHint('')
    try {
      const result = await api.query.run(connectionId, request)
      if (!isSpanResult(result)) throw new Error('Tempo returned search results instead of the requested trace.')
      setSpans(result.rows)
      setSelectedSpanId('')
      setCollapsed(new Set())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(null) }
  }

  const updateBuilder = (patch: Partial<TraceBuilderState>) => {
    setBuilder((current) => {
      const next = { ...current, ...patch }
      setSql(buildTraceql(next))
      return next
    })
  }

  const submitTraceId = (event: FormEvent) => { event.preventDefault(); void openTrace() }
  const submitSearch = (event: FormEvent) => { event.preventDefault(); void runSearch() }

  const sortedSpans = useMemo(() => [...spans].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs)), [spans])
  const visibleTree = useMemo(() => buildVisibleTree(sortedSpans, collapsed), [sortedSpans, collapsed])
  const renderedTree = visibleTree.slice(0, MAX_RENDERED_SPANS)
  const traceStart = sortedSpans.length ? Math.min(...sortedSpans.map((row) => number(row.startTimeMs))) : 0
  const traceEnd = sortedSpans.length ? Math.max(...sortedSpans.map((row) => number(row.startTimeMs) + number(row.durationMs))) : 0
  const traceDuration = Math.max(0, traceEnd - traceStart)
  const services = useMemo(() => new Set(sortedSpans.map((row) => text(row.service)).filter(Boolean)), [sortedSpans])
  const errorCount = useMemo(() => sortedSpans.filter((row) => text(row.status).toUpperCase().includes('ERROR')).length, [sortedSpans])
  const rootSpan = sortedSpans.find((row) => !text(row.parentSpanId)) ?? sortedSpans[0]
  const selectedSpan = sortedSpans.find((row) => text(row.spanId) === selectedSpanId)

  const scatterOption = useMemo(() => {
    const groups = [
      { key: 'ok', name: 'Success', color: '#3fb950' },
      { key: 'error', name: 'Error', color: '#f85149' },
      { key: 'unknown', name: 'Unknown', color: '#8b949e' }
    ] as const
    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 72, right: 26, top: 42, bottom: 58 },
      legend: { top: 8, textStyle: { color: '#9aa4b2' } },
      tooltip: {
        trigger: 'item',
        formatter: (value: unknown) => {
          const data = (value as { data?: Record<string, unknown> })?.data ?? {}
          return [
            `<strong>${escapeHtml(text(data.rootService) || 'unknown service')}</strong>`,
            escapeHtml(text(data.rootOperation) || text(data.traceId)),
            `${escapeHtml(dateTimeLabel(number(data.startTimeMs)))} · ${escapeHtml(durationLabel(number(data.durationMs)))}`,
            `${number(data.matchedSpans) || 0} matched spans`
          ].join('<br/>')
        }
      },
      xAxis: {
        type: 'time',
        name: 'Trace start',
        nameLocation: 'middle',
        nameGap: 38,
        axisLabel: { color: '#9aa4b2' },
        axisLine: { lineStyle: { color: '#3b424d' } },
        splitLine: { lineStyle: { color: '#262c35' } }
      },
      yAxis: {
        type: 'value',
        min: 0,
        name: 'Duration (ms)',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: { color: '#9aa4b2' },
        axisLine: { lineStyle: { color: '#3b424d' } },
        splitLine: { lineStyle: { color: '#262c35' } }
      },
      series: groups.map((group) => ({
        name: group.name,
        type: 'scatter',
        symbolSize: 11,
        itemStyle: { color: group.color },
        emphasis: { scale: 1.45 },
        data: searchRows.filter((row) => resultStatus(row) === group.key).map((row) => ({
          value: [number(row.startTimeMs), number(row.durationMs)],
          traceId: text(row.traceId),
          rootService: text(row.rootService),
          rootOperation: text(row.rootOperation),
          startTimeMs: number(row.startTimeMs),
          durationMs: number(row.durationMs),
          matchedSpans: number(row.matchedSpans)
        }))
      }))
    }
  }, [searchRows])

  const scatterEvents = useMemo(() => ({
    click: (value: unknown) => {
      const trace = text((value as { data?: { traceId?: unknown } })?.data?.traceId)
      if (trace) void openTrace(trace)
    }
  }), [connectionId, searchRows])

  const exploreSimilar = () => {
    const source = selectedSpan ?? rootSpan
    if (!source) return
    const rawStatus = text(source.status).toUpperCase()
    const next: TraceBuilderState = {
      ...EMPTY_BUILDER,
      serviceNamespace: text(source.serviceNamespace),
      service: text(source.service),
      spanName: text(source.name),
      status: rawStatus.includes('ERROR') ? 'error' : rawStatus.includes('OK') ? 'ok' : 'any'
    }
    setBuilder(next)
    setSql(buildTraceql(next))
    setQueryMode('builder')
    setSpans([])
    setSelectedSpanId('')
    setCohortHint(selectedSpan
      ? 'Builder seeded from the selected span: namespace, service, operation and status. Adjust the cohort definition, then search similar traces.'
      : 'Builder seeded from the trace root. Adjust the cohort definition, then search similar traces.')
  }

  const toggleCollapse = (spanId: string) => setCollapsed((current) => {
    const next = new Set(current)
    next.has(spanId) ? next.delete(spanId) : next.add(spanId)
    return next
  })

  return (
    <section className={styles.root} aria-label="Trace explorer">
      <div className={styles.discoveryPanel}>
        <form className={styles.traceIdBar} onSubmit={submitTraceId}>
          <label htmlFor="trace-id">Trace ID</label>
          <input id="trace-id" value={traceId} onChange={(event) => setTraceId(event.target.value)} spellCheck={false} placeholder="4bf92f3577b34da6a3ce929d0e0e4736" />
          <button className="btn ghost" type="submit" disabled={loading !== null || !traceId.trim()}>{loading === 'trace' ? 'Opening…' : 'Open trace'}</button>
        </form>

        <div className={styles.queryModeRow}>
          <div className={styles.modeSwitch} role="group" aria-label="Trace query mode">
            <button type="button" className={mode === 'builder' ? styles.modeActive : ''} aria-pressed={mode === 'builder'} onClick={() => setQueryMode('builder')}>Builder</button>
            <button type="button" className={mode === 'sql' ? styles.modeActive : ''} aria-pressed={mode === 'sql'} onClick={() => setQueryMode('sql')}>TraceQL</button>
          </div>
          <span>Find traces first; open one to inspect it, then use the selected span to seed a cohort.</span>
        </div>

        <form className={styles.searchForm} onSubmit={submitSearch}>
          {mode === 'builder' ? <div className={styles.builderGrid}>
            <label><span>Namespace</span><input value={builder.serviceNamespace} onChange={(event) => updateBuilder({ serviceNamespace: event.target.value })} placeholder="commerce" /></label>
            <label><span>Service</span><input value={builder.service} onChange={(event) => updateBuilder({ service: event.target.value })} placeholder="checkout-api" /></label>
            <label><span>Span / operation</span><input value={builder.spanName} onChange={(event) => updateBuilder({ spanName: event.target.value })} placeholder="POST /checkout" /></label>
            <label><span>Status</span><select value={builder.status} onChange={(event) => updateBuilder({ status: event.target.value as TraceStatus })}><option value="any">Any</option><option value="error">Error</option><option value="ok">OK</option></select></label>
            <label><span>Min duration (ms)</span><input type="number" min="0" step="1" value={builder.minDurationMs} onChange={(event) => updateBuilder({ minDurationMs: event.target.value })} placeholder="300" /></label>
            <div className={styles.generatedQuery}><span>Generated TraceQL</span><code>{traceql}</code></div>
          </div> : <label className={styles.traceqlField} htmlFor="traceql-query"><span>TraceQL</span><textarea id="traceql-query" value={traceql} onChange={(event) => setSql(event.target.value)} spellCheck={false} rows={3} placeholder="{ resource.service.name = &quot;checkout-api&quot; && duration &gt; 300ms }" /></label>}
          <div className={styles.searchControls}>
            <TimeRangeField value={searchRange} onChange={setSearchRange} />
            <div className={styles.searchActions}><button className="btn primary" type="submit" disabled={loading !== null || !traceql.trim()}>{loading === 'search' ? 'Fetching period…' : 'Search traces'}</button><span>Tempo via gcx · fetches the complete selected period automatically. Saturated windows are split until the range is exhausted.</span></div>
          </div>
        </form>
      </div>

      {cohortHint && <div className={styles.cohortHint} role="status">{cohortHint}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}

      {spans.length > 0 ? <div className={styles.traceView}>
        <header className={styles.traceHeader}>
          <div className={styles.traceTitle}>
            {searchRows.length > 0 && <button type="button" className="btn ghost" onClick={() => { setSpans([]); setSelectedSpanId('') }}>← Search results</button>}
            <div><h2>{text(rootSpan?.service) || 'Trace'} · {text(rootSpan?.name) || text(rootSpan?.traceId)}</h2><code>{text(rootSpan?.traceId)}</code></div>
            <button type="button" className="btn ghost" onClick={exploreSimilar}>Explore similar traces</button>
          </div>
          <dl className={styles.summary}>
            <div><dt>Duration</dt><dd>{durationLabel(traceDuration)}</dd></div>
            <div><dt>Spans</dt><dd>{spans.length}</dd></div>
            <div><dt>Services</dt><dd>{services.size}</dd></div>
            <div><dt>Errors</dt><dd>{errorCount}</dd></div>
          </dl>
        </header>

        {visibleTree.length > MAX_RENDERED_SPANS && <div className={styles.warning}>Showing the first {MAX_RENDERED_SPANS} visible spans. Virtualised rendering remains follow-up work in #88.</div>}

        <div className={`${styles.inspectionArea} ${selectedSpan ? styles.withDetails : styles.waterfallOnly}`}>
          <div className={styles.waterfall}>
            <div className={styles.waterfallHeader}><span>Span tree</span><span>Timeline · {durationLabel(traceDuration)}</span></div>
            {renderedTree.map(({ row: span, id: spanId, depth, hasChildren }) => {
              const offset = traceDuration > 0 ? ((number(span.startTimeMs) - traceStart) / traceDuration) * 100 : 0
              const width = traceDuration > 0 ? Math.max(.35, (number(span.durationMs) / traceDuration) * 100) : 100
              const isError = text(span.status).toUpperCase().includes('ERROR')
              return <div key={spanId} className={`${styles.spanRow} ${selectedSpanId === spanId ? styles.selected : ''}`} data-span-id={spanId}>
                <div className={styles.spanLabel}>
                  <span className={styles.treeGuides} aria-hidden="true">{Array.from({ length: depth }, (_, index) => <span key={index} />)}</span>
                  {hasChildren ? <button type="button" className={styles.caret} aria-label={`${collapsed.has(spanId) ? 'Expand' : 'Collapse'} ${text(span.name) || spanId}`} aria-expanded={!collapsed.has(spanId)} onClick={() => toggleCollapse(spanId)}>{collapsed.has(spanId) ? '▸' : '▾'}</button> : <span className={styles.leafDot} aria-hidden="true">•</span>}
                  <button type="button" className={styles.spanIdentity} onClick={() => setSelectedSpanId(spanId)} aria-pressed={selectedSpanId === spanId}>
                    <strong>{text(span.service) || 'unknown'}</strong><span>{text(span.name) || spanId}</span>
                  </button>
                </div>
                <button type="button" className={styles.timeline} onClick={() => setSelectedSpanId(spanId)} aria-label={`Select ${text(span.service)} ${text(span.name)}, ${durationLabel(number(span.durationMs))}`}>
                  <span className={`${styles.bar} ${isError ? styles.errorBar : ''}`} style={{ left: `${offset}%`, width: `${Math.min(width, 100 - offset)}%` }}><span>{durationLabel(number(span.durationMs))}</span></span>
                </button>
              </div>
            })}
          </div>
          {selectedSpan && <SpanInspector span={selectedSpan} traceStart={traceStart} onClose={() => setSelectedSpanId('')} />}
        </div>
      </div> : <div className={styles.searchResults}>
        <header className={styles.resultsHeader}>
          <div><h2>Trace search</h2><p>{searchNotice || 'Use the Builder or TraceQL to find candidate traces.'}</p></div>
          <div className={styles.resultsHeaderActions}>
            {searchRows.length > 0 && <div className={styles.resultViewSwitch} role="group" aria-label="Trace search result view">
              <button type="button" className={resultView === 'list' ? styles.modeActive : ''} aria-pressed={resultView === 'list'} onClick={() => setResultView('list')}>List</button>
              <button type="button" className={resultView === 'scatter' ? styles.modeActive : ''} aria-pressed={resultView === 'scatter'} onClick={() => setResultView('scatter')}>Scatter</button>
            </div>}
            {searchRows.length > 0 && <strong>{searchRows.length} traces</strong>}
          </div>
        </header>
        {searchRows.length === 0 ? <div className={styles.empty}>{loading === 'search' ? 'Fetching the complete Tempo period…' : 'Search for a trace by service, operation, status or duration; use Trace ID above when you already know the exact trace.'}</div>
          : <>
              {resultView === 'scatter' ? <div className={styles.scatter} data-trace-scatter=""><ReactECharts option={scatterOption} onEvents={scatterEvents} notMerge lazyUpdate style={{ width: '100%', height: '100%' }} /></div>
                : <div className={styles.traceList}>{searchRows.map((row) => {
                  const status = resultStatus(row)
                  return <button key={text(row.traceId)} type="button" className={styles.traceResult} onClick={() => void openTrace(text(row.traceId))} disabled={loading !== null}>
                    <span className={styles.resultIdentity}><span className={`${styles.resultStatus} ${status === 'error' ? styles.resultStatusError : status === 'ok' ? styles.resultStatusOk : styles.resultStatusUnknown}`} aria-label={status === 'error' ? 'Error trace' : status === 'ok' ? 'Successful trace' : 'Trace status unknown'} /><span><strong>{text(row.rootService) || 'unknown service'}</strong><span>{text(row.rootOperation) || text(row.traceId)}</span></span></span>
                    <span className={styles.resultMeta}><strong>{durationLabel(number(row.durationMs))}</strong><span>{dateTimeLabel(number(row.startTimeMs))}</span><span>{number(row.matchedSpans) ? `${number(row.matchedSpans)} matched spans` : text(row.traceId)}</span></span>
                  </button>
                })}</div>}
            </>}
      </div>}
    </section>
  )
}
