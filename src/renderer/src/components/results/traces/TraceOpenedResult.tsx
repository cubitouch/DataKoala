import { TextInput } from '@components/ui/TextInput'
import { createTextSearch } from '@lib/textSearch'
import { filterTraceSearch, traceSearchText } from '@lib/traceTextSearch'
import { useMemo, useState, useEffect } from 'react'
import {
  buildVisibleTraceTree,
  traceSpanKind,
  traceSpanKinds,
  visibleSpanCount,
  withoutAsyncTraceBranches,
  type TraceRow
} from '@lib/traceViewer'
import { SpanInspector } from './SpanInspector'
import { TraceResultHeader } from './TraceResultHeader'
import { MAX_RENDERED_SPANS, TraceWaterfall } from './TraceWaterfall'
import { traceNumber, traceText } from './tracePresentation'
import styles from './TraceOpenedResult.module.css'

interface TraceOpenedResultProps {
  spans: TraceRow[]
  selectedSpanId: string
  collapsed: Set<string>
  hiddenSpanKinds: Set<string>
  hideAsyncBranches: boolean
  compressIdleGaps: boolean
  showBackToResults: boolean
  busy?: boolean
  onSelectSpan: (spanId: string) => void
  onToggleCollapsed: (spanId: string) => void
  onToggleSpanKind: (kind: string) => void
  onToggleAsyncBranches: () => void
  onToggleIdleCompression: () => void
  onShowAllKinds: () => void
  onBackToResults: () => void
  onExploreSimilar: (span: TraceRow) => void
}

const text = traceText
const number = traceNumber

export function renderedSpanLimitWarning(visibleSpanCount: number): string | null {
  return visibleSpanCount > MAX_RENDERED_SPANS ? `Showing the first ${MAX_RENDERED_SPANS} visible spans.` : null
}

export function TraceOpenedResult({ spans, selectedSpanId, collapsed, hiddenSpanKinds, hideAsyncBranches, compressIdleGaps, showBackToResults, busy = false, onSelectSpan, onToggleCollapsed, onToggleSpanKind, onToggleAsyncBranches, onToggleIdleCompression, onShowAllKinds, onBackToResults, onExploreSimilar }: TraceOpenedResultProps) {
  const [search, setSearch] = useState('')
  const traceId = text(spans[0]?.traceId)
  useEffect(() => setSearch(''), [traceId])
  const textSearch = useMemo(() => createTextSearch(search), [search])
  const searchIndex = useMemo(() => new Map(spans.map((span) => [span, traceSearchText(span)])), [spans])
  const sortedSpans = useMemo(() => [...spans].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs)), [spans])
  const spanKinds = useMemo(() => traceSpanKinds(sortedSpans), [sortedSpans])
  const spanKindCounts = useMemo(() => Object.fromEntries(spanKinds.map((kind) => [kind, sortedSpans.filter((span) => traceSpanKind(span) === kind).length])), [sortedSpans, spanKinds])
  const viewerSpans = useMemo(() => hideAsyncBranches ? withoutAsyncTraceBranches(sortedSpans) : sortedSpans, [sortedSpans, hideAsyncBranches])
  const filteredSpanCount = useMemo(() => visibleSpanCount(viewerSpans, hiddenSpanKinds), [viewerSpans, hiddenSpanKinds])
  const expandedTree = useMemo(() => buildVisibleTraceTree(viewerSpans, new Set(), hiddenSpanKinds), [viewerSpans, hiddenSpanKinds])
  const searchResult = useMemo(() => search ? filterTraceSearch(expandedTree, viewerSpans, searchIndex, search) : null, [expandedTree, viewerSpans, searchIndex, search])
  const visibleTree = useMemo(() => searchResult?.tree ?? buildVisibleTraceTree(viewerSpans, collapsed, hiddenSpanKinds), [searchResult, viewerSpans, collapsed, hiddenSpanKinds])
  const displayedCollapsed = search ? new Set<string>() : collapsed
  const timelineSpans = useMemo(() => viewerSpans.filter((row) => !hiddenSpanKinds.has(traceSpanKind(row))), [viewerSpans, hiddenSpanKinds])
  const traceStart = sortedSpans.length ? Math.min(...sortedSpans.map((row) => number(row.startTimeMs))) : 0
  const traceEnd = sortedSpans.length ? Math.max(...sortedSpans.map((row) => number(row.startTimeMs) + number(row.durationMs))) : 0
  const traceDuration = Math.max(0, traceEnd - traceStart)
  const services = useMemo(() => new Set(sortedSpans.map((row) => text(row.service)).filter(Boolean)), [sortedSpans])
  const errorCount = useMemo(() => sortedSpans.filter((row) => text(row.status).toUpperCase().includes('ERROR')).length, [sortedSpans])
  const rootSpan = sortedSpans.find((row) => !text(row.parentSpanId)) ?? sortedSpans[0]
  const selectedSpanCandidate = sortedSpans.find((row) => text(row.spanId) === selectedSpanId)
  const selectedSpanVisible = selectedSpanCandidate && (searchResult ? searchResult.tree.some(({ id }) => id === selectedSpanId) : viewerSpans.some((row) => text(row.spanId) === selectedSpanId))
  const selectedSpan = selectedSpanVisible && !hiddenSpanKinds.has(traceSpanKind(selectedSpanCandidate)) ? selectedSpanCandidate : undefined
  const asyncPrunedCount = sortedSpans.length - viewerSpans.length
  const hasAsyncKinds = spanKinds.some((kind) => kind === 'PRODUCER' || kind === 'CONSUMER')
  const exploreSource = selectedSpan ?? rootSpan
  const spanLimitWarning = renderedSpanLimitWarning(visibleTree.length)

  return <div className={styles.traceView} aria-busy={busy} style={{ gridRow: 5 }}>
    <TraceResultHeader traceId={text(rootSpan?.traceId)} service={text(rootSpan?.service)} operation={text(rootSpan?.name)} durationMs={traceDuration}
      visibleSpanCount={searchResult?.tree.length ?? filteredSpanCount} totalSpanCount={spans.length} serviceCount={services.size} errorCount={errorCount}
      spanKinds={spanKinds} spanKindCounts={spanKindCounts} hiddenSpanKinds={hiddenSpanKinds} hideAsyncBranches={hideAsyncBranches}
      asyncPrunedCount={asyncPrunedCount} hasAsyncKinds={hasAsyncKinds} compressIdleGaps={compressIdleGaps} showBackToResults={showBackToResults}
      onBackToResults={onBackToResults} onExploreSimilar={() => { if (exploreSource) onExploreSimilar(exploreSource) }} onToggleSpanKind={onToggleSpanKind}
      onToggleAsyncBranches={onToggleAsyncBranches} onToggleIdleCompression={onToggleIdleCompression} onShowAllKinds={onShowAllKinds} />

    <div className={styles['search-toolbar']}>
      <TextInput label="Search trace spans" labelVisibility="sr-only" mode="inline" placeholder="Search names, services, attributes…" value={search} onValueChange={setSearch} />
      {search && <button type="button" className="btn ghost" onClick={() => setSearch('')}>Clear search</button>}
      <span role="status">{searchResult ? `${searchResult.matches.size} matching spans · ${searchResult.tree.length} shown with ancestors. Matching branches expanded while searching.` : 'Search within the loaded trace.'}</span>
    </div>

    {spanLimitWarning && <div className={styles.warning}>{spanLimitWarning}</div>}

    <div className={`${styles.inspectionArea} ${selectedSpan ? styles.withDetails : styles.waterfallOnly}`}>
      <TraceWaterfall visibleTree={visibleTree} timelineSpans={timelineSpans} selectedSpanId={selectedSpanId} collapsed={displayedCollapsed} textSearch={textSearch} searchMatches={searchResult?.matches}
        filteredSpanCount={searchResult?.tree.length ?? filteredSpanCount} totalSpanCount={spans.length} traceStart={traceStart} traceDuration={traceDuration}
        compressIdleGaps={compressIdleGaps} hasInspector={Boolean(selectedSpan)} onSelectSpan={onSelectSpan} onToggleCollapse={onToggleCollapsed} />
      {selectedSpan && <SpanInspector textSearch={textSearch} searching={Boolean(search)} span={selectedSpan} traceStart={traceStart} onClose={() => onSelectSpan('')} />}
    </div>
  </div>
}
