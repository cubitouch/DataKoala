import { useEffect, useMemo, useState } from 'react'
import { selectActiveSession, useStore } from '../store/useStore'
import { buildPromql, validatePromqlBuilder, type PromqlCalculation, type PromqlLabelOperator, type PromqlWindow } from '../lib/promqlBuilder'
import { metricLabels, metricLabelValues } from '../lib/prometheusMetadata'
import { Combobox, MultiCombobox } from './ui/combobox'

const calculations = ['raw', 'rate', 'increase', 'sum', 'avg', 'min', 'max'] as const
const windows = ['1m', '5m', '10m', '15m', '30m', '1h'] as const
const operators = ['=', '!=', '=~', '!~'] as const
let filterSequence = 0

export function PromqlBuilderPanel() {
  const tabId = useStore((s) => s.activeTabId)
  const session = useStore(selectActiveSession)
  const profileId = session.connectionProfileId
  const metadata = useStore((s) => profileId ? s.metadataByProfileId[profileId] : undefined)
  const setBuilder = useStore((s) => s.setPromqlBuilder)
  const setSql = useStore((s) => s.setSql)
  const [labels, setLabels] = useState<string[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [values, setValues] = useState<Record<string, string[]>>({})
  const builder = session.promqlBuilder
  const metrics = useMemo(() => (metadata?.schemas ?? []).flatMap((schema) => schema.relations).filter((relation) => relation.kind === 'metric'), [metadata?.schemas])
  const metricOptions = metrics.map((metric) => ({ value: metric.name, label: metric.name, subtitle: metric.details?.kind === 'metric' ? metric.details.type : undefined }))
  const labelOptions = labels.filter((label) => label !== '__name__').map((label) => ({ value: label, label }))

  const apply = (patch: Partial<typeof builder>) => {
    const next = { ...builder, ...patch }
    setBuilder(patch, tabId)
    const generated = buildPromql(next)
    if (generated) setSql(generated, tabId)
  }
  const selectMetric = (metric: string) => {
    apply({ metric, filters: [], groupBy: [] })
    setLabels([]); setValues({})
  }
  useEffect(() => {
    if (!profileId || !builder.metric) return
    let active = true
    setLoadingLabels(true)
    metricLabels(profileId, builder.metric).then((found) => { if (active) setLabels(found.filter((label) => label !== '__name__')) }).finally(() => { if (active) setLoadingLabels(false) })
    return () => { active = false }
  }, [profileId, builder.metric])
  const loadValues = (label: string) => {
    if (!profileId || !builder.metric || !label || values[label]) return
    void metricLabelValues(profileId, builder.metric, label).then((found) => setValues((current) => ({ ...current, [label]: found })))
  }
  const validation = validatePromqlBuilder(builder)
  const generated = buildPromql(builder)

  return <div className="promql-builder-form">
    <div className="promql-builder-grid">
      <label className="builder-control"><span className="builder-field-label">Metric</span><Combobox label="Metric" value={builder.metric} options={metricOptions} onChange={selectMetric} searchable placeholder="Select a metric…" emptyMessage="No matching metrics" /></label>
      <label className="builder-control"><span className="builder-field-label">Calculation</span><select aria-label="Calculation" value={builder.calculation} onChange={(event) => apply({ calculation: event.target.value as PromqlCalculation, groupBy: event.target.value === 'raw' ? [] : builder.groupBy })}>{calculations.map((item) => <option key={item} value={item}>{item === 'avg' ? 'Average' : item === 'min' ? 'Minimum' : item === 'max' ? 'Maximum' : item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
      <label className="builder-control"><span className="builder-field-label">Window</span><select aria-label="Range window" value={builder.window} disabled={!['rate', 'increase'].includes(builder.calculation)} onChange={(event) => apply({ window: event.target.value as PromqlWindow })}>{windows.map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="builder-control"><span className="builder-field-label">Group by</span><MultiCombobox label="Group by labels" values={builder.groupBy} options={labelOptions} onChange={(groupBy) => apply({ groupBy })} searchable showChips disabled={!builder.metric || builder.calculation === 'raw' || loadingLabels} placeholder={builder.calculation === 'raw' ? 'Unavailable for Raw' : 'No grouping'} /></div>
    </div>
    <section className="promql-filters" aria-label="Label filters"><div className="builder-section-title">Filters</div>
      {builder.filters.map((filter) => <div className="promql-filter-row" key={filter.id}>
        <Combobox label={`Filter label ${filter.id}`} value={filter.label} options={labelOptions} searchable placeholder="Label" disabled={!builder.metric || loadingLabels} onChange={(label) => { apply({ filters: builder.filters.map((item) => item.id === filter.id ? { ...item, label } : item) }); loadValues(label) }} />
        <select aria-label={`Filter operator ${filter.id}`} value={filter.operator} onChange={(event) => apply({ filters: builder.filters.map((item) => item.id === filter.id ? { ...item, operator: event.target.value as PromqlLabelOperator } : item) })}>{operators.map((operator) => <option key={operator}>{operator}</option>)}</select>
        <input aria-label={`Filter value ${filter.id}`} value={filter.value} list={`promql-values-${filter.id}`} placeholder="Value" onFocus={() => loadValues(filter.label)} onChange={(event) => apply({ filters: builder.filters.map((item) => item.id === filter.id ? { ...item, value: event.target.value } : item) })}/>
        <datalist id={`promql-values-${filter.id}`}>{(values[filter.label] ?? []).map((value) => <option key={value} value={value}/>)}</datalist>
        <button className="btn ghost" aria-label={`Remove filter ${filter.id}`} onClick={() => apply({ filters: builder.filters.filter((item) => item.id !== filter.id) })}>Remove</button>
      </div>)}
      <button className="btn ghost" disabled={!builder.metric} onClick={() => apply({ filters: [...builder.filters, { id: `filter-${++filterSequence}`, label: '', operator: '=', value: '' }] })}>+ Add filter</button>
    </section>
    <div className="generated-promql"><strong>Generated PromQL</strong>{validation ? <p className="inline-error" role="status">{validation}</p> : <pre>{generated}</pre>}<small>Manual PromQL edits are preserved until a Builder control changes.</small></div>
  </div>
}
