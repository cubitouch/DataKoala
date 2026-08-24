import { useEffect, useState, type ReactNode } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import type { LokiBuilderState, LokiLabelMatcher } from '@shared/loki'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'
import { lokiLabelValues } from '../lib/lokiMetadata'
import { logql } from '../lib/logqlLanguage'
import { Combobox, MultiCombobox } from './ui/combobox'
import { CopySqlButton } from './CopySqlButton'
import styles from './LokiBuilderPanel.module.css'

const internal = (label: string) => label.startsWith('__')
const editable = (matcher: LokiLabelMatcher) => matcher.values !== undefined || matcher.operator === '='
function Control({ label, children }: { label: string; children: ReactNode }) { return <label className={styles.control}><span>{label}</span>{children}</label> }
function ValueControl({ matcher, matchers, connectionId, range, onChange }: { matcher: LokiLabelMatcher; matchers: LokiLabelMatcher[]; connectionId: string; range: BuilderTimeRange; onChange: (values: string[]) => void }) {
  const [values, setValues] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const selected = [...new Set(matcher.values ?? (matcher.value ? [matcher.value] : []))]
  const load = async () => { setLoading(true); setError(null); try { setValues([...new Set(await lokiLabelValues(connectionId, matcher.label, prometheusRangeBounds(range), matchers))].sort()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [connectionId, matcher.label, JSON.stringify(range), JSON.stringify(matchers.filter((item) => item.label !== matcher.label))])
  const options = [...new Set([...selected, ...values])].map((value) => ({ value, label: value }))
  return <Control label={matcher.label}><MultiCombobox label={`${matcher.label} values`} values={selected} options={options} onChange={onChange} searchable showChips allowCustomValue loading={loading} error={error} placeholder="Choose one or more values" emptyMessage="No values found. Enter a custom value." invalidationKey={matcher.label} /></Control>
}
export function LokiBuilderPanel({ value, generated, labels, connectionId, range, breakdown, onChange, onBreakdownChange, onOpenLogql }: { value: LokiBuilderState; generated: string; labels: string[]; connectionId: string; range: BuilderTimeRange; breakdown: string | null; onChange: (value: LokiBuilderState) => void; onBreakdownChange: (value: string | null) => void; onOpenLogql: () => void }) {
  const visibleLabels = [...new Set(labels)].filter((label) => !internal(label)).sort()
  const preserved = value.labelMatchers.filter((matcher) => !editable(matcher))
  const matchers = [...new Map(value.labelMatchers.filter((matcher) => editable(matcher) && !internal(matcher.label)).map((matcher) => [matcher.label, matcher])).values()]
  const selected = matchers.map(({ label }) => label)
  const selectLabels = (next: string[]) => onChange({ ...value, labelMatchers: [...preserved, ...[...new Set(next)].filter((label) => !internal(label)).map((label) => matchers.find((item) => item.label === label) ?? { label, operator: '=' as const, value: '', values: [] })] })
  const patchValues = (label: string, values: string[]) => onChange({ ...value, labelMatchers: [...preserved, ...matchers.map((matcher) => matcher.label === label ? { ...matcher, operator: '=' as const, value: values[0] ?? '', values: [...new Set(values)] } : matcher)] })
  return <section className={styles.root} data-loki-builder>
    <div className={styles.primaryRow}>
      <Control label="Filter by"><MultiCombobox label="Filter by" values={selected} options={visibleLabels.map((label) => ({ value: label, label }))} onChange={selectLabels} searchable showChips placeholder="Select indexed labels" /></Control>
      <Control label="Line contains"><input aria-label="Line contains" value={value.lineFilters[0]?.value ?? ''} onChange={(event) => onChange({ ...value, lineFilters: event.target.value ? [{ operator: '|=', value: event.target.value }] : [] })} placeholder="timeout" /></Control>
      <Control label="Group by"><Combobox label="Group by" value={breakdown ?? ''} options={[{ value: '', label: 'No grouping' }, ...visibleLabels.map((label) => ({ value: label, label }))]} onChange={(next) => onBreakdownChange(next || null)} searchable /></Control>
    </div>
    {matchers.length > 0 && <div className={styles.valuesGrid}>{matchers.map((matcher) => <ValueControl key={matcher.label} matcher={matcher} matchers={value.labelMatchers} connectionId={connectionId} range={range} onChange={(next) => patchValues(matcher.label, next)} />)}</div>}
    {preserved.length > 0 && <p className={styles.preserved}>Unsupported saved matcher expressions are preserved. Open in LogQL mode to edit them.</p>}
    <details className={styles.generated}><summary><span>Generated LogQL</span><button type="button" className="btn ghost" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenLogql() }} disabled={!generated}>Open in LogQL mode</button></summary>{generated && <><CodeMirror value={generated} height="96px" theme={oneDark} extensions={[logql()]} editable={false} aria-label="Generated LogQL query" basicSetup={{ lineNumbers: false, foldGutter: false }} /><div className={styles.generatedActions}><CopySqlButton sql={generated} language="LogQL" /></div></>}</details>
  </section>
}
