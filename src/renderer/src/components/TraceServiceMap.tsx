import { useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { TITLEBAR_HEIGHT } from '@shared/layoutDimensions'
import { Combobox } from './ui/combobox'
import { TextInput } from './ui/TextInput'
import type {
  TraceCohortAggregate,
  TraceCohortAnalysisProgress,
  TraceCohortEdge,
  TraceCohortNode,
  TraceCohortTraceSummary
} from '../lib/traceCohort'
import { groupTraceServiceMap, type TraceServiceMapGrouping, type TraceServiceMapViewEdge, type TraceServiceMapViewNode } from '../lib/traceServiceMapGrouping'
import { layoutTraceServiceMap } from '../lib/traceServiceMapLayout'
import { projectTraceServiceMap } from '../lib/traceServiceMapProjection'
import { scopeTraceServiceMap, type TraceServiceMapScope } from '../lib/traceServiceMapScope'
import styles from './TraceServiceMap.module.css'

interface TraceServiceMapProps {
  aggregate: TraceCohortAggregate
  traces: TraceCohortTraceSummary[]
  progress: TraceCohortAnalysisProgress
  searchTraceCount: number
  sampleLimit: number
  onSampleLimitChange: (limit: number) => void
  onRetry: () => void
  onStop: () => void
  onOpenTrace: (traceId: string) => void
}

type Selection = { kind: 'edge'; key: string } | { kind: 'node'; key: string }

const SAMPLE_OPTIONS = [
  { value: '50', label: 'Up to 50 traces' },
  { value: '100', label: 'Up to 100 traces' },
  { value: '250', label: 'Up to 250 traces' }
]

const BRANCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'Entire transaction' },
  { value: 'main', label: 'Main transaction' },
  { value: 'async', label: 'Async branches' }
]

const GROUPING_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'namespace', label: 'Namespace / system' }
]

const DENSE_GRAPH_NODE_THRESHOLD = 24
const TOP_BOTTLENECK_LIMIT = 10

function durationLabel(milliseconds: number): string {
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`
  if (milliseconds >= 1) return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`
  return `${Math.max(0, milliseconds * 1_000).toFixed(0)}µs`
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, value) * 100)}%`
}

function numberLabel(value: number): string {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

function palette() {
  if (typeof document === 'undefined') return {
    accent: '#f5cf33', accent2: '#ffe0a7', bg: '#17201f', bg2: '#202b2a', bg4: '#384948',
    border: '#516666', text: '#fff9f1', mute: '#617f7f', red: '#f87171'
  }
  const root = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback
  return {
    accent: read('--accent', '#f5cf33'), accent2: read('--accent-2', '#ffe0a7'), bg: read('--bg', '#17201f'),
    bg2: read('--bg-2', '#202b2a'), bg4: read('--bg-4', '#384948'), border: read('--border', '#516666'),
    text: read('--text', '#fff9f1'), mute: read('--text-mute', '#617f7f'), red: read('--red', '#f87171')
  }
}

function edgeReason(edge: TraceCohortEdge): string {
  const meaningfulDelta = Math.max(20, edge.p50Ms * 0.25)
  if (!edge.latencyComparisonAvailable && edge.slowPresenceLift >= 0.2) {
    return `Appears in ${percent(edge.slowPresenceRate)} of slow traces vs ${percent(edge.baselinePresenceRate)} of baseline traces.`
  }
  if (edge.latencyComparisonAvailable && edge.slowDeltaMs >= meaningfulDelta) {
    return `Median observed edge time is +${durationLabel(edge.slowDeltaMs)} in slow traces.`
  }
  if (edge.slowPresenceLift >= 0.2) return `Appears in ${percent(edge.slowPresenceRate)} of slow traces vs ${percent(edge.baselinePresenceRate)} of baseline traces.`
  if (edge.errorRate >= 0.05) return `${percent(edge.errorRate)} of affected traces contain an error on this edge.`
  if (edge.callsPerAffectedTrace >= 1.5) return `${numberLabel(edge.callsPerAffectedTrace)} calls per affected trace suggests repeated downstream work.`
  return `High observed edge time: p95 ${durationLabel(edge.p95Ms)} across affected traces.`
}

function traceLabel(trace: TraceCohortTraceSummary, aggregate: TraceCohortAggregate): string {
  if (trace.durationMs >= aggregate.slowThresholdMs) return 'Slow'
  if (trace.durationMs <= aggregate.baselineThresholdMs) return 'Baseline'
  return 'Middle'
}

function representativeTraces(edge: TraceCohortEdge, traces: TraceCohortTraceSummary[], aggregate: TraceCohortAggregate): TraceCohortTraceSummary[] {
  const affected = traces.filter((trace) => edge.traceIds.includes(trace.traceId))
  return representativeTraceSet(affected, aggregate)
}

function representativeServiceTraces(node: TraceCohortNode, traces: TraceCohortTraceSummary[], aggregate: TraceCohortAggregate): TraceCohortTraceSummary[] {
  return representativeTraceSet(traces.filter((trace) => trace.services.some((service) => service.id === node.id)), aggregate)
}

function representativeTraceSet(affected: TraceCohortTraceSummary[], aggregate: TraceCohortAggregate): TraceCohortTraceSummary[] {
  if (!affected.length) return []
  const selected = new Map<string, TraceCohortTraceSummary>()
  const slowest = [...affected].sort((left, right) => right.durationMs - left.durationMs)[0]
  selected.set(slowest.traceId, slowest)
  const errored = affected.find((trace) => trace.status === 'error')
  if (errored) selected.set(errored.traceId, errored)
  const typical = [...affected].sort((left, right) => Math.abs(left.durationMs - aggregate.p50DurationMs) - Math.abs(right.durationMs - aggregate.p50DurationMs))[0]
  selected.set(typical.traceId, typical)
  return [...selected.values()].slice(0, 3)
}

function nodeWidth(node: TraceServiceMapViewNode, dense: boolean): number {
  const longestLine = Math.max(...node.label.split('\n').map((line) => line.length), 8)
  return Math.max(node.viewKind === 'group' ? 120 : 88, Math.min(dense ? 154 : 190, 38 + longestLine * (dense ? 5.4 : 6)))
}

function edgeHasSlowUplift(edge: TraceCohortEdge): boolean {
  return edge.slowPresenceLift >= 0.2 || (edge.latencyComparisonAvailable && edge.slowDeltaMs >= Math.max(20, edge.p50Ms * 0.25))
}

export function TraceServiceMap(props: TraceServiceMapProps) {
  const { aggregate, traces, progress, searchTraceCount, sampleLimit, onSampleLimitChange, onRetry, onStop, onOpenTrace } = props
  const [selection, setSelection] = useState<Selection | null>(null)
  const [branchScope, setBranchScope] = useState<TraceServiceMapScope>('all')
  const [grouping, setGrouping] = useState<TraceServiceMapGrouping>('none')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [serviceSearch, setServiceSearch] = useState('')
  const [graphFullscreen, setGraphFullscreen] = useState(false)
  const [renderFinished, setRenderFinished] = useState(false)
  const chartRef = useRef<ReactECharts>(null)
  const didAutoGroup = useRef(false)
  const colors = useMemo(palette, [])

  const scopedGraph = useMemo(() => scopeTraceServiceMap(aggregate.nodes, aggregate.edges, branchScope), [aggregate.edges, aggregate.nodes, branchScope])
  const topEdges = scopedGraph.edges.slice(0, TOP_BOTTLENECK_LIMIT)
  const topEdgeKeys = useMemo(() => new Set(scopedGraph.edges.slice(0, 3).map((edge) => edge.key)), [scopedGraph.edges])
  const groupedGraph = useMemo(
    () => groupTraceServiceMap(scopedGraph.nodes, scopedGraph.edges, grouping, expandedGroups, aggregate.traceCount),
    [aggregate.traceCount, expandedGroups, grouping, scopedGraph.edges, scopedGraph.nodes]
  )
  const graph = useMemo(() => {
    const projection = projectTraceServiceMap(groupedGraph.nodes, groupedGraph.edges)
    return {
      ...projection,
      nodes: projection.nodes.map((node) => groupedGraph.nodeById.get(node.id)).filter((node): node is TraceServiceMapViewNode => Boolean(node)),
      edges: projection.edges.map((edge) => groupedGraph.edgeById.get(edge.key)).filter((edge): edge is TraceServiceMapViewEdge => Boolean(edge))
    }
  }, [groupedGraph])
  const denseGraph = graph.nodes.length > DENSE_GRAPH_NODE_THRESHOLD

  const normalizedSearch = serviceSearch.trim().toLocaleLowerCase()
  const matchingServiceIds = useMemo(() => new Set(scopedGraph.nodes
    .filter((node) => !normalizedSearch || `${node.label} ${node.namespace ?? ''}`.toLocaleLowerCase().includes(normalizedSearch))
    .map((node) => node.id)), [normalizedSearch, scopedGraph.nodes])
  const matchingViewNodeIds = useMemo(() => new Set(groupedGraph.nodes
    .filter((node) => !normalizedSearch || node.memberIds.some((id) => matchingServiceIds.has(id)))
    .map((node) => node.id)), [groupedGraph.nodes, matchingServiceIds, normalizedSearch])

  useEffect(() => {
    if (didAutoGroup.current || progress.status === 'loading' || !aggregate.nodes.length) return
    didAutoGroup.current = true
    const namespaces = new Set(aggregate.nodes.map((node) => node.namespace?.trim()).filter(Boolean))
    if (aggregate.nodes.length > DENSE_GRAPH_NODE_THRESHOLD && namespaces.size > 1) setGrouping('namespace')
  }, [aggregate.nodes, progress.status])

  useEffect(() => {
    if (selection?.kind === 'edge' && !scopedGraph.edges.some((edge) => edge.key === selection.key)) setSelection(null)
    if (selection?.kind === 'node' && !groupedGraph.nodeById.has(selection.key)) setSelection(null)
  }, [groupedGraph.nodeById, scopedGraph.edges, selection])

  useEffect(() => {
    const frame = requestAnimationFrame(() => chartRef.current?.getEchartsInstance().resize())
    return () => cancelAnimationFrame(frame)
  }, [branchScope, expandedGroups, graphFullscreen, grouping])

  useEffect(() => {
    if (!graphFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGraphFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [graphFullscreen])

  const selectedEdge = selection?.kind === 'edge' ? scopedGraph.edges.find((edge) => edge.key === selection.key) : undefined
  const selectedNode = selection?.kind === 'node' ? scopedGraph.nodes.find((node) => node.id === selection.key) : undefined
  const incidentEdges = selectedNode
    ? scopedGraph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).sort((left, right) => left.rank - right.rank)
    : []
  const upstreamEdges = selectedNode ? incidentEdges.filter((edge) => edge.target === selectedNode.id) : []
  const downstreamEdges = selectedNode ? incidentEdges.filter((edge) => edge.source === selectedNode.id) : []

  const option = useMemo<EChartsOption>(() => {
    const positions = layoutTraceServiceMap(graph.nodes, graph.edges)
    const maximumRootCount = Math.max(0, ...graph.nodes.map((node) => node.rootTraceCount))
    const focusedNodeIds = new Set<string>()
    const focusedEdgeIds = new Set<string>()
    if (selection?.kind === 'edge') {
      const edge = graph.edges.find((candidate) => candidate.memberEdgeKeys.includes(selection.key))
      if (edge) {
        focusedEdgeIds.add(edge.key)
        focusedNodeIds.add(edge.source)
        focusedNodeIds.add(edge.target)
      }
    } else if (selection?.kind === 'node') {
      focusedNodeIds.add(selection.key)
      for (const edge of graph.edges) {
        if (edge.source !== selection.key && edge.target !== selection.key) continue
        focusedEdgeIds.add(edge.key)
        focusedNodeIds.add(edge.source)
        focusedNodeIds.add(edge.target)
      }
    }
    const focused = focusedNodeIds.size > 0
    const searching = Boolean(normalizedSearch)

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item', borderColor: colors.border, backgroundColor: colors.bg2,
        textStyle: { color: colors.text, fontSize: 11 },
        formatter: (value: unknown) => {
          const item = value as { dataType?: string; data?: Record<string, unknown> }
          if (item.dataType === 'edge') {
            const edge = groupedGraph.edgeById.get(String(item.data?.id ?? ''))
            if (!edge) return ''
            if (edge.memberEdgeKeys.length === 1) {
              const original = aggregate.edges.find((candidate) => candidate.key === edge.memberEdgeKeys[0])
              if (original) return [`<strong>${escapeHtml(original.sourceLabel)} → ${escapeHtml(original.targetLabel)}</strong>`, `${original.traceCount}/${aggregate.traceCount} traces · ${original.callCount} calls`, `observed p50 ${durationLabel(original.p50Ms)} · p95 ${durationLabel(original.p95Ms)}`, edgeReason(original)].join('<br/>')
            }
            return [`<strong>${escapeHtml(edge.sourceLabel)} → ${escapeHtml(edge.targetLabel)}</strong>`, `${edge.memberEdgeKeys.length} underlying service connections`, `${edge.traceCount}/${aggregate.traceCount} traces · ${edge.callCount} calls`, 'Expand the namespace boxes to inspect individual services.'].join('<br/>')
          }
          const node = groupedGraph.nodeById.get(String(item.data?.id ?? ''))
          if (!node) return ''
          if (node.viewKind === 'group') return [`<strong>${escapeHtml(node.groupKey ?? 'Namespace')}</strong>`, `${node.memberIds.length} services`, 'Click to expand this namespace.'].join('<br/>')
          const original = aggregate.nodes.find((candidate) => candidate.id === node.id)
          if (!original) return ''
          return [`<strong>${escapeHtml(original.label)}</strong>`, original.namespace ? escapeHtml(original.namespace) : '', `${original.traceCount}/${aggregate.traceCount} traces · ${original.spanCount} spans`, `${percent(original.errorRate)} traces with errors`].filter(Boolean).join('<br/>')
        }
      },
      series: [{
        type: 'graph', layout: 'none', roam: true, zoom: 1, scaleLimit: { min: 0.3, max: 4 },
        symbol: 'roundRect',
        edgeSymbol: ['none', 'arrow'], edgeSymbolSize: [0, denseGraph ? 6 : 8],
        label: { show: true, color: colors.text, fontSize: denseGraph ? 9 : 10, position: 'inside', overflow: 'truncate' },
        emphasis: { focus: 'adjacency', label: { show: true }, lineStyle: { width: 4 } },
        data: graph.nodes.map((node) => {
          const position = positions.get(node.id) ?? { x: 0, y: 0 }
          const isRoot = node.rootTraceCount > 0 && node.rootTraceCount === maximumRootCount
          const hasErrors = node.errorRate > 0
          const matched = matchingViewNodeIds.has(node.id)
          const dimmedByFocus = focused && !focusedNodeIds.has(node.id)
          const dimmedBySearch = searching && !matched
          const dimmed = dimmedByFocus || dimmedBySearch
          return {
            id: node.id, name: node.label, x: position.x, y: position.y,
            symbol: 'roundRect',
            symbolSize: [nodeWidth(node, denseGraph), node.viewKind === 'group' ? 40 : denseGraph ? 29 : 34],
            itemStyle: {
              color: node.viewKind === 'group' ? colors.bg4 : hasErrors ? colors.bg4 : colors.bg2,
              borderColor: matched && searching ? colors.accent : hasErrors ? colors.red : isRoot ? colors.accent2 : node.viewKind === 'group' ? colors.accent2 : colors.border,
              borderWidth: matched && searching ? 3 : hasErrors ? 2 : node.viewKind === 'group' ? 2 : 1.5,
              opacity: dimmed ? 0.15 : 1
            },
            label: {
              show: true,
              color: node.viewKind === 'group' || isRoot ? colors.accent2 : colors.text,
              opacity: dimmed ? 0.2 : 1,
              fontWeight: node.viewKind === 'group' ? 600 : 500,
              lineHeight: node.viewKind === 'group' ? 13 : 12
            }
          }
        }),
        links: graph.edges.map((edge) => {
          const candidate = edge.memberEdgeKeys.some((key) => topEdgeKeys.has(key))
          const selected = focusedEdgeIds.has(edge.key)
          const searchRelated = matchingViewNodeIds.has(edge.source) || matchingViewNodeIds.has(edge.target)
          const dimmed = (focused && !selected) || (searching && !searchRelated)
          const slowUplift = edge.memberEdgeKeys.some((key) => {
            const original = aggregate.edges.find((candidateEdge) => candidateEdge.key === key)
            return original ? edgeHasSlowUplift(original) : false
          })
          return {
            id: edge.key, source: edge.source, target: edge.target, value: edge.p95Ms,
            lineStyle: {
              color: edge.errorRate >= 0.05 ? colors.red : slowUplift || candidate ? colors.accent : colors.mute,
              opacity: dimmed ? 0.07 : selected ? 1 : slowUplift || candidate ? 0.88 : denseGraph ? 0.3 : 0.44,
              width: selected ? 4.5 : 1 + Math.min(4.5, Math.sqrt(Math.max(0, edge.traceRate)) * 4),
              type: edge.kind === 'async' ? 'dashed' : edge.kind === 'mixed' ? 'dotted' : 'solid',
              curveness: denseGraph ? 0 : 0.02
            }
          }
        })
      }]
    }
  }, [aggregate, colors, denseGraph, graph, groupedGraph.edgeById, groupedGraph.nodeById, matchingViewNodeIds, normalizedSearch, selection, topEdgeKeys])
  useEffect(() => setRenderFinished(false), [option])

  const events = useMemo(() => ({
    click: (value: unknown) => {
      const item = value as { dataType?: string; data?: { id?: unknown } }
      const key = String(item.data?.id ?? '')
      if (!key) return
      if (item.dataType === 'node') {
        const viewNode = groupedGraph.nodeById.get(key)
        if (!viewNode) return
        if (viewNode.viewKind === 'group') {
          const groupKey = viewNode.groupKey
          if (!groupKey) return
          setExpandedGroups((current) => new Set(current).add(groupKey))
          return
        }
        setSelection((current) => current?.kind === 'node' && current.key === key ? null : { kind: 'node', key })
      }
      if (item.dataType === 'edge') {
        const viewEdge = groupedGraph.edgeById.get(key)
        if (!viewEdge || viewEdge.memberEdgeKeys.length !== 1) return
        const originalKey = viewEdge.memberEdgeKeys[0]
        setSelection((current) => current?.kind === 'edge' && current.key === originalKey ? null : { kind: 'edge', key: originalKey })
      }
    },
    finished: () => setRenderFinished(true)
  }), [groupedGraph.edgeById, groupedGraph.nodeById])

  const progressPercent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0
  const sampled = searchTraceCount > progress.total && progress.total > 0
  const graphIsProjected = graph.omittedNodeCount > 0 || graph.omittedEdgeCount > 0
  const scopeActive = branchScope !== 'all'
  const collapsedGroups = grouping === 'namespace' ? groupedGraph.nodes.filter((node) => node.viewKind === 'group').length : 0
  const scopeEmptyMessage = branchScope === 'main'
    ? 'No synchronous service path was found from the transaction root.'
    : branchScope === 'async'
      ? 'No async or messaging branches were found in this cohort.'
      : 'No cross-service transitions were found. Check that spans carry distinct service.name values across service boundaries.'

  const bottleneckList = (fullscreen = false) => topEdges.length
    ? <div className={`${styles.candidateList} ${fullscreen ? styles.fullscreenCandidateList : ''}`} data-service-map-bottleneck-list aria-label="Service map bottleneck candidates">
      {topEdges.map((edge, index) => <button key={edge.key} type="button" data-service-map-bottleneck className={index === 0 ? styles.primaryCandidate : ''} onClick={() => setSelection((current) => current?.kind === 'edge' && current.key === edge.key ? null : { kind: 'edge', key: edge.key })}>
        <span className={styles.candidateRank}>#{index + 1}</span>
        <span className={styles.candidateBody}><strong>{edge.sourceLabel} → {edge.targetLabel}</strong><small>{edgeReason(edge)}</small></span>
        <span className={styles.candidateMetric}>obs p95 {durationLabel(edge.p95Ms)}</span>
      </button>)}
    </div>
    : <div className={styles.empty}>No cross-service edges in this branch scope.</div>

  const traceButtons = (items: TraceCohortTraceSummary[]) => items.map((trace) => <button key={trace.traceId} type="button" onClick={() => onOpenTrace(trace.traceId)}><span><strong>{traceLabel(trace, aggregate)}</strong><code>{trace.traceId.slice(0, 10)}…</code></span><span>{durationLabel(trace.durationMs)} →</span></button>)

  const connectionList = (title: string, edges: TraceCohortEdge[]) => edges.length ? <div className={styles.edgeList}><h4>{title}</h4>{edges.slice(0, 8).map((edge) => <button key={edge.key} type="button" onClick={() => setSelection({ kind: 'edge', key: edge.key })}><span>{edge.sourceLabel} → {edge.targetLabel}</span><strong>p95 {durationLabel(edge.p95Ms)}</strong></button>)}</div> : null

  const insightsContent = (fullscreen = false) => selectedEdge ? <>
    <button type="button" className={styles.backButton} onClick={() => setSelection(null)}>← Bottleneck candidates</button>
    <div className={styles.insightTitle}><span>Connection</span><h3>{selectedEdge.sourceLabel} → {selectedEdge.targetLabel}</h3><p>{edgeReason(selectedEdge)}</p></div>
    <dl className={styles.metricGrid}>
      <div><dt>Observed p50</dt><dd>{durationLabel(selectedEdge.p50Ms)}</dd></div>
      <div><dt>Observed p95</dt><dd>{durationLabel(selectedEdge.p95Ms)}</dd></div>
      <div><dt>Slow delta</dt><dd className={selectedEdge.latencyComparisonAvailable && selectedEdge.slowDeltaMs > 0 ? styles.metricWarn : ''}>{selectedEdge.latencyComparisonAvailable ? `${selectedEdge.slowDeltaMs >= 0 ? '+' : '−'}${durationLabel(Math.abs(selectedEdge.slowDeltaMs))}` : '—'}</dd></div>
      <div><dt>Error traces</dt><dd>{percent(selectedEdge.errorRate)}</dd></div>
      <div><dt>Coverage</dt><dd>{percent(selectedEdge.traceRate)}</dd></div>
      <div><dt>Calls / trace</dt><dd>{numberLabel(selectedEdge.callsPerAffectedTrace)}</dd></div>
    </dl>
    <div className={styles.comparison}>
      <div><span>Baseline observed median</span><strong>{selectedEdge.baselineObservedTraceCount ? durationLabel(selectedEdge.baselineMedianMs) : '—'}</strong><small>{selectedEdge.baselineObservedTraceCount}/{aggregate.baselineTraceCount} contain edge</small></div>
      <div><span>Slow observed median</span><strong>{selectedEdge.slowObservedTraceCount ? durationLabel(selectedEdge.slowMedianMs) : '—'}</strong><small>{selectedEdge.slowObservedTraceCount}/{aggregate.slowTraceCount} contain edge</small></div>
    </div>
    <div className={styles.representatives}><h4>Representative traces</h4>{traceButtons(representativeTraces(selectedEdge, traces, aggregate))}</div>
  </> : selectedNode ? <>
    <button type="button" className={styles.backButton} onClick={() => setSelection(null)}>← Bottleneck candidates</button>
    <div className={styles.insightTitle}><span>Service</span><h3>{selectedNode.label}</h3><p>{selectedNode.namespace ? `${selectedNode.namespace} · ` : ''}Seen in {selectedNode.traceCount}/{aggregate.traceCount} analyzed traces.</p></div>
    <dl className={styles.metricGrid}>
      <div><dt>Trace coverage</dt><dd>{percent(selectedNode.traceRate)}</dd></div>
      <div><dt>Error traces</dt><dd>{percent(selectedNode.errorRate)}</dd></div>
      <div><dt>Spans observed</dt><dd>{selectedNode.spanCount}</dd></div>
      <div><dt>Root traces</dt><dd>{selectedNode.rootTraceCount}</dd></div>
      <div><dt>Upstream</dt><dd>{upstreamEdges.length}</dd></div>
      <div><dt>Downstream</dt><dd>{downstreamEdges.length}</dd></div>
    </dl>
    {connectionList('Upstream connections', upstreamEdges)}
    {connectionList('Downstream connections', downstreamEdges)}
    <div className={styles.representatives}><h4>Representative traces</h4>{traceButtons(representativeServiceTraces(selectedNode, traces, aggregate))}</div>
  </> : <>
    <div className={styles.insightTitle}><span>Cohort analysis</span><h3>Bottleneck candidates</h3><p>Top bottlenecks are treated as candidates until critical-path contribution is available. Slow traces are the slowest 20%; baseline traces are the fastest 50%.</p></div>
    {bottleneckList(fullscreen)}
    <p className={styles.methodNote}>Ranking combines observed tail time, slow-vs-baseline latency change, errors, repeated calls and slow-trace presence. Edge latency is cumulative observed child-span time per affected trace; traces without the edge are excluded from latency medians and compared separately via presence. Parallel work may overlap, so this is not critical-path time.</p>
  </>

  return <div className={styles.root} data-trace-service-map="" data-branch-scope={branchScope} data-service-map-grouping={grouping} data-visual-type="graph" data-visual-finished={renderFinished && progress.status !== 'loading'} data-visual-nodes={graph.nodes.length} data-visual-edges={graph.edges.length}>
    <div className={styles.toolbar}>
      <div className={styles.toolbarIdentity}><strong>Service map</strong><span>{sampled ? `Representative analysis of ${progress.total} / ${searchTraceCount} search results` : `${progress.total || Math.min(searchTraceCount, sampleLimit)} traces selected for analysis`}</span></div>
      {aggregate.traceCount > 0 && <dl className={styles.summary}>
        <div><dt>Trace p50</dt><dd>{durationLabel(aggregate.p50DurationMs)}</dd></div>
        <div><dt>Trace p95</dt><dd>{durationLabel(aggregate.p95DurationMs)}</dd></div>
        <div><dt>Services</dt><dd>{scopeActive ? `${scopedGraph.nodes.length}/${aggregate.nodes.length}` : aggregate.nodes.length}</dd></div>
        <div><dt>Edges</dt><dd>{scopeActive ? `${scopedGraph.edges.length}/${aggregate.edges.length}` : aggregate.edges.length}</dd></div>
      </dl>}
      <div className={styles.toolbarActions}>
        <span className={styles.sampleLabel}>Analysis sample</span>
        <div className={styles.sampleSelect}><Combobox label="Analysis sample" labelVisibility="sr-only" mode="inline" value={String(sampleLimit)} options={SAMPLE_OPTIONS} onChange={(value) => onSampleLimitChange(Number(value))} disabled={progress.status === 'loading'} /></div>
        {progress.status === 'loading' ? <button type="button" className="btn ghost" onClick={onStop}>Stop</button> : <button type="button" className="btn ghost" onClick={onRetry}>Re-analyze</button>}
      </div>
    </div>

    {progress.status === 'loading' && <div className={styles.progress} role="status" aria-live="polite"><div><strong>Analyzing traces…</strong><span>{progress.completed}/{progress.total} fetched · {progressPercent}%{progress.failed ? ` · ${progress.failed} failed` : ''}</span></div><progress value={progress.completed} max={Math.max(1, progress.total)} /></div>}
    {progress.status === 'partial' && <div className={styles.notice}>Analysis is partial after {progress.completed}/{progress.total} fetches. The map uses the traces that loaded successfully.</div>}
    {progress.status === 'error' && <div className={styles.notice}>DataKoala could not load enough full traces to build the service map. Try a smaller sample or narrower time range.</div>}

    {aggregate.traceCount === 0 ? <div className={styles.empty}>{progress.status === 'loading' ? 'Waiting for the first complete traces…' : 'Analyze this Tempo cohort to build a service map.'}</div> : <div className={styles.analysisGrid}>
      <div className={`${styles.graphPane} ${graphFullscreen ? styles.graphPaneFullscreen : ''}`} data-service-map-graph-fullscreen={graphFullscreen ? 'true' : 'false'} style={graphFullscreen ? { top: TITLEBAR_HEIGHT } : undefined}>
        <div className={styles.graphControls}>
          <div className={styles.searchInput}><TextInput label="Find service in map" labelVisibility="sr-only" mode="inline" type="search" placeholder="Find service…" value={serviceSearch} onValueChange={setServiceSearch} /></div>
          <div className={styles.groupingSelect}><Combobox label="Service grouping" labelVisibility="sr-only" mode="inline" value={grouping} options={GROUPING_OPTIONS} onChange={(value) => { setGrouping(value as TraceServiceMapGrouping); setExpandedGroups(new Set()) }} /></div>
          {grouping === 'namespace' && expandedGroups.size > 0 && <button type="button" className={styles.fullscreenButton} onClick={() => setExpandedGroups(new Set())} aria-label="Collapse all namespace groups">Collapse groups</button>}
          <div className={styles.branchSelect}><Combobox label="Branch scope" labelVisibility="sr-only" mode="inline" value={branchScope} options={BRANCH_SCOPE_OPTIONS} onChange={(value) => setBranchScope(value as TraceServiceMapScope)} /></div>
          <button type="button" className={styles.fullscreenButton} data-service-map-fullscreen onClick={() => setGraphFullscreen((value) => !value)} aria-label={graphFullscreen ? 'Exit service map full screen' : 'Open service map full screen'}>{graphFullscreen ? 'Exit full screen' : 'Full screen'}</button>
        </div>
        <div className={`${styles.chartArea} ${graphFullscreen ? styles.chartAreaFullscreen : ''}`}>
          {graph.edges.length ? <ReactECharts ref={chartRef} option={option} onEvents={events} notMerge lazyUpdate style={{ width: '100%', height: '100%' }} /> : <div className={styles.empty}>{scopeEmptyMessage}</div>}
        </div>
        {graphFullscreen && <aside className={styles.fullscreenInsights} aria-label="Full screen service map bottlenecks">{insightsContent(true)}</aside>}
        <div className={`${styles.graphLegend} ${graphFullscreen ? styles.graphLegendFullscreen : ''}`}>
          <span><i className={styles.solidLine} /> synchronous</span><span><i className={styles.dashedLine} /> async / messaging</span><span><i className={styles.accentLine} /> slow-trace uplift</span><span><i className={styles.errorLine} /> errors</span><span>edge width = cohort coverage</span><span>Drag to pan · wheel to zoom</span>
          {branchScope === 'main' && <span>Async boundaries and their downstream work are hidden</span>}
          {branchScope === 'async' && <span>Includes downstream work after the first async boundary</span>}
          {grouping === 'namespace' && <span>{collapsedGroups} collapsed namespace{collapsedGroups === 1 ? '' : 's'}{expandedGroups.size ? ` · ${expandedGroups.size} expanded` : ''}</span>}
          {normalizedSearch && <span>{matchingServiceIds.size} matching service{matchingServiceIds.size === 1 ? '' : 's'}</span>}
          {graphIsProjected && <span title="The candidate ranking still uses every analyzed service and edge in the selected branch scope.">Showing {graph.nodes.length}/{groupedGraph.nodes.length} graph nodes · {graph.edges.length}/{groupedGraph.edges.length} edges</span>}
        </div>
      </div>
      <aside className={styles.insights} aria-label="Service map bottleneck analysis">{insightsContent()}</aside>
    </div>}
  </div>
}
