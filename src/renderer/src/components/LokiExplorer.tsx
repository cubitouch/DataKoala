import { useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LokiBuilderState, LokiLabelMatcher, LokiLogResult, LokiQueryResult } from '@shared/loki'
import { DEFAULT_LOKI_BUILDER } from '@shared/loki'
import { buildLokiQuery } from '@shared/loki-builder'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { logql } from '../lib/logqlLanguage'
import { api } from '../lib/api'
import { TimeRangeField } from './time-range/TimeRangeField'
import { LogResultExplorer } from './LogResultExplorer'
import { ResultExplorer } from './ResultExplorer'
import { useStore } from '../store/useStore'
import styles from './LokiExplorer.module.css'

const initialRange: BuilderTimeRange = { kind: 'rolling', amount: 1, unit: 'hour' }
const initialBuilder = (): LokiBuilderState => ({ ...DEFAULT_LOKI_BUILDER, labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] })
function interval(start: string, end: string): string { const seconds = Math.max(1, (Date.parse(end) - Date.parse(start)) / 250_000); const choices = [1, 5, 10, 30, 60, 300, 900, 3600]; return `${choices.find((item) => item >= seconds) ?? 3600}s` }

export function LokiExplorer({ connectionId }: { connectionId: string }) {
  const [mode, setMode] = useState<'builder' | 'logql'>('builder'); const [query, setQuery] = useState(''); const [builder, setBuilder] = useState(initialBuilder)
  const [range, setRange] = useState<BuilderTimeRange>(initialRange); const [limit, setLimit] = useState(1000); const [direction, setDirection] = useState<'backward' | 'forward'>('backward')
  const [labels, setLabels] = useState<string[]>([]); const [result, setResult] = useState<LokiQueryResult | null>(null); const [trendError, setTrendError] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); const revision = useRef(0)
  const generated = useMemo(() => { try { return builder.labelMatchers.length ? buildLokiQuery(builder) : '' } catch { return '' } }, [builder])
  const expression = mode === 'builder' ? generated : query
  const loadLabels = async () => { const bounds = prometheusRangeBounds(range); try { setLabels(await api.connections.loki.labels(connectionId, bounds)) } catch (caught) { setError(`Metadata unavailable: ${caught instanceof Error ? caught.message : String(caught)}. Raw LogQL remains available.`) } }
  const run = async () => {
    if (!expression.trim()) return setError(mode === 'builder' ? 'Add at least one indexed label matcher.' : 'Enter a LogQL query.')
    const current = ++revision.current; setLoading(true); setError(null); setTrendError(null)
    const bounds = prometheusRangeBounds(range); const step = interval(bounds.start, bounds.end)
    try {
      const primary = api.query.runLoki(connectionId, { expression, ...bounds, step, limit, direction })
      const trendExpression = `sum(count_over_time((${expression})[${step}]))`
      const trend = api.query.runLoki(connectionId, { expression: trendExpression, ...bounds, step, limit: 100 })
      const [main, volume] = await Promise.all([primary, trend.catch((caught) => { if (current === revision.current) setTrendError(caught instanceof Error ? caught.message : String(caught)); return null })])
      if (current !== revision.current) return
      setResult(main)
      if (main.resultKind === 'metrics') useStore.getState().completeQuery(main)
      else if (volume?.resultKind === 'metrics') { /* seam for the volume chart; primary logs remain authoritative */ }
    } catch (caught) { if (current === revision.current) setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { if (current === revision.current) setLoading(false) }
  }
  const addMatcher = () => setBuilder((current) => ({ ...current, labelMatchers: [...current.labelMatchers, { label: labels[0] ?? '', operator: '=', value: '' }] }))
  const updateMatcher = (index: number, patch: Partial<LokiLabelMatcher>) => setBuilder((current) => ({ ...current, labelMatchers: current.labelMatchers.map((item, at) => at === index ? { ...item, ...patch } : item) }))
  const resultFilter = (kind: 'label' | 'field', key: string, value: string, exclude: boolean) => {
    if (kind === 'label') setBuilder((current) => ({ ...current, labelMatchers: [...current.labelMatchers, { label: key, operator: exclude ? '!=' : '=', value }] }))
    else setBuilder((current) => ({ ...current, fieldFilters: [...current.fieldFilters, { field: key, operator: exclude ? '!=' : '=', value }] }))
    setMode('builder')
  }
  return <main className={styles.workspace}><div className={styles.toolbar}><button className={mode === 'builder' ? 'btn primary' : 'btn ghost'} onClick={() => setMode('builder')}>Builder</button><button className={mode === 'logql' ? 'btn primary' : 'btn ghost'} onClick={() => setMode('logql')}>LogQL</button><TimeRangeField value={range} onChange={setRange} /><label>Limit <input type="number" min={1} max={5000} value={limit} onChange={(event) => setLimit(Math.max(1, Math.min(5000, Number(event.target.value))))} /></label><select aria-label="Retrieval direction" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="backward">Newest first</option><option value="forward">Oldest first</option></select></div>{mode === 'logql' ? <CodeMirror className={styles.editor} value={query} theme={oneDark} extensions={[logql()]} onChange={setQuery} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run() } }} /> : <section className={styles.builder}><div className={styles.toolbar}><button onClick={() => void loadLabels()}>Discover labels</button><button onClick={addMatcher}>Add label filter</button><button onClick={() => setBuilder(initialBuilder())}>Reset builder</button></div>{builder.labelMatchers.map((matcher, index) => <div className={styles.builderRow} key={index}><input list="loki-labels" aria-label="Label name" value={matcher.label} onChange={(event) => updateMatcher(index, { label: event.target.value })} /><select aria-label="Label operator" value={matcher.operator} onChange={(event) => updateMatcher(index, { operator: event.target.value as LokiLabelMatcher['operator'] })}>{['=', '!=', '=~', '!~'].map((operator) => <option key={operator}>{operator}</option>)}</select><input aria-label="Label value" value={matcher.value} onChange={(event) => updateMatcher(index, { value: event.target.value })} /><button aria-label="Remove label filter" onClick={() => setBuilder((current) => ({ ...current, labelMatchers: current.labelMatchers.filter((_, at) => at !== index) }))}>×</button></div>)}<datalist id="loki-labels">{labels.map((label) => <option key={label}>{label}</option>)}</datalist><label>Contains <input aria-label="Line contains" onChange={(event) => setBuilder((current) => ({ ...current, lineFilters: event.target.value ? [{ operator: '|=', value: event.target.value }] : [] }))} /></label><div><strong>Generated LogQL</strong><pre className={styles.preview}>{generated || 'Add an indexed label matcher to generate LogQL.'}</pre><button disabled={!generated} onClick={() => { setQuery(generated); setMode('logql') }}>Open in LogQL</button></div></section>}<div className={styles.toolbar}><button onClick={async () => { const original = expression; try { const formatted = await api.connections.loki.formatQuery(connectionId, original); if (mode === 'logql') setQuery(formatted) } catch (caught) { setError(`Formatting failed; query was not changed. ${caught instanceof Error ? caught.message : String(caught)}`) } }}>Format</button><button onClick={() => navigator.clipboard.writeText(expression)}>Copy</button><button onClick={() => { if (mode === 'logql') setQuery(''); else setBuilder(initialBuilder()); setResult(null) }}>Reset / Clear</button><button className="btn primary" disabled={loading} onClick={() => void run()}>{loading ? 'Running…' : 'Run'}</button></div>{error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}{trendError && <div className={styles.status}>Log volume trend unavailable: {trendError}</div>}{result?.resultKind === 'logs' ? <LogResultExplorer rows={(result as LokiLogResult).logRows} truncated={result.execution?.truncated} limit={limit} onFilter={resultFilter} /> : result?.resultKind === 'metrics' ? <ResultExplorer mode="sql" hasRun /> : !loading && <div className={styles.empty}>Run a LogQL investigation to see results.</div>}</main>
}
