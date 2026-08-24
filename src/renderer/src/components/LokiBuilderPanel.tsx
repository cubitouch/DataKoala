import { useEffect, useMemo, useState, type ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LokiBuilderState, LokiLabelMatcher } from '@shared/loki'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { lokiLabelValues } from '../lib/lokiMetadata'
import { logql } from '../lib/logqlLanguage'
import { Combobox, MultiCombobox, type ComboboxOption } from './ui/combobox'
import { CopySqlButton } from './CopySqlButton'
import styles from './LokiBuilderPanel.module.css'

const operators: ComboboxOption[] = [{ value: '=', label: 'Equals' }, { value: '!=', label: 'Does not equal' }, { value: '=~', label: 'Matches regex' }, { value: '!~', label: 'Does not match regex' }]
const internal = (label: string) => label.startsWith('__')
function Control({ label, children }: { label: string; children: ReactNode }) { return <label className={styles.control}><span>{label}</span>{children}</label> }
function ValueControl({ matcher, matchers, connectionId, range, onChange }: { matcher: LokiLabelMatcher; matchers: LokiLabelMatcher[]; connectionId: string; range: BuilderTimeRange; onChange: (value: string) => void }) {
  const [values, setValues] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const load = async () => { setLoading(true); setError(null); try { setValues([...new Set(await lokiLabelValues(connectionId, matcher.label, prometheusRangeBounds(range), matchers))].sort()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [connectionId, matcher.label, JSON.stringify(range), JSON.stringify(matchers.filter((item) => item.label !== matcher.label))])
  const options = [...new Set([matcher.value, ...values].filter(Boolean))].map((value) => ({ value, label: value }))
  return <Control label={matcher.label}><Combobox label={`${matcher.label} value`} value={matcher.value} options={options} onChange={onChange} searchable allowCustomValue loading={loading} error={error} placeholder="Choose or enter a value" emptyMessage="No values found. Enter a custom value." invalidationKey={matcher.label} /></Control>
}
export function LokiBuilderPanel({ value, generated, labels, connectionId, range, breakdown, onChange, onBreakdownChange, onRefresh, onOpenLogql }: { value: LokiBuilderState; generated: string; labels: string[]; connectionId: string; range: BuilderTimeRange; breakdown: string | null; onChange: (value: LokiBuilderState) => void; onBreakdownChange: (value: string | null) => void; onRefresh: () => void; onOpenLogql: () => void }) {
  const visibleLabels = [...new Set(labels)].filter((label) => !internal(label)).sort()
  const matchers = [...new Map(value.labelMatchers.filter(({ label }) => !internal(label)).map((matcher) => [matcher.label, matcher])).values()]
  const selected = matchers.map(({ label }) => label)
  const selectLabels = (next: string[]) => onChange({ ...value, labelMatchers: [...new Set(next)].filter((label) => !internal(label)).map((label) => matchers.find((item) => item.label === label) ?? { label, operator: '=', value: '' }) })
  const patch = (label: string, change: Partial<LokiLabelMatcher>) => onChange({ ...value, labelMatchers: matchers.map((matcher) => matcher.label === label ? { ...matcher, ...change } : matcher) })
  return <section className={styles.root} data-loki-builder>
    <header><div><strong>Stream filters</strong><span>Select indexed labels, then choose their values.</span></div><button type="button" className="btn ghost" onClick={onRefresh}>Refresh metadata</button></header>
    <div className={styles.primaryRow}>
      <Control label="Filter by"><MultiCombobox label="Filter by" values={selected} options={visibleLabels.map((label) => ({ value: label, label }))} onChange={selectLabels} searchable showChips placeholder="Select indexed labels" /></Control>
      <Control label="Line contains"><input aria-label="Line contains" value={value.lineFilters[0]?.value ?? ''} onChange={(event) => onChange({ ...value, lineFilters: event.target.value ? [{ operator: '|=', value: event.target.value }] : [] })} placeholder="timeout" /></Control>
      <Control label="Trend breakdown"><Combobox label="Trend breakdown" value={breakdown ?? ''} options={[{ value: '', label: 'No breakdown' }, ...visibleLabels.map((label) => ({ value: label, label }))]} onChange={(next) => onBreakdownChange(next || null)} searchable /></Control>
    </div>
    {matchers.length > 0 && <div className={styles.valuesGrid}>{matchers.map((matcher) => <ValueControl key={matcher.label} matcher={matcher} matchers={matchers} connectionId={connectionId} range={range} onChange={(next) => patch(matcher.label, { value: next })} />)}</div>}
    {matchers.length > 0 && <details className={styles.operators}><summary>Advanced match operators</summary><div>{matchers.map((matcher) => <Control key={matcher.label} label={matcher.label}><Combobox label={`${matcher.label} operator`} value={matcher.operator} options={operators} onChange={(operator) => patch(matcher.label, { operator: operator as LokiLabelMatcher['operator'] })} /></Control>)}</div></details>}
    <details className={styles.generated}><summary><span>Generated LogQL</span><button type="button" className="btn ghost" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLogql() }} disabled={!generated}>Open in LogQL mode</button></summary>{generated && <><CodeMirror value={generated} height="96px" theme={oneDark} extensions={[logql()]} editable={false} aria-label="Generated LogQL query" basicSetup={{ lineNumbers: false, foldGutter: false }} /><div className={styles.generatedActions}><CopySqlButton sql={generated} language="LogQL" /></div></>}</details>
  </section>
}
