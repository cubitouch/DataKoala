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
import { lokiLabels } from '../lib/lokiMetadata'
import { api } from '../lib/api'
import { TimeRangeField } from './time-range/TimeRangeField'
import { LogResultExplorer } from './LogResultExplorer'
import { ResultExplorer } from './ResultExplorer'
import { LokiTrendChart } from './LokiTrendChart'
import { LokiBuilderPanel } from './LokiBuilderPanel'
import { ModeSwitch } from './ModeSwitch'
import { QueryUtilityActions } from './QueryUtilityActions'
import { CopySqlButton } from './CopySqlButton'
import type { LokiTrendRange } from '../lib/lokiTrendRange'
import { selectActiveSession, useStore } from '../store/useStore'
import styles from './LokiExplorer.module.css'

const defaultRange: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }
function interval(start: string, end: string): string {
  const targetSeconds = Math.max(1, (Date.parse(end) - Date.parse(start)) / 250_000)
  const choices = [1, 5, 10, 30, 60, 300, 900, 3600, 10_800, 21_600, 86_400]
  return `${choices.find((item) => item >= targetSeconds) ?? 86_400}s`
}
function customRange({ startMs, endMs }: LokiTrendRange): BuilderTimeRange {
  const start = new Date(startMs), end = new Date(endMs)
  return { kind: 'custom', startDate: start.toISOString().slice(0, 10), startTime: start.toISOString().slice(11, 16), endDate: end.toISOString().slice(0, 10), endTime: end.toISOString().slice(11, 16), recurringWindows: [] }
}

function ResultViewSwitch({ value, onChange }: { value: 'list' | 'chart'; onChange: (value: 'list' | 'chart') => void }) {
  return <div className={styles.viewSwitch} aria-label="Log result view"><button type="button" aria-pressed={value === 'list'} onClick={() => onChange('list')}>List</button><button type="button" aria-pressed={value === 'chart'} onClick={() => onChange('chart')}>Chart</button></div>
}

export function LokiExplorer({ connectionId }: { connectionId: string }) {
  const session = useStore(selectActiveSession)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const setLokiState = useStore((state) => state.setLokiState)
  const clearActiveResults = useStore((state) => state.clearActiveResults)
  const mode = session.queryMode === 'builder' ? 'builder' : 'logql'
  const { sql: query, lokiBuilder: builder, lokiTimeRange: range, lokiResultLimit: limit, lokiBreakdown: breakdown, lokiResultView: resultView } = session
  const [labels, setLabels] = useState<string[]>([])
  const [result, setResult] = useState<LokiQueryResult | null>(null)
  const [trend, setTrend] = useState<LokiQueryResult | null>(null)
  const [trendError, setTrendError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const revision = useRef(0), metadataRevision = useRef(0), trendRevision = useRef(0), hasRun = useRef(false), mounted = useRef(true)
  const trendCacheKey = useRef<string | null>(null)
  const rangeKey = JSON.stringify(range), previousRangeKey = useRef(rangeKey)
  const generated = useMemo(() => { try { return builder.labelMatchers.length ? buildLokiQuery(builder) : '' } catch { return '' } }, [builder])
  const expression = mode === 'builder' ? generated : query
  const isCurrentTab = (tabId: string) => mounted.current && useStore.getState().activeTabId === tabId
  const clearResults = () => { revision.current++; trendRevision.current++; hasRun.current = false; trendCacheKey.current = null; setResult(null); setTrend(null); setError(null); setWarning(null); setTrendError(null); setLoading(false); clearActiveResults() }
  const resetQuery = () => { clearResults(); setSql(''); setLokiState({ lokiBuilder: { ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }, lokiTimeRange: defaultRange, lokiResultLimit: 1000, lokiBreakdown: null, lokiRangeHistory: [], lokiResultView: 'list' }) }
  const loadLabels = async () => {
    const tabId = session.id, current = ++metadataRevision.current
    try { const next = await lokiLabels(connectionId, prometheusRangeBounds(range)); if (current === metadataRevision.current && isCurrentTab(tabId)) setLabels(next) }
    catch (caught) { if (current === metadataRevision.current && isCurrentTab(tabId)) setWarning(`Metadata unavailable: ${caught instanceof Error ? caught.message : String(caught)}. Raw LogQL remains available.`) }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; metadataRevision.current++ } }, [])
  useLayoutEffect(() => { revision.current++; trendRevision.current++; metadataRevision.current++; hasRun.current = false; previousRangeKey.current = rangeKey; setResult(null); setTrend(null); setTrendError(null); setError(null); setWarning(null); setLoading(false); setLabels([]) }, [session.id])
  useEffect(() => { void loadLabels() }, [connectionId, rangeKey, session.id])

  const loadTrend = async (tabId: string, queryExpression: string, queryRange: BuilderTimeRange, queryBreakdown: string | null) => {
    let kind: 'logs' | 'metrics'
    try { kind = logqlResultKind(queryExpression) } catch { return }
    if (kind !== 'logs') return
    const bounds = prometheusRangeBounds(queryRange), step = interval(bounds.start, bounds.end)
    const key = JSON.stringify([tabId, connectionId, queryExpression, bounds, queryBreakdown])
    if (trendCacheKey.current === key && trend) return
    const current = ++trendRevision.current
    setTrendError(null)
    try {
      const plan = buildLokiTrendExpressions(queryExpression, step, queryBreakdown, kind)!
      if (plan.cardinalityProbe && queryBreakdown) {
        const probe = await api.query.runLoki(connectionId, { expression: plan.cardinalityProbe, ...bounds, step, limit: 1 })
        if (current !== trendRevision.current || !isCurrentTab(tabId)) return
        const count = Math.max(0, ...probe.rows.map((row) => Number(row.value) || 0))
        if (count > CHART_SERIES_HARD_LIMIT) throw new Error(`Breakdown by ${queryBreakdown} was rejected before fetching: ${count} series exceeds the hard limit of ${CHART_SERIES_HARD_LIMIT}.`)
        if (count > CHART_SERIES_SOFT_LIMIT) setWarning(`Breakdown by ${queryBreakdown} contains ${count} series; charts may be dense.`)
      }
      const volume = await api.query.runLoki(connectionId, { expression: plan.trend, ...bounds, step, limit: CHART_SERIES_HARD_LIMIT })
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
      const chartRequest = kind === 'logs' && resultView === 'chart' ? loadTrend(tabId, expression, range, breakdown) : Promise.resolve()
      const main = await api.query.runLoki(connectionId, { expression, ...bounds, step, limit })
      await chartRequest
      if (current !== revision.current || !isCurrentTab(tabId)) return
      setResult(main); useStore.getState().completeQuery(main, null, tabId)
    } catch (caught) { if (current === revision.current && isCurrentTab(tabId)) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { if (current === revision.current && isCurrentTab(tabId)) setLoading(false) }
  }
  useEffect(() => { if (previousRangeKey.current === rangeKey) return; previousRangeKey.current = rangeKey; if (hasRun.current) void run() }, [rangeKey])
  useEffect(() => { if (hasRun.current && resultView === 'chart' && result?.resultKind === 'logs' && expression.trim()) void loadTrend(session.id, expression, range, breakdown) }, [resultView, breakdown, rangeKey])
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
        <div className={`query-toolbar-group query-time-group ${styles.queryOptions}`}><TimeRangeField value={range} onChange={(value) => setLokiState({ lokiTimeRange: value })} /><label className={styles.limit}>Limit<input aria-label="Loki result limit" type="number" min={1} max={5000} value={limit} onChange={(event) => setLokiState({ lokiResultLimit: Math.max(1, Math.min(5000, Number(event.target.value))) })} /></label>{session.lokiRangeHistory.length > 0 && <div className={styles.rangeHistory}><button type="button" className="btn ghost" onClick={() => restoreRange()}>Back</button><button type="button" className="btn ghost" onClick={() => restoreRange(true)}>Reset range</button></div>}</div>
        <div className="spacer" />
        <div className="query-toolbar-group"><QueryUtilityActions hasResults={Boolean(result || trend || error || warning)} onClearResults={clearResults} onResetQuery={resetQuery} /></div>
        <div className={`query-toolbar-group query-editor-actions ${styles.editorActions}`}>{mode === 'logql' && <button type="button" className="btn ghost" onClick={() => void format()} disabled={!query.trim()}>Format</button>}<CopySqlButton sql={expression} language="LogQL" /></div>
        <div className="query-toolbar-group execution-group"><button className="btn primary" type="button" onClick={() => void run()} disabled={loading || !expression.trim()} title="Run (Ctrl/Command+Enter)">{loading ? 'Running…' : 'Run'}</button></div>
      </div>
      {mode === 'logql' ? <div className={styles.editor}><CodeMirror value={query} minHeight="66px" maxHeight="150px" theme={oneDark} extensions={[logql()]} onChange={(value) => setSql(value)} aria-label="LogQL editor" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run() } }} basicSetup={{ lineNumbers: true, foldGutter: false }} /></div> : <LokiBuilderPanel value={builder} generated={generated} labels={labels} connectionId={connectionId} range={range} breakdown={breakdown} onChange={(lokiBuilder) => setLokiState({ lokiBuilder })} onBreakdownChange={(lokiBreakdown) => setLokiState({ lokiBreakdown })} onRefresh={() => void loadLabels()} onOpenLogql={() => { setSql(generated); setMode('sql') }} />}
    </section>
    {error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}{warning && <div className={styles.status}>{warning}</div>}
    <section className={styles.results} aria-label="Loki query results">{result?.resultKind === 'logs' ? resultView === 'list' ? <LogResultExplorer selectionKey={`${session.id}:${revision.current}`} rows={(result as LokiLogResult).logRows} truncated={result.execution?.truncated} limit={limit} onFilter={resultFilter} toolbarLeading={<ResultViewSwitch value={resultView} onChange={(lokiResultView) => setLokiState({ lokiResultView })} />} /> : <><div className={styles.chartToolbar}><ResultViewSwitch value={resultView} onChange={(lokiResultView) => setLokiState({ lokiResultView })} />{session.lokiRangeHistory.length > 0 && <div className={styles.rangeHistory}><button type="button" className="btn ghost" onClick={() => restoreRange()}>Back</button><button type="button" className="btn ghost" onClick={() => restoreRange(true)}>Reset range</button></div>}</div>{trendError ? <div className={styles.empty}>Log volume unavailable: {trendError}</div> : trend?.resultKind === 'metrics' ? <LokiTrendChart result={trend} onRangeSelected={selectRange} /> : <div className={styles.empty}>Loading log volume…</div>}</> : result?.resultKind === 'metrics' ? <ResultExplorer mode="sql" hasRun /> : !loading && <div className={styles.empty}>Run a LogQL investigation to see results.</div>}</section>
  </main>
}
