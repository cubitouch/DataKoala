import { TextInput } from './ui/TextInput'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { QueryResult } from '@shared/types'
import type { TempoAttribute, TempoSearchProgress } from '@shared/tempo'
import { api } from '../lib/api'
import { selectActiveSession, useStore } from '../store/useStore'
import { TimeRangeField } from './time-range/TimeRangeField'
import { TraceScatterChart } from './TraceScatterChart'
import { TraceBuilderPanel } from './TraceBuilderPanel'
import { Combobox } from './ui/combobox'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { tempoAttributes, tempoAttributeValues } from '../lib/tempoMetadata'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { buildTraceql, traceBuilderFromSpan, traceBuilderFromTraceql, type TraceBuilderState, type TraceSampleSize } from '../lib/traceBuilder'
import {
  buildTraceTimelineScale,
  buildVisibleTraceTree,
  canonicalTraceId,
  openedTraceStatus,
  traceResultStatus,
  traceSpanKind,
  traceSpanKindLabel,
  traceSpanKinds,
  visibleSpanCount,
  withoutAsyncTraceBranches,
  type TraceRow
} from '../lib/traceViewer'
import styles from './TraceExplorer.module.css'
import { traceql as traceqlSupport } from '../lib/traceqlLanguage'
import { formatTraceql } from '../lib/formatTraceql'
import { notify } from './NotificationArea'
import { ModeSwitch } from './ModeSwitch'
import { QueryUtilityActions } from './QueryUtilityActions'
import { CopySqlButton } from './CopySqlButton'
import { defaultQueryTextForDatasource } from '../lib/queryDefaults'

interface TraceExplorerProps {
  connectionId: string
}

type ResultView = 'list' | 'scatter'

const MAX_RENDERED_SPANS = 500
const DEFAULT_TRACE_RANGE: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }
const DEFAULT_TRACE_SAMPLE_SIZE: TraceSampleSize = '250'
const TRACE_SAMPLE_SIZE_OPTIONS = [
  { value: '100', label: '100 traces' },
  { value: '250', label: '250 traces' },
  { value: '500', label: '500 traces' },
  { value: 'all', label: 'All traces' }
]

interface RenderedTimelineGap {
  key: string
  left: number
  width: number
  durationMs: number
}

export function TimelineGapOverlay({ gaps }: { gaps: RenderedTimelineGap[] }) {
  return <div className={styles.timelineGapOverlay} aria-hidden="true">
    <div className={styles.timelineGapLayer}>
      {gaps.map((gap) => <span
        key={gap.key}
        className={styles.timelineGap}
        data-trace-idle-gap=""
        style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
        title={`Compressed idle gap · ${periodLabel(gap.durationMs)}`}
      />)}
    </div>
  </div>
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function tempoPerf(event: string, fields: Record<string, unknown>): void {
  if (api.tempoPerformanceEnabled) console.info(`[tempo-perf] ${JSON.stringify({ event, ...fields })}`)
}

function durationLabel(milliseconds: number): string {
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`
  if (milliseconds >= 1) return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`
  return `${Math.max(0, milliseconds * 1_000).toFixed(0)}µs`
}

function periodLabel(milliseconds: number): string {
  if (milliseconds >= 3_600_000) return `${(milliseconds / 3_600_000).toFixed(milliseconds % 3_600_000 === 0 ? 0 : 1)}h`
  if (milliseconds >= 60_000) return `${(milliseconds / 60_000).toFixed(milliseconds % 60_000 === 0 ? 0 : 1)}m`
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds % 1_000 === 0 ? 0 : 1)}s`
  return `${Math.max(0, Math.round(milliseconds))}ms`
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

function mergeSearchRows(existing: TraceRow[], incoming: TraceRow[]): TraceRow[] {
  const merged = new Map(existing.map((row) => [text(row.traceId), row]))
  for (const row of incoming) {
    const traceId = text(row.traceId)
    if (!traceId) continue
    const previous = merged.get(traceId)
    const previousStatus = previous ? traceResultStatus(previous) : 'unknown'
    const nextStatus = traceResultStatus(row)
    merged.set(traceId, previous && previousStatus !== 'unknown' && nextStatus === 'unknown'
      ? { ...row, status: previous.status }
      : row)
  }
  return [...merged.values()].sort((left, right) => {
    const byTime = number(right.startTimeMs) - number(left.startTimeMs)
    return byTime || text(left.traceId).localeCompare(text(right.traceId))
  })
}

export function TraceExplorer({ connectionId }: TraceExplorerProps) {
  const mode = useStore((state) => selectActiveSession(state).queryMode)
  const traceql = useStore((state) => selectActiveSession(state).sql)
  const metadata = useStore((state) => state.metadataByProfileId[connectionId])
  const connected = useStore((state) => state.connected)
  const connectionGeneration = useStore((state) => state.connectionGeneration)
  const setSql = useStore((state) => state.setSql)
  const setQueryMode = useStore((state) => state.setQueryMode)
  const [builder, setBuilder] = useState<TraceBuilderState>(() => traceBuilderFromTraceql(traceql))
  const [traceId, setTraceId] = useState('')
  const [searchRows, setSearchRows] = useState<TraceRow[]>([])
  const [spans, setSpans] = useState<TraceRow[]>([])
  const [searchNotice, setSearchNotice] = useState('')
  const [searchProgress, setSearchProgress] = useState<TempoSearchProgress | null>(null)
  const [selectedSpanId, setSelectedSpanId] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [hiddenSpanKinds, setHiddenSpanKinds] = useState<Set<string>>(new Set())
  const [hideAsyncBranches, setHideAsyncBranches] = useState(true)
  const [compressIdleGaps, setCompressIdleGaps] = useState(true)
  const [loading, setLoading] = useState<'search' | 'trace' | null>(null)
  const [error, setError] = useState('')
  const [cohortHint, setCohortHint] = useState('')
  const [searchRange, setSearchRange] = useState<BuilderTimeRange>(DEFAULT_TRACE_RANGE)
  const [sampleSize, setSampleSize] = useState<TraceSampleSize>(DEFAULT_TRACE_SAMPLE_SIZE)
  const [resultView, setResultView] = useState<ResultView>('list')
  const [messagingSystems, setMessagingSystems] = useState<string[]>([])
  const [messagingSystemsLoading, setMessagingSystemsLoading] = useState(false)
  const [messagingSystemsError, setMessagingSystemsError] = useState<string | null>(null)
  const [attributes, setAttributes] = useState<TempoAttribute[]>([])
  const [attributesLoading, setAttributesLoading] = useState(false)
  const [attributesError, setAttributesError] = useState<string | null>(null)
  const [advancedValues, setAdvancedValues] = useState<Record<string, string[]>>({})
  const [advancedValuesLoading, setAdvancedValuesLoading] = useState<Record<string, boolean>>({})
  const [advancedValuesError, setAdvancedValuesError] = useState<Record<string, string | null>>({})
  const traceRenderTiming = useRef<{ started: number; requestId?: string; spanCount: number } | null>(null)
  const traceqlEditorRef = useRef<ReactCodeMirrorRef>(null)
  const traceqlExtensions = useMemo(() => [traceqlSupport()], [])

  const formatCurrentTraceql = () => {
    if (mode !== 'sql' || !traceql.trim()) return
    const result = formatTraceql(traceql)
    if (!result.ok) {
      notify({ message: result.error, duration: 3200 })
      return
    }
    const view = traceqlEditorRef.current?.view
    if (view) {
      const anchor = Math.min(view.state.selection.main.anchor, result.query.length)
      const head = Math.min(view.state.selection.main.head, result.query.length)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.query }, selection: { anchor, head }, userEvent: 'input.format' })
      view.focus()
    } else setSql(result.query)
    notify({ message: 'Formatted', duration: 2600 })
  }

  const onTraceqlKeyDown = (event: React.KeyboardEvent) => {
    if (mode === 'sql' && event.shiftKey && event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      formatCurrentTraceql()
    }
  }

  useEffect(() => {
    const timing = traceRenderTiming.current
    if (!timing || spans.length !== timing.spanCount) return
    const frame = requestAnimationFrame(() => {
      tempoPerf('trace.rendered', { requestId: timing.requestId, elapsedMs: performance.now() - timing.started, spanCount: timing.spanCount, milestone: 'animation-frame-after-commit' })
      traceRenderTiming.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [spans])

  useEffect(() => {
    if (mode === 'sql') setBuilder(traceBuilderFromTraceql(traceql))
  }, [mode, traceql])

  useEffect(() => {
    setBuilder(traceBuilderFromTraceql(traceql))
  }, [connectionId])

  useEffect(() => {
    setSearchRows([])
    setSpans([])
    setTraceId('')
    setSelectedSpanId('')
    setCollapsed(new Set())
    setHiddenSpanKinds(new Set())
    setHideAsyncBranches(true)
    setCompressIdleGaps(true)
    setError('')
    setCohortHint('')
    setSearchRange(DEFAULT_TRACE_RANGE)
    setSampleSize(DEFAULT_TRACE_SAMPLE_SIZE)
    setResultView('list')
    setSearchProgress(null)
  }, [connectionId])

  useEffect(() => {
    if (!connected || mode !== 'builder' || builder.protocol !== 'messaging') {
      setMessagingSystems([])
      setMessagingSystemsLoading(false)
      setMessagingSystemsError(null)
      return
    }
    let current = true
    setMessagingSystems([])
    setMessagingSystemsLoading(true)
    setMessagingSystemsError(null)
    void tempoAttributeValues(connectionId, connectionGeneration, 'span.messaging.system').then(
      (values) => { if (current) setMessagingSystems(values) },
      (metadataError: unknown) => { if (current) setMessagingSystemsError(metadataError instanceof Error ? metadataError.message : String(metadataError)) }
    ).finally(() => { if (current) setMessagingSystemsLoading(false) })
    return () => { current = false }
  }, [builder.protocol, connected, connectionGeneration, connectionId, mode])

  useEffect(() => {
    if (!connected || mode !== 'builder') { setAttributes([]); setAttributesLoading(false); setAttributesError(null); return }
    let current = true
    setAttributes([]); setAttributesLoading(true); setAttributesError(null)
    void tempoAttributes(connectionId, connectionGeneration).then(
      (items) => { if (current) setAttributes(items) },
      (reason: unknown) => { if (current) setAttributesError(reason instanceof Error ? reason.message : String(reason)) }
    ).finally(() => { if (current) setAttributesLoading(false) })
    return () => { current = false }
  }, [connected, connectionGeneration, connectionId, mode])

  const advancedDiscoveryBaseContext = buildTraceql({ ...builder, advancedFilters: [] })
  useEffect(() => {
    const filters = builder.advancedFilters
    if (!connected || mode !== 'builder' || !filters.length) { setAdvancedValues({}); setAdvancedValuesLoading({}); setAdvancedValuesError({}); return }
    let current = true
    const selected = new Set(filters.map((filter) => filter.attribute))
    setAdvancedValues((values) => Object.fromEntries(Object.entries(values).filter(([attribute]) => selected.has(attribute))))
    setAdvancedValuesError({})
    setAdvancedValuesLoading(Object.fromEntries(filters.map((filter) => [filter.attribute, true])))
    const timer = window.setTimeout(() => {
      for (const filter of filters) {
        const context = buildTraceql({ ...builder, advancedFilters: filters.filter((candidate) => candidate.attribute !== filter.attribute) })
        void tempoAttributeValues(connectionId, connectionGeneration, filter.attribute, context === '{ }' ? undefined : context).then(
          (items) => { if (current) setAdvancedValues((values) => ({ ...values, [filter.attribute]: items })) },
          (reason: unknown) => { if (current) setAdvancedValuesError((errors) => ({ ...errors, [filter.attribute]: reason instanceof Error ? reason.message : String(reason) })) }
        ).finally(() => { if (current) setAdvancedValuesLoading((loading) => ({ ...loading, [filter.attribute]: false })) })
      }
    }, 200)
    return () => { current = false; window.clearTimeout(timer) }
  }, [advancedDiscoveryBaseContext, builder.advancedFilters, connected, connectionGeneration, connectionId, mode])

  const runSearch = async (sampleOverride: TraceSampleSize = sampleSize, rangeOverride: BuilderTimeRange = searchRange) => {
    const request = traceql.trim()
    if (!request) return
    if (rangeOverride.recurringWindows?.some((window) => window.from || window.to)) {
      setError('Recurring daily windows are not supported for Tempo trace searches yet. Choose a continuous range.')
      return
    }
    let range: { start: string; end: string }
    try {
      range = prometheusRangeBounds(rangeOverride)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return
    }

    const sampled = sampleOverride !== 'all'
    const perfStarted = performance.now()
    let firstUsefulResult = false
    const tempoSearchRequest = {
      start: range.start,
      end: range.end,
      ...(sampled ? { sampleSize: Number(sampleOverride) } : {})
    }

    setLoading('search')
    setError('')
    setCohortHint('')
    setSearchRows([])
    setSpans([])
    setSelectedSpanId('')
    setCollapsed(new Set())
    setSearchProgress(null)
    setSearchNotice(sampled
      ? `Fetching a quick sample of up to ${sampleOverride} traces across the selected period…`
      : 'Fetching the complete selected period…')
    try {
      const result = await api.query.run(connectionId, request, [], tempoSearchRequest, (progress, requestId) => {
        if (!firstUsefulResult && progress.rows.length > 0) {
          firstUsefulResult = true
          tempoPerf('search.first-result-renderer', { requestId, elapsedMs: performance.now() - perfStarted, rowsInBatch: progress.rows.length, tracesFound: progress.tracesFound, sampleSize: sampleOverride })
        }
        setSearchProgress(progress)
        setSearchRows((current) => mergeSearchRows(current, progress.rows))
      })
      if (isSpanResult(result)) throw new Error('TraceQL search returned a trace instead of search results.')
      setSearchRows(result.rows)
      setSearchNotice(result.notice ?? '')
      setSearchProgress(null)
      tempoPerf('search.final-renderer', { requestId: result.execution?.requestId, elapsedMs: performance.now() - perfStarted, rowCount: result.rows.length, sampleSize: sampleOverride })
    } catch (reason) {
      setSearchNotice(sampled
        ? 'Sample search stopped before Tempo returned its bounded result set.'
        : 'Search stopped before the selected period was fully covered; partial results found so far are shown.')
      setSearchProgress(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(null) }
  }

  const openTrace = async (candidate = traceId) => {
    const request = canonicalTraceId(candidate)
    if (!request) {
      setError('Trace ID must be a hexadecimal identifier up to 32 characters.')
      return
    }
    setTraceId(request)
    setLoading('trace')
    setError('')
    setCohortHint('')
    const perfStarted = performance.now()
    const openSource = searchRows.some((row) => canonicalTraceId(row.traceId) === request) ? 'search-result' : 'direct-id'
    try {
      const result = await api.query.run(connectionId, request, [], undefined, undefined, true)
      tempoPerf('trace.result-renderer', { requestId: result.execution?.requestId, elapsedMs: performance.now() - perfStarted, spanCount: result.rows.length, openSource })
      if (isSpanResult(result)) {
        traceRenderTiming.current = { started: perfStarted, requestId: result.execution?.requestId, spanCount: result.rows.length }
        setSpans(result.rows)
        setSelectedSpanId('')
        setCollapsed(new Set())
        const status = openedTraceStatus(result.rows)
        if (status !== 'unknown') {
          setSearchRows((current) => current.map((row) => canonicalTraceId(row.traceId) === request ? { ...row, status } : row))
        }
      } else {
        throw new Error('Tempo returned search results instead of the requested trace.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setLoading(null) }
  }

  const updateBuilder = (patch: Partial<TraceBuilderState>) => {
    const next = { ...builder, ...patch }
    const raw = buildTraceql(next)
    const formatted = formatTraceql(raw)
    setBuilder(next)
    setSql(formatted.ok ? formatted.query : raw)
  }

  const submitTraceId = (event: FormEvent) => { event.preventDefault(); void openTrace() }
  const submitSearch = (event: FormEvent) => { event.preventDefault(); void runSearch() }

  const sortedSpans = useMemo(() => [...spans].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs)), [spans])
  const spanKinds = useMemo(() => traceSpanKinds(sortedSpans), [sortedSpans])
  const viewerSpans = useMemo(() => hideAsyncBranches ? withoutAsyncTraceBranches(sortedSpans) : sortedSpans, [sortedSpans, hideAsyncBranches])
  const asyncPrunedCount = sortedSpans.length - viewerSpans.length
  const filteredSpanCount = useMemo(() => visibleSpanCount(viewerSpans, hiddenSpanKinds), [viewerSpans, hiddenSpanKinds])
  const visibleTree = useMemo(() => buildVisibleTraceTree(viewerSpans, collapsed, hiddenSpanKinds), [viewerSpans, collapsed, hiddenSpanKinds])
  const renderedTree = visibleTree.slice(0, MAX_RENDERED_SPANS)
  const timelineSpans = useMemo(() => viewerSpans.filter((row) => !hiddenSpanKinds.has(traceSpanKind(row))), [viewerSpans, hiddenSpanKinds])
  const timelineScale = useMemo(() => buildTraceTimelineScale(timelineSpans, compressIdleGaps), [timelineSpans, compressIdleGaps])
  const renderedTimelineGaps = useMemo(() => timelineScale.gaps.map((gap, index) => {
    const left = timelineScale.offsetPercent(gap.startMs)
    const right = timelineScale.offsetPercent(gap.endMs)
    return {
      key: `${gap.startMs}-${gap.endMs}-${index}`,
      left,
      width: Math.max(.45, right - left),
      durationMs: gap.durationMs
    }
  }), [timelineScale])
  const traceStart = sortedSpans.length ? Math.min(...sortedSpans.map((row) => number(row.startTimeMs))) : 0
  const traceEnd = sortedSpans.length ? Math.max(...sortedSpans.map((row) => number(row.startTimeMs) + number(row.durationMs))) : 0
  const traceDuration = Math.max(0, traceEnd - traceStart)
  const services = useMemo(() => new Set(sortedSpans.map((row) => text(row.service)).filter(Boolean)), [sortedSpans])
  const errorCount = useMemo(() => sortedSpans.filter((row) => text(row.status).toUpperCase().includes('ERROR')).length, [sortedSpans])
  const rootSpan = sortedSpans.find((row) => !text(row.parentSpanId)) ?? sortedSpans[0]
  const selectedSpanCandidate = sortedSpans.find((row) => text(row.spanId) === selectedSpanId)
  const selectedSpanVisible = selectedSpanCandidate && viewerSpans.some((row) => text(row.spanId) === selectedSpanId)
  const selectedSpan = selectedSpanVisible && !hiddenSpanKinds.has(traceSpanKind(selectedSpanCandidate)) ? selectedSpanCandidate : undefined
  const sampledSearch = sampleSize !== 'all'
  const hasAsyncKinds = spanKinds.some((kind) => kind === 'PRODUCER' || kind === 'CONSUMER')
  const progressPercent = searchProgress?.totalMs
    ? Math.min(100, Math.round((searchProgress.coveredMs / searchProgress.totalMs) * 100))
    : 0
  const currentChunkCount = searchProgress
    ? searchProgress.completedChunks + searchProgress.pendingChunks
    : 0

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
        scale: true,
        name: 'Duration',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          color: '#9aa4b2',
          formatter: (value: number) => durationLabel(number(value))
        },
        axisLine: { lineStyle: { color: '#3b424d' } },
        splitLine: { lineStyle: { color: '#262c35' } }
      },
      series: groups.map((group) => ({
        name: group.name,
        type: 'scatter',
        symbolSize: 11,
        itemStyle: { color: group.color },
        emphasis: { scale: 1.45 },
        data: searchRows.filter((row) => traceResultStatus(row) === group.key).map((row) => ({
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
    const next = traceBuilderFromSpan(source)
    setBuilder(next)
    setSql(buildTraceql(next))
    setQueryMode('builder')
    setSpans([])
    setSelectedSpanId('')
    setCohortHint(selectedSpan
      ? 'Builder seeded from the selected span semantic attributes: service, span kind, protocol/operation and status when available. Adjust the cohort definition, then search similar traces.'
      : 'Builder seeded from the trace root semantic attributes. Adjust the cohort definition, then search similar traces.')
  }

  const toggleCollapse = (spanId: string) => setCollapsed((current) => {
    const next = new Set(current)
    next.has(spanId) ? next.delete(spanId) : next.add(spanId)
    return next
  })

  const toggleSpanKind = (kind: string) => setHiddenSpanKinds((current) => {
    const next = new Set(current)
    next.has(kind) ? next.delete(kind) : next.add(kind)
    return next
  })

  const changeSampleSize = (next: TraceSampleSize) => {
    const shouldRerun = searchRows.length > 0 || !!searchNotice
    setSampleSize(next)
    if (shouldRerun && traceql.trim()) void runSearch(next)
  }

  const clearTempoResults = () => {
    setSearchRows([])
    setSpans([])
    setTraceId('')
    setSelectedSpanId('')
    setCollapsed(new Set())
    setSearchProgress(null)
    setSearchNotice('')
    setError('')
    setCohortHint('')
    setResultView('list')
  }

  const resetTempoQuery = () => {
    const freshTraceql = defaultQueryTextForDatasource('tempo')
    setSql(freshTraceql)
    setBuilder(traceBuilderFromTraceql(freshTraceql))
    setSearchRange(DEFAULT_TRACE_RANGE)
    setSampleSize(DEFAULT_TRACE_SAMPLE_SIZE)
    setQueryMode('builder')
    clearTempoResults()
  }

  const timelineLabel = timelineScale.gaps.length > 0
    ? `Idle gaps compressed · ${durationLabel(timelineScale.wallDurationMs)} visible wall time → ${durationLabel(timelineScale.displayDurationMs)} visual scale${Math.abs(timelineScale.wallDurationMs - traceDuration) > .5 ? ` · full trace ${durationLabel(traceDuration)}` : ''}`
    : Math.abs(timelineScale.wallDurationMs - traceDuration) > .5
      ? `Visible timeline · ${durationLabel(timelineScale.wallDurationMs)} · full trace ${durationLabel(traceDuration)}`
      : `Timeline · ${durationLabel(traceDuration)}`
  const timelineTicks = [0, 25, 50, 75, 100].map((position) => ({
    position,
    label: `+${periodLabel(Math.max(0, timelineScale.timeAtPercent(position) - traceStart))}`
  }))

  return (
    <section className={styles.root} aria-label="Trace explorer">
      <div className={styles.discoveryPanel}>
        <form className={styles.traceIdBar} onSubmit={submitTraceId}>
          <TextInput label="Trace ID" mode="inline" id="trace-id" value={traceId} onValueChange={setTraceId} spellCheck={false} placeholder="4bf92f3577b34da6a3ce929d0e0e4736" />
          <button className="btn ghost" type="submit" disabled={loading !== null || !traceId.trim()}>{loading === 'trace' ? 'Opening…' : 'Open trace'}</button>
        </form>

        <form className={styles.searchForm} onSubmit={submitSearch} onKeyDown={onTraceqlKeyDown}>
          <div className={`editor-head data-query-toolbar ${styles.queryToolbar}`} data-query-toolbar>
            <div className="query-toolbar-group query-mode-group"><ModeSwitch /></div>
            <div className={`query-toolbar-group query-time-group ${styles.queryOptions}`} aria-label="Tempo query options">
              <TimeRangeField value={searchRange} onChange={setSearchRange} />
              <div className={styles.sampleSize}><Combobox label="Sample size" mode="inline" value={sampleSize} options={TRACE_SAMPLE_SIZE_OPTIONS} onChange={(value) => changeSampleSize(value as TraceSampleSize)} disabled={loading !== null} /></div>
            </div>
            <div className="spacer" />
            <div className="query-toolbar-group"><QueryUtilityActions hasResults={Boolean(searchRows.length || spans.length || searchNotice || searchProgress || error || cohortHint)} onClearResults={clearTempoResults} onResetQuery={resetTempoQuery} /></div>
            <div className={`query-toolbar-group query-editor-actions ${styles.editorActions}`}>
              {mode === 'sql' && <button type="button" className="btn ghost" onClick={formatCurrentTraceql} title="Format TraceQL (Shift+Alt+F)" disabled={!traceql.trim()}>Format</button>}
              <CopySqlButton sql={traceql} language="TraceQL" />
            </div>
            <div className="query-toolbar-group execution-group"><button className="btn primary" type="submit" data-tempo-run-query disabled={loading !== null || !traceql.trim()}>{loading === 'search' ? 'Running…' : 'Run'}</button></div>
          </div>
          {mode === 'builder'
            ? <TraceBuilderPanel value={builder} traceql={traceql} schemas={metadata?.schemas ?? []} metadataStatus={metadata?.status ?? 'idle'} metadataError={metadata?.error ?? null} messagingSystems={messagingSystems} messagingSystemsLoading={messagingSystemsLoading} messagingSystemsError={messagingSystemsError} attributes={attributes} attributesLoading={attributesLoading} attributesError={attributesError} attributeValues={advancedValues} attributeValuesLoading={advancedValuesLoading} attributeValuesError={advancedValuesError} onChange={updateBuilder} onOpenTraceql={() => { setSql(traceql); setQueryMode('sql') }} />
            : <div className={styles.traceqlField}>
              <CodeMirror ref={traceqlEditorRef} value={traceql} minHeight="66px" maxHeight="160px" theme={oneDark} extensions={traceqlExtensions} onChange={(value) => setSql(value)} aria-label="TraceQL editor" placeholder={'{ resource.service.name = "checkout-api" && duration > 300ms }'} basicSetup={{ lineNumbers: true, foldGutter: false }} />
            </div>}
          <div className={styles.searchHelper}>{sampledSearch
            ? `Tempo via gcx · returns up to ${sampleSize} matches from one whole-period search; choose All for exhaustive coverage.`
            : 'Tempo via gcx · streams trace summaries while it exhausts the complete selected period.'}</div>
        </form>
      </div>

      {cohortHint && <div className={styles.cohortHint} role="status">{cohortHint}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading === 'trace' && <div className={styles.warning} role="status" aria-live="polite"><strong>Opening trace…</strong> Fetching the full span tree from Tempo via gcx for <code>{traceId}</code>.</div>}
      {loading === 'search' && <div className={styles.warning} role="status" aria-live="polite">
        {sampledSearch ? <strong>Fetching up to {sampleSize} Tempo traces across the selected period…</strong> : searchProgress ? <>
          <div><strong>Fetching Tempo…</strong> {periodLabel(searchProgress.coveredMs)} / {periodLabel(searchProgress.totalMs)} covered ({progressPercent}%) · {searchProgress.completedChunks}/{currentChunkCount || 1} current chunks · {searchProgress.tracesFound} traces found · {searchProgress.queriesCompleted} {searchProgress.queriesCompleted === 1 ? 'query' : 'queries'}</div>
          <progress value={searchProgress.coveredMs} max={Math.max(1, searchProgress.totalMs)} aria-label={`Tempo search ${progressPercent}% complete`} style={{ width: '100%', marginTop: 6 }} />
        </> : <strong>Starting exhaustive Tempo search…</strong>}
      </div>}

      {spans.length > 0 ? <div className={styles.traceView} aria-busy={loading === 'trace'}>
        <header className={styles.traceHeader}>
          <div className={styles.traceTitle}>
            {searchRows.length > 0 && <button type="button" className="btn ghost" onClick={() => { setSpans([]); setSelectedSpanId('') }}>← Search results</button>}
            <div><h2>{text(rootSpan?.service) || 'Trace'} · {text(rootSpan?.name) || text(rootSpan?.traceId)}</h2><code>{text(rootSpan?.traceId)}</code></div>
            <button type="button" className="btn ghost" onClick={exploreSimilar}>Explore similar traces</button>
          </div>
          <dl className={styles.summary}>
            <div><dt>Duration</dt><dd>{durationLabel(traceDuration)}</dd></div>
            <div><dt>Spans</dt><dd>{filteredSpanCount === spans.length ? spans.length : `${filteredSpanCount}/${spans.length}`}</dd></div>
            <div><dt>Services</dt><dd>{services.size}</dd></div>
            <div><dt>Errors</dt><dd>{errorCount}</dd></div>
          </dl>
        </header>

        {spanKinds.length > 0 && <div className={styles.queryModeRow} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
          <span>Span kind</span>
          <div className={styles.modeSwitch} role="group" aria-label="Visible span kinds">
            {spanKinds.map((kind) => {
              const visible = !hiddenSpanKinds.has(kind)
              const count = sortedSpans.filter((row) => traceSpanKind(row) === kind).length
              return <button key={kind} type="button" className={visible ? styles.modeActive : ''} aria-pressed={visible} onClick={() => toggleSpanKind(kind)} title={kind === 'INTERNAL' ? 'In-process/code spans; turn this off to reduce application-code noise.' : `Show or hide ${kind} spans`} style={{ display: 'grid', justifyItems: 'center', minWidth: 82, height: 'auto', padding: '5px 10px', lineHeight: 1.15 }}><span>{traceSpanKindLabel(kind)}</span><strong style={{ marginTop: 3, fontSize: 11, fontWeight: 500 }}>{count}</strong></button>
            })}
          </div>
          <span>{filteredSpanCount}/{spans.length} shown{hideAsyncBranches && asyncPrunedCount > 0 ? ` · ${asyncPrunedCount} async-branch spans hidden` : ''}.</span>
          {hasAsyncKinds && <button type="button" className="btn ghost" aria-pressed={hideAsyncBranches} onClick={() => setHideAsyncBranches((current) => !current)} title="Hide non-root Producer/Consumer branches and their descendants so delayed messaging work does not dominate the waterfall.">{hideAsyncBranches ? 'Show async branches' : 'Hide async branches'}</button>}
          <button type="button" className="btn ghost" aria-pressed={compressIdleGaps} onClick={() => setCompressIdleGaps((current) => !current)} title="Compress long periods with no visible leaf-span activity. Span ordering and real duration labels remain unchanged; shaded breaks mark transformed idle time.">{compressIdleGaps ? 'Use wall-clock scale' : 'Compress idle gaps'}</button>
          {hiddenSpanKinds.size > 0 && <button type="button" className="btn ghost" onClick={() => setHiddenSpanKinds(new Set())}>Show all kinds</button>}
        </div>}

        {visibleTree.length > MAX_RENDERED_SPANS && <div className={styles.warning}>Showing the first {MAX_RENDERED_SPANS} visible spans. Virtualised rendering remains follow-up work in #88.</div>}

        <div className={`${styles.inspectionArea} ${selectedSpan ? styles.withDetails : styles.waterfallOnly}`}>
          <div className={styles.waterfall}>
            <div className={styles.waterfallHeader}>
              <span>Span tree · {filteredSpanCount}/{spans.length} visible</span>
              <div className={styles.timelineHeader}>
                <span className={styles.timelineDescription}>{timelineLabel}</span>
                <div className={styles.timelineTicks} aria-label="Time relative to trace start">
                  {timelineTicks.map((tick) => <span key={tick.position} style={{ left: `${tick.position}%`, transform: tick.position === 0 ? 'none' : tick.position === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{tick.label}</span>)}
                </div>
              </div>
            </div>
            {renderedTree.length === 0 ? <div className={styles.warning}>No spans match the current trace filters.</div> : <div className={styles.waterfallBody}>
              <TimelineGapOverlay gaps={renderedTimelineGaps} />
              {renderedTree.map(({ row: span, id: spanId, depth, hasChildren }) => {
              const offset = timelineScale.offsetPercent(number(span.startTimeMs))
              const width = Math.max(0, Math.min(timelineScale.widthPercent(number(span.startTimeMs), number(span.durationMs)), 100 - offset))
              const isError = text(span.status).toUpperCase().includes('ERROR')
              return <div key={spanId} className={`${styles.spanRow} ${selectedSpanId === spanId ? styles.selected : ''}`} data-span-id={spanId}>
                <div className={styles.spanLabel}>
                  <span className={styles.treeGuides} aria-hidden="true">{Array.from({ length: depth }, (_, index) => <span key={index} />)}</span>
                  {hasChildren ? <button type="button" className={styles.caret} aria-label={`${collapsed.has(spanId) ? 'Expand' : 'Collapse'} ${text(span.name) || spanId}`} aria-expanded={!collapsed.has(spanId)} onClick={() => toggleCollapse(spanId)}>{collapsed.has(spanId) ? '▸' : '▾'}</button> : <span className={styles.leafDot} aria-hidden="true">•</span>}
                  <button type="button" className={styles.spanIdentity} onClick={() => setSelectedSpanId(spanId)} aria-pressed={selectedSpanId === spanId}>
                    <strong>{text(span.service) || 'unknown'}</strong><span>{text(span.name) || spanId}</span>
                  </button>
                </div>
                <button type="button" className={styles.timeline} onClick={() => setSelectedSpanId(spanId)} aria-label={`Select ${text(span.service)} ${text(span.name)}, starts +${periodLabel(Math.max(0, number(span.startTimeMs) - traceStart))}, lasts ${durationLabel(number(span.durationMs))}`}>
                  <span className={`${styles.bar} ${isError ? styles.errorBar : ''}`} style={{ left: `${offset}%`, width: `${width}%`, minWidth: '1px' }}><span>{durationLabel(number(span.durationMs))}</span></span>
                </button>
              </div>
              })}
            </div>}
          </div>
          {selectedSpan && <SpanInspector span={selectedSpan} traceStart={traceStart} onClose={() => setSelectedSpanId('')} />}
        </div>
      </div> : <div className={styles.searchResults} aria-busy={loading !== null}>
        <header className={styles.resultsHeader}>
          <div><h2>Trace search</h2><p>{searchNotice || 'Use the Builder or TraceQL to find candidate traces.'}</p></div>
          <div className={styles.resultsHeaderActions}>
            {searchRows.length > 0 && <div className={styles.resultViewSwitch} role="group" aria-label="Trace search result view">
              <button type="button" className={resultView === 'list' ? styles.modeActive : ''} aria-pressed={resultView === 'list'} onClick={() => setResultView('list')}>List</button>
              <button type="button" className={resultView === 'scatter' ? styles.modeActive : ''} aria-pressed={resultView === 'scatter'} onClick={() => setResultView('scatter')}>Scatter</button>
            </div>}
            {searchRows.length > 0 && <strong>{searchRows.length} traces{loading === 'search' ? ' so far' : ''}</strong>}
          </div>
        </header>
        {searchRows.length === 0 ? <div className={styles.empty}>{loading === 'search' ? 'Waiting for the first Tempo trace summaries…' : 'Search for a trace by service, operation, status or duration; use Trace ID above when you already know the exact trace.'}</div>
          : <>
              {resultView === 'scatter' ? <div className={styles.scatter} data-trace-scatter=""><TraceScatterChart option={scatterOption} searchRange={searchRange} onEvents={scatterEvents} onSelectRange={(next) => { setSearchRange(next); void runSearch(sampleSize, next) }} /></div>
                : <div className={styles.traceList}>{searchRows.map((row) => {
                  const status = traceResultStatus(row)
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
