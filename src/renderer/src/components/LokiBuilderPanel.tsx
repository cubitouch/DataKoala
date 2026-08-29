import { TextInput } from './ui/TextInput'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LokiBuilderState, LokiLabelMatcher } from '@shared/loki'
import type { LokiMetadataRequest } from '@shared/loki'
import { lokiLabelValues } from '../lib/lokiMetadata'
import { MultiCombobox } from './ui/combobox'
import { GeneratedQueryPanel } from './query/GeneratedQueryPanel'
import styles from './LokiBuilderPanel.module.css'

const internal = (label: string) => label.startsWith('__')
const editable = (matcher: LokiLabelMatcher) => matcher.values !== undefined || matcher.operator === '='
function Control({ children }: { children: ReactNode }) { return <div className={styles.control}>{children}</div> }
function ValueControl({ matcher, matchers, connectionId, connectionGeneration, canLoadMetadata, bounds, onChange }: { matcher: LokiLabelMatcher; matchers: LokiLabelMatcher[]; connectionId: string; connectionGeneration: number; canLoadMetadata: boolean; bounds: Omit<LokiMetadataRequest, 'selector'>; onChange: (values: string[]) => void }) {
  const [values, setValues] = useState<string[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null)
  const request = useRef(0), available = useRef(canLoadMetadata)
  available.current = canLoadMetadata
  const selected = [...new Set(matcher.values ?? (matcher.value ? [matcher.value] : []))]
  const load = useCallback(async () => {
    if (!canLoadMetadata) return
    const current = ++request.current
    setLoading(true); setError(null)
    try {
      const found = [...new Set(await lokiLabelValues(connectionId, matcher.label, bounds, matchers))].sort()
      if (available.current && current === request.current) setValues(found)
    } catch (e) {
      if (available.current && current === request.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (available.current && current === request.current) setLoading(false)
    }
  }, [canLoadMetadata, connectionId, connectionGeneration, matcher.label, JSON.stringify(bounds), JSON.stringify(matchers.filter((item) => item.label !== matcher.label))])
  useEffect(() => {
    if (canLoadMetadata) void load()
    else { request.current++; setLoading(false); setError(null) }
    return () => { request.current++ }
  }, [load, canLoadMetadata])
  const options = [...new Set([...selected, ...values])].map((value) => ({ value, label: value }))
  return <Control><MultiCombobox label={`${matcher.label} values`} values={selected} options={options} onChange={onChange} searchable showChips allowCustomValue loading={canLoadMetadata && loading} error={canLoadMetadata ? error : null} disabled={!canLoadMetadata} placeholder={canLoadMetadata ? 'Choose one or more values' : 'Metadata unavailable'} emptyMessage="No values found. Enter a custom value." invalidationKey={matcher.label} /></Control>
}
export function LokiBuilderPanel({ value, generated, labels, connectionId, connectionGeneration, canLoadMetadata, bounds, groupBy, metadataStatus, metadataError, onChange, onGroupByChange, onOpenLogql }: { value: LokiBuilderState; generated: string; labels: string[]; connectionId: string; connectionGeneration: number; canLoadMetadata: boolean; bounds: Omit<LokiMetadataRequest, 'selector'>; groupBy: string[]; metadataStatus: 'loading' | 'loaded' | 'error'; metadataError: string | null; onChange: (value: LokiBuilderState) => void; onGroupByChange: (value: string[]) => void; onOpenLogql: () => void }) {
  const visibleLabels = [...new Set(labels)].filter((label) => !internal(label)).sort()
  const preserved = value.labelMatchers.filter((matcher) => !editable(matcher))
  const matchers = [...new Map(value.labelMatchers.filter((matcher) => editable(matcher) && !internal(matcher.label)).map((matcher) => [matcher.label, matcher])).values()]
  const selected = matchers.map(({ label }) => label)
  const selectLabels = (next: string[]) => onChange({ ...value, labelMatchers: [...preserved, ...[...new Set(next)].filter((label) => !internal(label)).map((label) => matchers.find((item) => item.label === label) ?? { label, operator: '=' as const, value: '', values: [] })] })
  const patchValues = (label: string, values: string[]) => onChange({ ...value, labelMatchers: [...preserved, ...matchers.map((matcher) => matcher.label === label ? { ...matcher, operator: '=' as const, value: values[0] ?? '', values: [...new Set(values)] } : matcher)] })
  return <section className={styles.root} data-loki-builder>
    <div className={styles.primaryRow}>
      <Control><MultiCombobox label="Filter by" values={selected} options={visibleLabels.map((label) => ({ value: label, label }))} onChange={selectLabels} searchable showChips disabled={!canLoadMetadata} loading={canLoadMetadata && metadataStatus === 'loading'} error={canLoadMetadata && metadataStatus === 'error' ? metadataError : null} loadingMessage="Loading indexed labels…" emptyMessage="No indexed labels in this range" placeholder={canLoadMetadata ? 'Select indexed labels' : 'Metadata unavailable'} /></Control>
      <Control><TextInput label="Line contains" value={value.lineFilters[0]?.value ?? ''} onValueChange={(text) => onChange({ ...value, lineFilters: text ? [{ operator: '|=', value: text }] : [] })} placeholder="timeout" /></Control>
      <Control><MultiCombobox label="Group by" values={groupBy} options={visibleLabels.map((label) => ({ value: label, label }))} onChange={(next) => onGroupByChange([...new Set(next)].filter((label) => !internal(label)))} searchable showChips disabled={!canLoadMetadata} loading={canLoadMetadata && metadataStatus === 'loading'} error={canLoadMetadata && metadataStatus === 'error' ? metadataError : null} loadingMessage="Loading indexed labels…" emptyMessage="No indexed labels in this range" placeholder={canLoadMetadata ? 'No grouping' : 'Metadata unavailable'} /></Control>
    </div>
    {matchers.length > 0 && <div className={styles.valuesGrid}>{matchers.map((matcher) => <ValueControl key={matcher.label} matcher={matcher} matchers={value.labelMatchers} connectionId={connectionId} connectionGeneration={connectionGeneration} canLoadMetadata={canLoadMetadata} bounds={bounds} onChange={(next) => patchValues(matcher.label, next)} />)}</div>}
    {preserved.length > 0 && <p className={styles.preserved}>Unsupported saved matcher expressions are preserved. Open in LogQL mode to edit them.</p>}
    <GeneratedQueryPanel language="LogQL" value={generated} onOpenInEditor={onOpenLogql} />
  </section>
}
