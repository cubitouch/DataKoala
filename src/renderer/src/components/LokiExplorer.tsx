import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LokiLabelMatcher, LokiLogResult, LokiQueryResult } from '@shared/loki'
import { buildLokiQuery, logqlResultKind } from '@shared/loki-builder'
import { CHART_SERIES_HARD_LIMIT, CHART_SERIES_SOFT_LIMIT } from '@shared/chartLimits'
import { buildLokiTrendExpressions } from '@shared/loki-trend'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { logql } from '../lib/logqlLanguage'
import { lokiLabels, lokiLabelValues } from '../lib/lokiMetadata'
import { api } from '../lib/api'
import { TimeRangeField } from './time-range/TimeRangeField'
import { LogResultExplorer } from './LogResultExplorer'
import { ResultExplorer } from './ResultExplorer'
import { LokiTrendChart } from './LokiTrendChart'
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

function LabelMatcherRow({ matcher, index, labels, matchers, connectionId, range, onChange, onRemove }: { matcher: LokiLabelMatcher; index: number; labels: string[]; matchers: LokiLabelMatcher[]; connectionId: string; range: BuilderTimeRange; onChange: (patch: Partial<LokiLabelMatcher>) => void; onRemove: () => void }) {
  const [values, setValues] = useState<string[]>([]); const [valueError, setValueError] = useState<string | null>(null)
  useEffect(() => {
    if (!matcher.label) return
    let active = true
    const timer = window.setTimeout(() => {
      const bounds = prometheusRangeBounds(range)
      lokiLabelValues(connectionId, matcher.label, bounds, matchers).then((next) => { if (active) setValues(next) }).catch((error) => { if (active) setValueError(error instanceof Error ? error.message : String(error)) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [connectionId, matcher.label, matchers, range])
  return <div className={styles.builderRow}><input list="loki-labels" aria-label={`Label name ${index + 1}`} value={matcher.label} onChange={(event) => onChange({ label: event.target.value })} /><select aria-label={`Label operator ${index + 1}`} value={matcher.operator} onChange={(event) => onChange({ operator: event.target.value as LokiLabelMatcher['operator'] })}>{['=', '!=', '=~', '!~'].map((operator) => <option key={operator}>{operator}</option>)}</select><input list={`loki-values-${index}`} aria-label={`Label value ${index + 1}`} value={matcher.value} onChange={(event) => onChange({ value: event.target.value })} /><datalist id={`loki-values-${index}`}>{values.map((value) => <option key={value}>{value}</option>)}</datalist><button aria-label="Remove label filter" onClick={onRemove}>×</button>{valueError && <small title={valueError}>Values unavailable</small>}<datalist id="loki-labels">{labels.map((label) => <option key={label}>{label}</option>)}</datalist></div>
}

export function LokiExplorer({ connectionId }: { connectionId: string }) {
  const session = useStore(selectActiveSession); const setSql = useStore((state) => state.setSql); const setMode = useStore((state) => state.setQueryMode); const setLokiState = useStore((state) => state.setLokiState)
  const mode = session.queryMode === 'builder' ? 'builder' : 'logql'; const query = session.sql; const builder = session.lokiBuilder; const range = session.lokiTimeRange; const limit = session.lokiResultLimit; const breakdown = session.lokiBreakdown
  const [labels, setLabels] = useState<string[]>([]); const [result, setResult] = useState<LokiQueryResult | null>(null); const [trend, setTrend] = useState<LokiQueryResult | null>(null); const [trendError, setTrendError] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [warning, setWarning] = useState<string | null>(null); const [loading, setLoading] = useState(false)
  const revision = useRef(0); const metadataRevision = useRef(0); const hasRun = useRef(false); const mounted = useRef(true); const rangeKey = JSON.stringify(range); const previousRangeKey = useRef(rangeKey)
  const generated = useMemo(() => { try { return builder.labelMatchers.length ? buildLokiQuery(builder) : '' } catch { return '' } }, [builder]); const expression = mode === 'builder' ? generated : query
  const patchBuilder = (patch: Partial<typeof builder>) => setLokiState({ lokiBuilder: { ...builder, ...patch } })
  const isCurrentTab = (tabId: string) => mounted.current && useStore.getState().activeTabId === tabId
  const loadLabels = async () => { const tabId = session.id; const current = ++metadataRevision.current; const bounds = prometheusRangeBounds(range); try { const next = await lokiLabels(connectionId, bounds); if (current === metadataRevision.current && isCurrentTab(tabId)) setLabels(next) } catch (caught) { if (current === metadataRevision.current && isCurrentTab(tabId)) setWarning(`Metadata unavailable: ${caught instanceof Error ? caught.message : String(caught)}. Raw LogQL remains available.`) } }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; metadataRevision.current++ } }, [])
  useLayoutEffect(() => {
    revision.current++; metadataRevision.current++; hasRun.current = false; previousRangeKey.current = rangeKey
    setResult(null); setTrend(null); setTrendError(null); setError(null); setWarning(null); setLoading(false); setLabels([])
  }, [session.id])
  useEffect(() => { void loadLabels() }, [connectionId, rangeKey, session.id])

  const run = async () => {
    const tabId = session.id
    if (!expression.trim()) return setError(mode === 'builder' ? 'Add at least one indexed label matcher.' : 'Enter a LogQL query.')
    let kind: 'logs' | 'metrics'; try { kind = logqlResultKind(expression) } catch (caught) { return setError(caught instanceof Error ? caught.message : String(caught)) }
    const current = ++revision.current; hasRun.current = true; setLoading(true); setError(null); setTrendError(null); setWarning(null)
    const bounds = prometheusRangeBounds(range); const step = interval(bounds.start, bounds.end)
    try {
      const primary = api.query.runLoki(connectionId, { expression, ...bounds, step, limit })
      let volume: Promise<LokiQueryResult | null> = Promise.resolve(null)
      if (kind === 'logs') {
        const trendPlan = buildLokiTrendExpressions(expression, step, breakdown, kind)!
        volume = (async () => {
          if (trendPlan.cardinalityProbe && breakdown) {
            const probe = await api.query.runLoki(connectionId, { expression: trendPlan.cardinalityProbe, ...bounds, step, limit: 1 })
            const count = Math.max(0, ...probe.rows.map((row) => Number(row.value) || 0))
            if (count > CHART_SERIES_HARD_LIMIT) throw new Error(`Breakdown by ${breakdown} was rejected before fetching: ${count} series exceeds the hard limit of ${CHART_SERIES_HARD_LIMIT}.`)
            if (count > CHART_SERIES_SOFT_LIMIT && isCurrentTab(tabId)) setWarning(`Breakdown by ${breakdown} contains ${count} series; charts may be dense.`)
          }
          return api.query.runLoki(connectionId, { expression: trendPlan.trend, ...bounds, step, limit: CHART_SERIES_HARD_LIMIT })
        })().catch((caught) => { if (current === revision.current && isCurrentTab(tabId)) setTrendError(caught instanceof Error ? caught.message : String(caught)); return null })
      }
      const [main, volumeResult] = await Promise.all([primary, volume])
      if (current !== revision.current || !isCurrentTab(tabId)) return
      setResult(main); setTrend(volumeResult)
      useStore.getState().completeQuery(main, null, tabId)
    } catch (caught) { if (current === revision.current && isCurrentTab(tabId)) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { if (current === revision.current && isCurrentTab(tabId)) setLoading(false) }
  }
  useEffect(() => {
    if (previousRangeKey.current === rangeKey) return
    previousRangeKey.current = rangeKey
    if (hasRun.current) void run()
  }, [rangeKey])
  const selectRange = (selected: LokiTrendRange) => setLokiState({ lokiRangeHistory: [...session.lokiRangeHistory, range], lokiTimeRange: customRange(selected) })
  const back = () => { const history = session.lokiRangeHistory; const prior = history[history.length - 1]; if (prior) setLokiState({ lokiTimeRange: prior, lokiRangeHistory: history.slice(0, -1) }) }
  const resultFilter = (kind: 'label' | 'field', key: string, value: string, exclude: boolean) => { if (kind === 'label') patchBuilder({ labelMatchers: [...builder.labelMatchers, { label: key, operator: exclude ? '!=' : '=', value }] }); else patchBuilder({ fieldFilters: [...builder.fieldFilters, { field: key, operator: exclude ? '!=' : '=', value }] }); setMode('builder') }
  return <main className={styles.workspace}><div className={styles.toolbar}><button className={mode === 'builder' ? 'btn primary' : 'btn ghost'} onClick={() => setMode('builder')}>Builder</button><button className={mode === 'logql' ? 'btn primary' : 'btn ghost'} onClick={() => setMode('sql')}>LogQL</button><TimeRangeField value={range} onChange={(value) => setLokiState({ lokiTimeRange: value })} /><button disabled={!session.lokiRangeHistory.length} onClick={back}>Back</button><button onClick={() => setLokiState({ lokiRangeHistory: [...session.lokiRangeHistory, range], lokiTimeRange: defaultRange })}>Reset range</button><label>Limit <input type="number" min={1} max={5000} value={limit} onChange={(event) => setLokiState({ lokiResultLimit: Math.max(1, Math.min(5000, Number(event.target.value))) })} /></label></div>{mode === 'logql' ? <CodeMirror className={styles.editor} value={query} theme={oneDark} extensions={[logql()]} onChange={(value) => setSql(value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run() } }} /> : <section className={styles.builder}><div className={styles.toolbar}><button onClick={() => void loadLabels()}>Refresh labels</button><button onClick={() => patchBuilder({ labelMatchers: [...builder.labelMatchers, { label: labels[0] ?? '', operator: '=', value: '' }] })}>Add label filter</button><button onClick={() => patchBuilder({ labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] })}>Reset builder</button></div>{builder.labelMatchers.map((matcher, index) => <LabelMatcherRow key={`${index}-${matcher.label}`} matcher={matcher} index={index} labels={labels} matchers={builder.labelMatchers} connectionId={connectionId} range={range} onChange={(patch) => patchBuilder({ labelMatchers: builder.labelMatchers.map((item, at) => at === index ? { ...item, ...patch } : item) })} onRemove={() => patchBuilder({ labelMatchers: builder.labelMatchers.filter((_, at) => at !== index) })} />)}<label>Contains <input aria-label="Line contains" value={builder.lineFilters[0]?.value ?? ''} onChange={(event) => patchBuilder({ lineFilters: event.target.value ? [{ operator: '|=', value: event.target.value }] : [] })} /></label><div><strong>Generated LogQL</strong><pre className={styles.preview}>{generated || 'Add an indexed label matcher to generate LogQL.'}</pre><button disabled={!generated} onClick={() => { setSql(generated); setMode('sql') }}>Open in LogQL</button></div></section>}<div className={styles.toolbar}><button onClick={async () => { const original = expression; try { const formatted = await api.connections.loki.formatQuery(connectionId, original); if (mode === 'logql') setSql(formatted) } catch (caught) { setError(`Formatting failed; query was not changed. ${caught instanceof Error ? caught.message : String(caught)}`) } }}>Format</button><button onClick={() => navigator.clipboard.writeText(expression)}>Copy</button><button onClick={() => { if (mode === 'logql') setSql(''); else patchBuilder({ labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }); setResult(null); setTrend(null) }}>Reset / Clear</button><label>Breakdown <select aria-label="Trend breakdown" value={breakdown ?? ''} onChange={(event) => setLokiState({ lokiBreakdown: event.target.value || null })}><option value="">None</option>{labels.map((label) => <option key={label}>{label}</option>)}</select></label><button className="btn primary" disabled={loading} onClick={() => void run()}>{loading ? 'Running…' : 'Run'}</button></div>{error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}{warning && <div className={styles.status}>{warning}</div>}{trendError && <div className={styles.status}>Log volume trend unavailable: {trendError}</div>}{trend?.resultKind === 'metrics' && <LokiTrendChart result={trend} onRangeSelected={selectRange} />}{result?.resultKind === 'logs' ? <LogResultExplorer rows={(result as LokiLogResult).logRows} truncated={result.execution?.truncated} limit={limit} onFilter={resultFilter} /> : result?.resultKind === 'metrics' ? <ResultExplorer mode="sql" hasRun /> : !loading && <div className={styles.empty}>Run a LogQL investigation to see results.</div>}</main>
}
