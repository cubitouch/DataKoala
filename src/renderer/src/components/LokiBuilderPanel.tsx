import { useEffect, useMemo, useState, type ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LokiBuilderState, LokiLabelMatcher } from '@shared/loki'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { lokiLabelValues } from '../lib/lokiMetadata'
import { logql } from '../lib/logqlLanguage'
import { Combobox, type ComboboxOption } from './ui/combobox'
import { CopySqlButton } from './CopySqlButton'
import styles from './LokiBuilderPanel.module.css'

const operators: ComboboxOption[] = [
  { value: '=', label: 'equals (=)' }, { value: '!=', label: 'does not equal (!=)' },
  { value: '=~', label: 'matches regex (=~)' }, { value: '!~', label: 'does not match regex (!~)' }
]

function Control({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.control}><span>{label}</span>{children}</label>
}

function MatcherControl({ matcher, index, matchers, labels, connectionId, range, onChange, onRemove }: { matcher: LokiLabelMatcher; index: number; matchers: LokiLabelMatcher[]; labels: string[]; connectionId: string; range: BuilderTimeRange; onChange: (patch: Partial<LokiLabelMatcher>) => void; onRemove: () => void }) {
  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!matcher.label) { setValues([]); return }
    let current = true
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(null)
      try { const next = await lokiLabelValues(connectionId, matcher.label, prometheusRangeBounds(range), matchers); if (current) setValues(next) }
      catch (caught) { if (current) setError(caught instanceof Error ? caught.message : String(caught)) }
      finally { if (current) setLoading(false) }
    }, 250)
    return () => { current = false; window.clearTimeout(timer) }
  }, [connectionId, matcher.label, matchers, range])
  const labelOptions = labels.map((value) => ({ value, label: value }))
  const valueOptions = useMemo(() => [...new Set([matcher.value, ...values].filter(Boolean))].map((value) => ({ value, label: value })), [matcher.value, values])
  return <div className={styles.matcher} data-loki-matcher={index}>
    <Control label="Indexed label"><Combobox label={`Indexed label ${index + 1}`} value={matcher.label} options={labelOptions} onChange={(label) => onChange({ label })} searchable allowCustomValue placeholder="Select label" emptyMessage="No labels discovered" /></Control>
    <Control label="Match"><Combobox label={`Label operator ${index + 1}`} value={matcher.operator} options={operators} onChange={(operator) => onChange({ operator: operator as LokiLabelMatcher['operator'] })} /></Control>
    <Control label="Value"><Combobox label={`Label value ${index + 1}`} value={matcher.value} options={valueOptions} onChange={(value) => onChange({ value })} searchable allowCustomValue loading={loading} error={error} placeholder="Select or enter value" emptyMessage="No values discovered. Type a custom value." /></Control>
    <button type="button" className="btn ghost" onClick={onRemove} aria-label={`Remove ${matcher.label || 'label'} filter`}>Remove</button>
  </div>
}

export function LokiBuilderPanel({ value, generated, labels, connectionId, range, breakdown, onChange, onBreakdownChange, onRefresh, onOpenLogql }: { value: LokiBuilderState; generated: string; labels: string[]; connectionId: string; range: BuilderTimeRange; breakdown: string | null; onChange: (value: LokiBuilderState) => void; onBreakdownChange: (value: string | null) => void; onRefresh: () => void; onOpenLogql: () => void }) {
  const patchMatcher = (index: number, patch: Partial<LokiLabelMatcher>) => onChange({ ...value, labelMatchers: value.labelMatchers.map((item, at) => at === index ? { ...item, ...patch } : item) })
  return <section className={styles.root} data-loki-builder>
    <header><div><strong>Stream filters</strong><span>Filter indexed Loki labels before scanning log content.</span></div><button type="button" className="btn ghost" onClick={onRefresh}>Refresh metadata</button></header>
    <div className={styles.matchers}>{value.labelMatchers.map((matcher, index) => <MatcherControl key={index} matcher={matcher} index={index} matchers={value.labelMatchers} labels={labels} connectionId={connectionId} range={range} onChange={(patch) => patchMatcher(index, patch)} onRemove={() => onChange({ ...value, labelMatchers: value.labelMatchers.filter((_, at) => at !== index) })} />)}</div>
    <div className={styles.secondary}>
      <button type="button" className="btn ghost" onClick={() => onChange({ ...value, labelMatchers: [...value.labelMatchers, { label: labels[0] ?? '', operator: '=', value: '' }] })}>+ Label filter</button>
      <Control label="Line contains"><input aria-label="Line contains" value={value.lineFilters[0]?.value ?? ''} onChange={(event) => onChange({ ...value, lineFilters: event.target.value ? [{ operator: '|=', value: event.target.value }] : [] })} placeholder="timeout" /></Control>
      <Control label="Trend breakdown"><Combobox label="Trend breakdown" value={breakdown ?? ''} options={[{ value: '', label: 'No breakdown' }, ...labels.map((label) => ({ value: label, label }))]} onChange={(next) => onBreakdownChange(next || null)} searchable placeholder="No breakdown" /></Control>
    </div>
    <details className={styles.generated}><summary><span>Generated LogQL</span><button type="button" className="btn ghost" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLogql() }} disabled={!generated}>Open in LogQL mode</button></summary>{generated && <><CodeMirror value={generated} height="96px" theme={oneDark} extensions={[logql()]} editable={false} aria-label="Generated LogQL query" basicSetup={{ lineNumbers: false, foldGutter: false }} /><div className={styles.generatedActions}><CopySqlButton sql={generated} language="LogQL" /></div></>}</details>
  </section>
}
