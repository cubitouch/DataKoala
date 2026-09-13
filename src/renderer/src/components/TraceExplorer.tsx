import { TextInput } from './ui/TextInput'
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { QueryResult } from '@shared/types'
import type { TempoAttribute, TempoSearchProgress } from '@shared/tempo'
import { api } from '../lib/api'
import { selectActiveSession, useStore } from '../store/useStore'
import { TimeRangeField } from './time-range/TimeRangeField'
import { TraceScatterChart } from './TraceScatterChart'
import { TraceServiceMap } from './TraceServiceMap'
import { TraceBuilderPanel } from './TraceBuilderPanel'
import { Combobox } from './ui/combobox'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { tempoAttributes, tempoAttributeValues } from '../lib/tempoMetadata'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { buildTraceql, mergeTraceBuilderState, traceBuilderFromSpan, traceBuilderFromTraceql, type TraceBuilderState, type TraceSampleSize } from '../lib/traceBuilder'
import { canonicalTraceId, openedTraceStatus, traceResultStatus, type TraceRow } from '../lib/traceViewer'
import styles from './TraceExplorer.module.css'
import { traceql as traceqlSupport } from '../lib/traceqlLanguage'
import { formatTraceql } from '../lib/formatTraceql'
import { notify } from './NotificationArea'
import { ModeSwitch } from './ModeSwitch'
import { QueryUtilityActions } from './QueryUtilityActions'
import { CopySqlButton } from './CopySqlButton'
import { defaultQueryTextForDatasource } from '../lib/queryDefaults'
import { tempoTraceLookupRequest } from '../lib/traceCohort'
import { useTraceCohortAnalysis } from '../lib/useTraceCohortAnalysis'
import { QueryToolbar } from './query/QueryToolbar'
import { QueryCodeEditor, type QueryCodeEditorHandle } from './query/QueryCodeEditor'
import { TraceSearchList } from './results/traces/TraceSearchList'
import { TraceOpenedResult } from './results/traces/TraceOpenedResult'
import { TraceSearchResults, type TraceResultView } from './results/traces/TraceSearchResults'
import { traceDateTimeLabel, traceDurationLabel, traceNumber, tracePeriodLabel, traceText } from './results/traces/tracePresentation'

interface TraceExplorerProps {
  connectionId: string
  resizeHandle?: ReactNode
}

const DEFAULT_TRACE_RANGE: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }
const DEFAULT_TRACE_SAMPLE_SIZE: TraceSampleSize = '250'
const TRACE_SAMPLE_SIZE_OPTIONS = [
  { value: '100', label: '100 traces' },
  { value: '250', label: '250 traces' },
  { value: '500', label: '500 traces' },
  { value: 'all', label: 'All traces' }
]

const text = traceText
const number = traceNumber
const periodLabel = tracePeriodLabel
const durationLabel = traceDurationLabel

function tempoPerf(event: string, fields: Record<string, unknown>): void {
  if (api.tempoPerformanceEnabled) console.info(`[tempo-perf] ${JSON.stringify({ event, ...fields })}`)
}

const dateTimeLabel = traceDateTimeLabel

function isSpanResult(result: QueryResult): boolean {
  return result.columns.some((column) => column.name === 'spanId')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
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

export function TraceExplorer({ connectionId, resizeHandle }: TraceExplorerProps) {
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
  const [resultView, setResultView] = useState<TraceResultView>('list')
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
  const traceqlEditorRef = useRef<QueryCodeEditorHandle>(null)
  const traceqlExtensions = useMemo(() => [traceqlSupport()], [])
  const cohortAnalysis = useTraceCohortAnalysis(connectionId, searchRows)
  const builderTraceql = useMemo(() => buildTraceql(builder), [builder])
  const activeTraceql = mode === 'builder' ? builderTraceql : traceql

  const formatCurrentTraceql = () => {
    if (mode !== 'sql' || !traceql.trim()) return
    const result = formatTraceql(traceql)
    if (!result.ok) {
      notify({ message: result.error, duration: 3200 })
      return
    }
    if (!traceqlEditorRef.current?.replaceDocumentAndFocus(result.query)) setSql(result.query)
    notify({ message: 'Formatted', duration: 2600 })
  }

  const onTraceqlKeyDown = (event: KeyboardEvent) => {
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

  const runSearch = async (sampleOverride: TraceSampleSize = sampleSize, rangeOverride: BuilderTimeRange = searchRange, queryOverride?: string) => {
    const request = (queryOverride ?? activeTraceql).trim()
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

    cohortAnalysis.reset()
    setResultView((current) => current === 'service-map' ? 'list' : current)
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
    const sourceRow = searchRows.find((row) => canonicalTraceId(row.traceId) === request)
    const openSource = sourceRow ? 'search-result' : 'direct-id'
    try {
      const result = await api.query.run(connectionId, request, [], sourceRow ? tempoTraceLookupRequest(sourceRow) : undefined, undefined, true)
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

  const sampledSearch = sampleSize !== 'all'
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

  const exploreSimilar = (source: TraceRow) => {
    const incoming = traceBuilderFromSpan(source)
    const next = mergeTraceBuilderState(builder, incoming)
    const query = buildTraceql(next)
    setBuilder(next)
    setSql(query)
    setQueryMode('builder')
    setSpans([])
    setSelectedSpanId('')
    cohortAnalysis.reset()
    setResultView('list')
    void runSearch(sampleSize, searchRange, query)
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
    if (shouldRerun && activeTraceql.trim()) void runSearch(next)
  }

  const changeResultView = (next: TraceResultView) => {
    setResultView(next)
    if (next === 'service-map') cohortAnalysis.ensureStarted()
  }

  const clearTempoResults = () => {
    cohortAnalysis.reset()
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


  return (
    <section className={styles.root} aria-label="Trace explorer" style={{ gridTemplateRows: 'minmax(120px, var(--editor-height, 300px)) 8px auto auto minmax(0, 1fr)' }}>
      <div className={styles.discoveryPanel} style={{ minHeight: 0, overflow: 'auto' }}>
        <form className={styles.traceIdBar} onSubmit={submitTraceId}>
          <TextInput label="Trace ID" mode="inline" id="trace-id" value={traceId} onValueChange={setTraceId} spellCheck={false} placeholder="4bf92f3577b34da6a3ce929d0e0e4736" />
          <button className="btn ghost" type="submit" disabled={loading !== null || !traceId.trim()}>{loading === 'trace' ? 'Opening…' : 'Open trace'}</button>
        </form>

        <form className={styles.searchForm} onSubmit={submitSearch} onKeyDown={onTraceqlKeyDown}>
          <QueryToolbar className={styles.queryToolbar}
            mode={<ModeSwitch />}
            options={<div className={styles.queryOptions} aria-label="Tempo query options">
              <TimeRangeField labelVisibility="sr-only" value={searchRange} onChange={setSearchRange} />
              <div className={styles.sampleSize}><Combobox label="Sample size" mode="inline" value={sampleSize} options={TRACE_SAMPLE_SIZE_OPTIONS} onChange={(value) => changeSampleSize(value as TraceSampleSize)} disabled={loading !== null} /></div>
            </div>}
            utilities={<QueryUtilityActions hasResults={Boolean(searchRows.length || spans.length || searchNotice || searchProgress || error || cohortHint)} onClearResults={clearTempoResults} onResetQuery={resetTempoQuery} />}
            editorActions={<div className={styles.editorActions}>
              {mode === 'sql' && <button type="button" className="btn ghost" onClick={formatCurrentTraceql} title="Format TraceQL (Shift+Alt+F)" disabled={!traceql.trim()}>Format</button>}
              <CopySqlButton sql={activeTraceql} language="TraceQL" />
            </div>}
            execution={<button className="btn primary" type="submit" data-tempo-run-query disabled={loading !== null || !activeTraceql.trim()}>{loading === 'search' ? 'Running…' : 'Run'}</button>}
          />
          {mode === 'builder'
            ? <TraceBuilderPanel value={builder} traceql={builderTraceql} schemas={metadata?.schemas ?? []} metadataStatus={metadata?.status ?? 'idle'} metadataError={metadata?.error ?? null} messagingSystems={messagingSystems} messagingSystemsLoading={messagingSystemsLoading} messagingSystemsError={messagingSystemsError} attributes={attributes} attributesLoading={attributesLoading} attributesError={attributesError} attributeValues={advancedValues} attributeValuesLoading={advancedValuesLoading} attributeValuesError={advancedValuesError} onChange={updateBuilder} onOpenTraceql={() => { setSql(builderTraceql); setQueryMode('sql') }} />
            : <QueryCodeEditor ref={traceqlEditorRef} className={styles.traceqlField} value={traceql} minHeight="66px" extensions={traceqlExtensions} onChange={(value) => setSql(value)} aria-label="TraceQL editor" placeholder={'{ resource.service.name = "checkout-api" && duration > 300ms }'} />}
        </form>
      </div>

      {resizeHandle}
      {cohortHint && <div className={styles.cohortHint} role="status" style={{ gridRow: 3 }}>{cohortHint}</div>}
      {error && <div className={styles.error} role="alert" style={{ gridRow: 4 }}>{error}</div>}
      {loading === 'trace' && <div className={styles.warning} role="status" aria-live="polite" style={{ gridRow: 5 }}><strong>Opening trace…</strong> Fetching the full span tree from Tempo via gcx for <code>{traceId}</code>.</div>}
      {loading === 'search' && <div className={styles.warning} role="status" aria-live="polite" style={{ gridRow: 5 }}>
        {sampledSearch ? <strong>Fetching up to {sampleSize} Tempo traces across the selected period…</strong> : searchProgress ? <>
          <div><strong>Fetching Tempo…</strong> {periodLabel(searchProgress.coveredMs)} / {periodLabel(searchProgress.totalMs)} covered ({progressPercent}%) · {searchProgress.completedChunks}/{currentChunkCount || 1} current chunks · {searchProgress.tracesFound} traces found · {searchProgress.queriesCompleted} {searchProgress.queriesCompleted === 1 ? 'query' : 'queries'}</div>
          <progress value={searchProgress.coveredMs} max={Math.max(1, searchProgress.totalMs)} aria-label={`Tempo search ${progressPercent}% complete`} style={{ width: '100%', marginTop: 6 }} />
        </> : <strong>Starting exhaustive Tempo search…</strong>}
      </div>}

      {spans.length > 0 ? <TraceOpenedResult spans={spans} selectedSpanId={selectedSpanId} collapsed={collapsed} hiddenSpanKinds={hiddenSpanKinds}
        hideAsyncBranches={hideAsyncBranches} compressIdleGaps={compressIdleGaps} showBackToResults={searchRows.length > 0} busy={loading === 'trace'}
        onSelectSpan={setSelectedSpanId} onToggleCollapsed={toggleCollapse} onToggleSpanKind={toggleSpanKind}
        onToggleAsyncBranches={() => setHideAsyncBranches((current) => !current)} onToggleIdleCompression={() => setCompressIdleGaps((current) => !current)}
        onShowAllKinds={() => setHiddenSpanKinds(new Set())} onBackToResults={() => { setSpans([]); setSelectedSpanId('') }} onExploreSimilar={exploreSimilar} /> : <TraceSearchResults rows={searchRows} notice={searchNotice} loading={loading} resultView={resultView} onResultViewChange={changeResultView}
        listView={<TraceSearchList rows={searchRows} disabled={loading !== null} onOpenTrace={(candidate) => void openTrace(candidate)} />}
        scatterView={<TraceScatterChart option={scatterOption} searchRange={searchRange} onEvents={scatterEvents} onSelectRange={(next) => { setSearchRange(next); void runSearch(sampleSize, next) }} />}
        serviceMapView={<TraceServiceMap aggregate={cohortAnalysis.aggregate} traces={cohortAnalysis.traces} progress={cohortAnalysis.progress} searchTraceCount={searchRows.length} sampleLimit={cohortAnalysis.sampleLimit} onSampleLimitChange={cohortAnalysis.changeSampleLimit} onRetry={cohortAnalysis.retry} onStop={cohortAnalysis.stop} onOpenTrace={(candidate) => void openTrace(candidate)} />} />}
    </section>
  )
}
