import { TextInput } from './ui/TextInput'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LokiLogResult, LokiQueryResult } from '@shared/loki'
import { DEFAULT_LOKI_BUILDER } from '@shared/loki'
import { buildLokiQuery, logqlResultKind } from '@shared/loki-builder'
import { CHART_SERIES_HARD_LIMIT, CHART_SERIES_SOFT_LIMIT } from '@shared/chartLimits'
import { buildLokiTrendExpressions } from '@shared/loki-trend'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { logql } from '../lib/logqlLanguage'
import { useLokiLabelsResource } from '../lib/useLokiLabelsResource'
import { api } from '../lib/api'
import { TimeRangeField } from './time-range/TimeRangeField'
import { LogResultExplorer } from './LogResultExplorer'
import { ResultExplorer } from './ResultExplorer'
import { LokiBuilderPanel } from './LokiBuilderPanel'
import { ModeSwitch } from './ModeSwitch'
import { QueryUtilityActions } from './QueryUtilityActions'
import { CopySqlButton } from './CopySqlButton'
import { ChartPicker, type ChartPickerView } from './ChartPicker'
import { selectActiveSession, useStore } from '../store/useStore'
import styles from './LokiExplorer.module.css'
import type { VisualizationConfiguration } from '../lib/resultVisualization'

const defaultRange: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }
function interval(start: string, end: string): string {
  const targetSeconds = Math.max(1, (Date.parse(end) - Date.parse(start)) / 250_000)
  const choices = [1, 5, 10, 30, 60, 300, 900, 3600, 10_800, 21_600, 86_400]
  return `${choices.find((item) => item >= targetSeconds) ?? 86_400}s`
}
interface LokiTrendRange { startMs: number; endMs: number }

function customRange({ startMs, endMs }: LokiTrendRange): BuilderTimeRange {
  const start = new Date(startMs), end = new Date(endMs)
  return { kind: 'custom', startDate: start.toISOString().slice(0, 10), startTime: start.toISOString().slice(11, 16), endDate: end.toISOString().slice(0, 10), endTime: end.toISOString().slice(11, 16), recurringWindows: [] }
}

export function LokiExplorer({ connectionId }: { connectionId: string }) {
  const session = useStore(selectActiveSession)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const setLokiState = useStore((state) => state.setLokiState)
  const clearActiveResults = useStore((state) => state.clearActiveResults)
  const mode = session.queryMode === 'builder' ? 'builder' : 'logql'
  const { sql: query, lokiBuilder: builder, lokiTimeRange: range, lokiResultLimit: limit, lokiGroupBy: groupBy, lokiResultView: resultView } = session
  const connectionGeneration = useStore((state) => state.connectionGeneration)
  const labelResource = useLokiLabelsResource(connectionId, connectionGeneration, session.id, range)
  const labels = [...new Set([...labelResource.labels, ...builder.labelMatchers.map(({ label }) => label).filter((label) => !label.startsWith('__')), ...groupBy])].sort()
  const [result, setResult] = useState<LokiQueryResult | null>(null)
  const [trend, setTrend] = useState<LokiQueryResult | null>(null)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [trendVisualization, setTrendVisualization] = useState<VisualizationConfiguration>({ view: 'line', xColumn: 'timestamp', valueColumn: 'value', aggregation: 'sum', seriesColumn: null, seriesColumns: [], hierarchyDimensions: [], valueAxisScale: 'linear', anomalyDetectionEnabled: false })
  const revision = useRef(0), trendRevision = useRef(0), hasRun = useRef(false), mounted = useRef(true)
  const trendCacheKey = useRef<string | null>(null)
  const rangeKey = JSON.stringify(range), previousRangeKey = useRef(rangeKey)
  const generated = useMemo(() => { try { return builder.labelMatchers.length ? buildLokiQuery(builder) : '' } catch { return '' } }, [builder])
  const expression = mode === 'builder' ? generated : query
  const isCurrentTab = (tabId: string) => mounted.current && useStore.getState().activeTabId === tabId
  const clearResults = () => { revision.current++; trendRevision.current++; hasRun.current = false; trendCacheKey.current = null; setResult(null); setTrend(null); setError(null); setWarning(null); setTrendError(null); setLoading(false); clearActiveResults() }
  const resetQuery = () => { clearResults(); setSql(''); setLokiState({ lokiBuilder: { ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }, lokiTimeRange: defaultRange, lokiResultLimit: 1000, lokiGroupBy: [], lokiRangeHistory: [], lokiResultView: 'list' }) }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; trendRevision.current++ } }, [])
  useLayoutEffect(() => { revision.current++; trendRevision.current++; hasRun.current = false; previousRangeKey.current = rangeKey; setResult(null); setTrend(null); setTrendError(null); setError(null); setWarning(null); setLoading(false) }, [session.id])
  useEffect(() => {
    if (resultView === 'list' || resultView === 'table') return
    setTrendVisualization((current) => ({ ...current, view: resultView, xColumn: 'timestamp', valueColumn: 'value', aggregation: 'sum', seriesColumn: groupBy.length === 1 ? groupBy[0] : null, seriesColumns: groupBy.length > 1 ? groupBy : [], hierarchyDimensions: groupBy }))
  }, [resultView, groupBy.join('\0'), session.id])

  const loadTrend = async (tabId: string, queryExpression: string, queryRange: BuilderTimeRange, queryGroupBy: string[]) => {
    let kind: 'logs' | 'metrics'
    try { kind = logqlResultKind(queryExpression) } catch { return }
    if (kind !== 'logs') return
    const bounds = prometheusRangeBounds(queryRange), step = interval(bounds.start, bounds.end)
    const key = JSON.stringify([tabId, connectionId, queryExpression, bounds, queryGroupBy])
    if (trendCacheKey.current === key && trend) return
    const current = ++trendRevision.current
    setTrendError(null)
    try {
      const plan = buildLokiTrendExpressions(queryExpression, step, queryGroupBy, kind)!
      if (plan.cardinalityProbe && queryGroupBy.length > 0) {
        const probe = await api.query.runLoki(connectionId, { expression: plan.cardinalityProbe, ...bounds, step, limit: 1 }).catch((error) => { throw new Error(`Cardinality probe failed: ${error instanceof Error ? error.message : String(error)}`) })
        if (current !== trendRevision.current || !isCurrentTab(tabId)) return
        const count = Math.max(0, ...probe.rows.map((row) => Number(row.value) || 0))
        if (count > CHART_SERIES_HARD_LIMIT) throw new Error(`Group by ${queryGroupBy.join(', ')} was rejected before fetching: ${count} series exceeds the hard limit of ${CHART_SERIES_HARD_LIMIT}.`)
        if (count > CHART_SERIES_SOFT_LIMIT) setWarning(`Group by ${queryGroupBy.join(', ')} contains ${count} series; charts may be dense.`)
      }
      const volume = await api.query.runLoki(connectionId, { expression: plan.trend, ...bounds, step, limit: CHART_SERIES_HARD_LIMIT }).catch((error) => { throw new Error(`Log volume query failed: ${error instanceof Error ? error.message : String(error)}`) })
      if (current !== trendRevision.current || !isCurrentTab(tabId)) return
      trendCacheKey.current = key; setTrend(volume)
    } catch (caught) { if (current === trendRevision.current && isCurrentTab(tabId)) setTrendError(caught instanceof Error ? caught.message : String(caught)) }
  }
  const run = async () => {
    const tabId = session.id
    if (!expression.trim()) return setError(mode === 'builder' ? 'Choose a value for at least one indexed label.' : 'Enter a LogQL query.')
    let kind: 'logs' | 'metrics'
    try { kind = logqlResultKind(expression) } catch (caught) { return setError(caught instanceof Error ? caught.message : String(caught)) }
    const current = ++revision.current
    trendRevision.current++; trendCacheKey.current = null; setTrend(null)
    hasRun.current = true; setLoading(true); setError(null); setTrendError(null); setWarning(null)
    const bounds = prometheusRangeBounds(range), step = interval(bounds.start, bounds.end)
    try {
      const chartRequest = kind === 'logs' && resultView !== 'list' && resultView !== 'table' ? loadTrend(tabId, expression, range, groupBy) : Promise.resolve()
      const main = await api.query.runLoki(connectionId, { expression, ...bounds, step, limit })
      await chartRequest
      if (current !== revision.current || !isCurrentTab(tabId)) return
      setResult(main); useStore.getState().completeQuery(main, null, tabId)
    } catch (caught) { if (current === revision.current && isCurrentTab(tabId)) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { if (current === revision.current && isCurrentTab(tabId)) setLoading(false) }
  }
  useEffect(() => { if (previousRangeKey.current === rangeKey) return; previousRangeKey.current = rangeKey; if (hasRun.current) void run() }, [rangeKey])
  useEffect(() => { if (hasRun.current && resultView !== 'list' && resultView !== 'table' && result?.resultKind === 'logs' && expression.trim()) void loadTrend(session.id, expression, range, groupBy) }, [resultView, groupBy.join('\0'), rangeKey])
  const selectRange = (selected: LokiTrendRange) => setLokiState({ lokiRangeHistory: [...session.lokiRangeHistory, range], lokiTimeRange: customRange(selected) })
  const restoreRange = (reset = false) => { const history = session.lokiRangeHistory; const prior = reset ? history[0] : history.at(-1); if (prior) setLokiState({ lokiTimeRange: prior, lokiRangeHistory: reset ? [] : history.slice(0, -1) }) }
  const resultFilter = (kind: 'label' | 'field', key: string, value: string, exclude: boolean) => {
    if (kind === 'label') setLokiState({ lokiBuilder: { ...builder, labelMatchers: [...builder.labelMatchers.filter((matcher) => matcher.label !== key), { label: key, operator: exclude ? '!=' : '=', value }] } })
    else setLokiState({ lokiBuilder: { ...builder, fieldFilters: [...builder.fieldFilters.filter((filter) => filter.field !== key), { field: key, operator: exclude ? '!=' : '=', value }] } })
    setMode('builder')
  }
  const format = async () => { const original = query; try { setSql(await api.connections.loki.formatQuery(connectionId, original)) } catch (caught) { setError(`Formatting failed; query was not changed. ${caught instanceof Error ? caught.message : String(caught)}`) } }

  return <main className={styles.workspace} aria-label="Loki explorer">
    <section className={styles.queryPanel}>
      <div className={`editor-head data-query-toolbar ${styles.queryToolbar}`} data-query-toolbar>
        <div className="query-toolbar-group query-mode-group"><ModeSwitch /></div>
        <div className={`query-toolbar-group query-time-group ${styles.queryOptions}`}><TimeRangeField value={range} onChange={(value) => setLokiState({ lokiTimeRange: value })} /><div className={styles.limit}><TextInput label="Limit" mode="inline" type="number" min={1} max={5000} value={limit} onValueChange={(text) => setLokiState({ lokiResultLimit: Math.max(1, Math.min(5000, Number(text))) })} /></div>{session.lokiRangeHistory.length > 0 && <div className={styles.rangeHistory}><button type="button" className="btn ghost" onClick={() => restoreRange()}>Back</button><button type="button" className="btn ghost" onClick={() => restoreRange(true)}>Reset range</button></div>}</div>
        <div className="spacer" />
        <div className="query-toolbar-group"><QueryUtilityActions hasResults={Boolean(result || trend || error || warning)} onClearResults={clearResults} onResetQuery={resetQuery} /></div>
        <div className={`query-toolbar-group query-editor-actions ${styles.editorActions}`}>{mode === 'logql' && <button type="button" className="btn ghost" onClick={() => void format()} disabled={!query.trim()}>Format</button>}<CopySqlButton sql={expression} language="LogQL" /></div>
        <div className="query-toolbar-group execution-group"><button className="btn primary" type="button" onClick={() => void run()} disabled={loading || !expression.trim()} title="Run (Ctrl/Command+Enter)">{loading ? 'Running…' : 'Run'}</button></div>
      </div>
      {mode === 'logql' ? <div className={styles.editor}><CodeMirror value={query} minHeight="66px" maxHeight="150px" theme={oneDark} extensions={[logql()]} onChange={(value) => setSql(value)} aria-label="LogQL editor" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run() } }} basicSetup={{ lineNumbers: true, foldGutter: false }} /></div> : <LokiBuilderPanel value={builder} generated={generated} labels={labels} connectionId={connectionId} bounds={labelResource.bounds} groupBy={groupBy} metadataStatus={labelResource.status} metadataError={labelResource.error} onChange={(lokiBuilder) => setLokiState({ lokiBuilder })} onGroupByChange={(lokiGroupBy) => setLokiState({ lokiGroupBy })} onOpenLogql={() => { setSql(generated); setMode('sql') }} />}
    </section>
    {error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}{labelResource.status === 'error' && <div className={styles.status}>Metadata unavailable: {labelResource.error}. Raw LogQL remains available.</div>}{warning && <div className={styles.status}>{warning}</div>}
    <section className={styles.results} aria-label="Loki query results">{result?.resultKind === 'logs' ? <>
      <div className={styles.resultViewBar}><ChartPicker value={resultView} availableViews={['list', 'table', 'bar', 'line', 'area', 'scatter', 'treemap', 'sunburst']} onChange={(view: ChartPickerView) => setLokiState({ lokiResultView: view as typeof resultView })} />{resultView !== 'list' && session.lokiRangeHistory.length > 0 && <div className={styles.rangeHistory}><button type="button" className="btn ghost" onClick={() => restoreRange()}>Back</button><button type="button" className="btn ghost" onClick={() => restoreRange(true)}>Reset range</button></div>}</div>
      <div className={styles.selectedView}>{resultView === 'list'
        ? <LogResultExplorer selectionKey={`${session.id}:${revision.current}`} rows={(result as LokiLogResult).logRows} truncated={result.execution?.truncated} limit={limit} onFilter={resultFilter} />
        : resultView === 'table' ? <ResultExplorer mode="sql" hasRun resultOverride={result} configurationOverride={{ ...trendVisualization, view: 'table' }} onConfigurationChange={setTrendVisualization} hidePicker />
        : trendError ? <div className={styles.empty}>Log volume unavailable: {trendError}</div>
          : trend?.resultKind === 'metrics' ? <ResultExplorer mode="sql" hasRun resultOverride={trend} configurationOverride={trendVisualization} onConfigurationChange={setTrendVisualization} hidePicker onTemporalRangeSelected={selectRange} />
            : <div className={styles.empty}>Loading log volume…</div>}</div>
    </> : result?.resultKind === 'metrics' ? <ResultExplorer mode="sql" hasRun /> : !loading && <div className={styles.empty}>Run a LogQL investigation to see results.</div>}</section>
  </main>
}
