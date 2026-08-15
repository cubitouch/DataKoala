import { useEffect, useMemo, useState } from 'react'
import { selectActiveSession, useStore } from '../store/useStore'
import { buildPromql, validatePromqlBuilder, type PromqlCalculation, type PromqlQuantile, type PromqlWindow } from '../lib/promqlBuilder'
import { metricLabels, metricLabelValues } from '../lib/prometheusMetadata'
import { Combobox, MultiCombobox } from './ui/combobox'
import { InfoTooltip } from './ui/InfoTooltip'

const calculations = ['raw', 'rate', 'increase', 'sum', 'avg', 'min', 'max', 'percentile'] as const
const windows = ['1m', '5m', '10m', '15m', '30m', '1h'] as const
const quantiles = [{ value: 0.5, label: 'P50' }, { value: 0.75, label: 'P75' }, { value: 0.9, label: 'P90' }, { value: 0.95, label: 'P95' }, { value: 0.99, label: 'P99' }, { value: 0.999, label: 'P99.9' }] as const
const rangeCalculations = new Set<PromqlCalculation>(['rate', 'increase', 'percentile'])

export function PromqlBuilderPanel() {
  const tabId = useStore((s) => s.activeTabId)
  const session = useStore(selectActiveSession)
  const profileId = session.connectionProfileId
  const metadata = useStore((s) => profileId ? s.metadataByProfileId[profileId] : undefined)
  const setBuilder = useStore((s) => s.setPromqlBuilder)
  const setSql = useStore((s) => s.setSql)
  const setMode = useStore((s) => s.setQueryMode)
  const [labels, setLabels] = useState<string[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [values, setValues] = useState<Record<string, string[]>>({})
  const builder = session.promqlBuilder
  const metrics = useMemo(() => (metadata?.schemas ?? []).flatMap((schema) => schema.relations).filter((relation) => relation.kind === 'metric'), [metadata?.schemas])
  const metricOptions = metrics.map((metric) => ({ value: metric.name, label: metric.name, subtitle: metric.details?.kind === 'metric' ? metric.details.type : undefined }))
  const labelOptions = labels.filter((label) => label !== '__name__').map((label) => ({ value: label, label }))
  const selectedLabels = builder.filters.map((filter) => filter.label)
  const apply = (patch: Partial<typeof builder>) => {
    const next = { ...builder, ...patch }; setBuilder(patch, tabId)
    const generated = buildPromql(next); if (generated) setSql(generated, tabId)
  }
  const selectMetric = (metric: string) => {
    const calculation = builder.calculation === 'percentile' && !metric.endsWith('_bucket') ? 'raw' : builder.calculation
    apply({ metric, calculation, filters: [], groupBy: [] }); setLabels([]); setValues({})
  }
  useEffect(() => {
    if (!profileId || !builder.metric) return
    let active = true; setLoadingLabels(true)
    metricLabels(profileId, builder.metric).then((found) => { if (active) setLabels(found.filter((label) => label !== '__name__')) }).finally(() => { if (active) setLoadingLabels(false) })
    return () => { active = false }
  }, [profileId, builder.metric])
  const loadValues = (label: string) => {
    if (!profileId || !builder.metric || !label || values[label]) return
    void metricLabelValues(profileId, builder.metric, label).then((found) => setValues((current) => ({ ...current, [label]: found })))
  }
  const changeFilterLabels = (nextLabels: string[]) => apply({ filters: nextLabels.map((label) => builder.filters.find((filter) => filter.label === label) ?? { label, values: [] }) })
  const validation = validatePromqlBuilder(builder); const generated = buildPromql(builder)
  const calculationOptions = calculations.map((item) => ({ value: item, label: item === 'avg' ? 'Average' : item === 'min' ? 'Minimum' : item === 'max' ? 'Maximum' : item[0].toUpperCase() + item.slice(1), disabled: item === 'percentile' && !builder.metric.endsWith('_bucket') }))

  return <div className="promql-builder-form">
    <div className="promql-builder-grid">
      <div className="builder-control promql-metric-control"><span className="builder-field-label">Metric</span><Combobox label="Metric" value={builder.metric} options={metricOptions} onChange={selectMetric} searchable placeholder="Select a metric…" emptyMessage="No matching metrics" /></div>
      <div className="builder-control"><span className="builder-field-label">Calculation</span><Combobox label="Calculation" value={builder.calculation} options={calculationOptions} onChange={(value) => apply({ calculation: value as PromqlCalculation, groupBy: value === 'raw' ? [] : builder.groupBy })}/></div>
      {builder.calculation === 'percentile' && <label className="builder-control"><span className="builder-field-label">Percentile</span><select aria-label="Percentile" value={builder.percentile} onChange={(event) => apply({ percentile: Number(event.target.value) as PromqlQuantile })}>{quantiles.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {rangeCalculations.has(builder.calculation) && <label className="builder-control"><span className="builder-field-label">Rate window <InfoTooltip label="Rate window">How much history each calculation looks back over. Example: 5m means rate(...[5m]) uses the previous 5 minutes at each point.</InfoTooltip></span><select aria-label="Rate window" value={builder.window} onChange={(event) => apply({ window: event.target.value as PromqlWindow })}>{windows.map((item) => <option key={item}>{item}</option>)}</select></label>}
    </div>
    <div className="promql-builder-section"><div className="builder-control"><span className="builder-field-label">Filter by labels</span><MultiCombobox label="Filter by labels" values={selectedLabels} options={labelOptions} onChange={changeFilterLabels} searchable showChips disabled={!builder.metric || loadingLabels} placeholder="No label filters" /></div>
      {builder.filters.map((filter) => <div className="builder-control promql-value-control" key={filter.label}><span className="builder-field-label">{filter.label}</span><MultiCombobox label={`${filter.label} values`} values={filter.values} options={(values[filter.label] ?? []).map((value) => ({ value, label: value }))} onChange={(selected) => apply({ filters: builder.filters.map((item) => item.label === filter.label ? { ...item, values: selected } : item) })} searchable showChips placeholder="Select values…" onOpen={() => loadValues(filter.label)} /></div>)}
    </div>
    <div className="promql-builder-section"><div className="builder-control"><span className="builder-field-label">Group by</span><MultiCombobox label="Group by labels" values={builder.groupBy} options={labelOptions.filter((option) => builder.calculation !== 'percentile' || option.value !== 'le')} onChange={(groupBy) => apply({ groupBy })} searchable showChips disabled={!builder.metric || builder.calculation === 'raw' || loadingLabels} placeholder={builder.calculation === 'raw' ? 'Unavailable for Raw' : 'No grouping'} /></div></div>
    <details className="generated-sql generated-promql"><summary><span>Generated PromQL</span><button className="btn ghost" type="button" disabled={!generated} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (generated) setSql(generated, tabId); setMode('sql', tabId); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="PromQL editor"]')?.focus()) }}>Open in PromQL</button></summary>{validation ? <p className="inline-error" role="status">{validation}</p> : <pre>{generated}</pre>}</details>
  </div>
}
