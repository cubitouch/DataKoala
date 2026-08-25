import { useEffect, useState, type ReactNode } from 'react'
import type { LokiBuilderState, LokiLabelMatcher } from '@shared/loki'
import type { LokiMetadataRequest } from '@shared/loki'
import { lokiLabelValues } from '../lib/lokiMetadata'
import { MultiCombobox } from './ui/combobox'
import { GeneratedQueryPanel } from './query/GeneratedQueryPanel'
import styles from './LokiBuilderPanel.module.css'

const internal = (label: string) => label.startsWith('__')
const editable = (matcher: LokiLabelMatcher) => matcher.values !== undefined || matcher.operator === '='
function Control({ label, children }: { label: string; children: ReactNode }) { return <label className={styles.control}><span>{label}</span>{children}</label> }
function ValueControl({ matcher, matchers, connectionId, bounds, onChange }: { matcher: LokiLabelMatcher; matchers: LokiLabelMatcher[]; connectionId: string; bounds: Omit<LokiMetadataRequest, 'selector'>; onChange: (values: string[]) => void }) {
  const [values, setValues] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const selected = [...new Set(matcher.values ?? (matcher.value ? [matcher.value] : []))]
  const load = async () => { setLoading(true); setError(null); try { setValues([...new Set(await lokiLabelValues(connectionId, matcher.label, bounds, matchers))].sort()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [connectionId, matcher.label, JSON.stringify(bounds), JSON.stringify(matchers.filter((item) => item.label !== matcher.label))])
  const options = [...new Set([...selected, ...values])].map((value) => ({ value, label: value }))
  return <Control label={matcher.label}><MultiCombobox label={`${matcher.label} values`} values={selected} options={options} onChange={onChange} searchable showChips allowCustomValue loading={loading} error={error} placeholder="Choose one or more values" emptyMessage="No values found. Enter a custom value." invalidationKey={matcher.label} /></Control>
}
export function LokiBuilderPanel({ value, generated, labels, connectionId, bounds, groupBy, metadataStatus, metadataError, onChange, onGroupByChange, onOpenLogql }: { value: LokiBuilderState; generated: string; labels: string[]; connectionId: string; bounds: Omit<LokiMetadataRequest, 'selector'>; groupBy: string[]; metadataStatus: 'loading' | 'loaded' | 'error'; metadataError: string | null; onChange: (value: LokiBuilderState) => void; onGroupByChange: (value: string[]) => void; onOpenLogql: () => void }) {
  const visibleLabels = [...new Set(labels)].filter((label) => !internal(label)).sort()
  const preserved = value.labelMatchers.filter((matcher) => !editable(matcher))
  const matchers = [...new Map(value.labelMatchers.filter((matcher) => editable(matcher) && !internal(matcher.label)).map((matcher) => [matcher.label, matcher])).values()]
  const selected = matchers.map(({ label }) => label)
  const selectLabels = (next: string[]) => onChange({ ...value, labelMatchers: [...preserved, ...[...new Set(next)].filter((label) => !internal(label)).map((label) => matchers.find((item) => item.label === label) ?? { label, operator: '=' as const, value: '', values: [] })] })
  const patchValues = (label: string, values: string[]) => onChange({ ...value, labelMatchers: [...preserved, ...matchers.map((matcher) => matcher.label === label ? { ...matcher, operator: '=' as const, value: values[0] ?? '', values: [...new Set(values)] } : matcher)] })
  return <section className={styles.root} data-loki-builder>
    <div className={styles.primaryRow}>
      <Control label="Filter by"><MultiCombobox label="Filter by" values={selected} options={visibleLabels.map((label) => ({ value: label, label }))} onChange={selectLabels} searchable showChips loading={metadataStatus === 'loading'} error={metadataStatus === 'error' ? metadataError : null} loadingMessage="Loading indexed labels…" emptyMessage="No indexed labels in this range" placeholder="Select indexed labels" /></Control>
      <Control label="Line contains"><input aria-label="Line contains" value={value.lineFilters[0]?.value ?? ''} onChange={(event) => onChange({ ...value, lineFilters: event.target.value ? [{ operator: '|=', value: event.target.value }] : [] })} placeholder="timeout" /></Control>
      <Control label="Group by"><MultiCombobox label="Group by" values={groupBy} options={visibleLabels.map((label) => ({ value: label, label }))} onChange={(next) => onGroupByChange([...new Set(next)].filter((label) => !internal(label)))} searchable showChips loading={metadataStatus === 'loading'} error={metadataStatus === 'error' ? metadataError : null} loadingMessage="Loading indexed labels…" emptyMessage="No indexed labels in this range" placeholder="No grouping" /></Control>
    </div>
    {matchers.length > 0 && <div className={styles.valuesGrid}>{matchers.map((matcher) => <ValueControl key={matcher.label} matcher={value.labelMatchers.find((item) => item.label === matcher.label) ?? matcher} matchers={value.labelMatchers} connectionId={connectionId} bounds={bounds} onChange={(next) => patchValues(matcher.label, next)} />)}</div>}
    {preserved.length > 0 && <p className={styles.preserved}>Unsupported saved matcher expressions are preserved. Open in LogQL mode to edit them.</p>}
    <GeneratedQueryPanel language="LogQL" value={generated} onOpenInEditor={onOpenLogql} />
  </section>
}
