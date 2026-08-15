import { useCallback, useEffect, useMemo, useState } from 'react'
import { selectActiveSession, useStore } from '../store/useStore'
import { buildPromql, validatePromqlBuilder, type PromqlAggregation, type PromqlCalculation, type PromqlQuantile, type PromqlWindow } from '../lib/promqlBuilder'
import { metricLabels, metricLabelValues } from '../lib/prometheusMetadata'
import { Combobox, MultiCombobox } from './ui/combobox'
import { InfoTooltip } from './ui/InfoTooltip'

const calculations = ['raw', 'rate', 'increase', 'percentile'] as const
const aggregations = ['none', 'sum', 'avg', 'min', 'max'] as const
const windows = ['1m', '5m', '10m', '15m', '30m', '1h'] as const
const quantiles = [{ value: 0.5, label: 'P50' }, { value: 0.75, label: 'P75' }, { value: 0.9, label: 'P90' }, { value: 0.95, label: 'P95' }, { value: 0.99, label: 'P99' }, { value: 0.999, label: 'P99.9' }] as const
const rangeCalculations = new Set<PromqlCalculation>(['rate', 'increase', 'percentile'])
const titleCase = (value: string) => value === 'avg' ? 'Average' : value === 'min' ? 'Minimum' : value === 'max' ? 'Maximum' : value[0].toUpperCase() + value.slice(1)

export function PromqlBuilderPanel() {
  const tabId = useStore((state) => state.activeTabId)
  const session = useStore(selectActiveSession)
  const profileId = session.connectionProfileId
  const metadata = useStore((state) => profileId ? state.metadataByProfileId[profileId] : undefined)
  const setBuilder = useStore((state) => state.setPromqlBuilder)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const [labels, setLabels] = useState<string[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [labelError, setLabelError] = useState(false)
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({})
  const [valueErrors, setValueErrors] = useState<Record<string, boolean>>({})
  const builder = session.promqlBuilder
  const metrics = useMemo(() => (metadata?.schemas ?? []).flatMap((schema) => schema.relations).filter((relation) => relation.kind === 'metric'), [metadata?.schemas])
  const metricOptions = metrics.map((metric) => ({ value: metric.name, label: metric.name, subtitle: metric.details?.kind === 'metric' ? metric.details.type : undefined }))
  const labelOptions = labels.filter((label) => label !== '__name__').map((label) => ({ value: label, label }))
  const selectedLabels = builder.filters.map((filter) => filter.label)

  const apply = (patch: Partial<typeof builder>) => {
    const next = { ...builder, ...patch }
    setBuilder(patch, tabId)
    const generated = buildPromql(next)
    if (generated) setSql(generated, tabId)
  }
  const loadValues = useCallback((label: string) => {
    if (!profileId || !builder.metric || !label || values[label] || loadingValues[label]) return
    setLoadingValues((current) => ({ ...current, [label]: true }))
    setValueErrors((current) => ({ ...current, [label]: false }))
    void metricLabelValues(profileId, builder.metric, label)
      .then((found) => setValues((current) => ({ ...current, [label]: found })))
      .catch(() => setValueErrors((current) => ({ ...current, [label]: true })))
      .finally(() => setLoadingValues((current) => ({ ...current, [label]: false })))
  }, [profileId, builder.metric, values, loadingValues])
  const selectMetric = (metric: string) => {
    const percentile = builder.calculation === 'percentile' && metric.endsWith('_bucket')
    apply({ metric, calculation: percentile ? 'percentile' : 'raw', aggregation: percentile ? 'sum' : 'none', filters: [], groupBy: [] })
    setLabels([]); setValues({}); setLoadingValues({}); setValueErrors({})
  }
  useEffect(() => {
    if (!profileId || !builder.metric) return
    let active = true
    setLoadingLabels(true); setLabelError(false)
    metricLabels(profileId, builder.metric)
      .then((found) => { if (active) setLabels(found.filter((label) => label !== '__name__')) })
      .catch(() => { if (active) setLabelError(true) })
      .finally(() => { if (active) setLoadingLabels(false) })
    return () => { active = false }
  }, [profileId, builder.metric])
  const changeFilterLabels = (nextLabels: string[]) => {
    const added = nextLabels.filter((label) => !selectedLabels.includes(label))
    apply({ filters: nextLabels.map((label) => builder.filters.find((filter) => filter.label === label) ?? { label, values: [] }) })
    added.forEach(loadValues)
  }
  const changeCalculation = (calculation: PromqlCalculation) => {
    const aggregation: PromqlAggregation = calculation === 'percentile' ? 'sum' : calculation === 'rate' || calculation === 'increase' ? 'sum' : builder.aggregation
    apply({ calculation, aggregation, groupBy: calculation === 'raw' && aggregation === 'none' ? [] : builder.groupBy })
  }
  const changeGroupBy = (groupBy: string[]) => apply({ groupBy, ...(groupBy.length && builder.aggregation === 'none' ? { aggregation: 'sum' as const } : {}) })
  const validation = validatePromqlBuilder(builder)
  const generated = buildPromql(builder)
  const calculationOptions = calculations.map((value) => ({ value, label: titleCase(value), disabled: value === 'percentile' && !builder.metric.endsWith('_bucket') }))
  const aggregationOptions = aggregations.map((value) => ({ value, label: titleCase(value), disabled: builder.calculation === 'percentile' ? value !== 'sum' : (builder.calculation === 'rate' || builder.calculation === 'increase') && value !== 'none' && value !== 'sum' }))
  const labelPlaceholder = loadingLabels ? 'Loading labels…' : labelError ? 'Could not load labels' : labels.length === 0 ? 'No labels available' : 'No label filters'

  return <div className="promql-builder-form">
    <div className="promql-builder-grid promql-core-row" data-promql-row="core">
      <div className="builder-control promql-metric-control"><span className="builder-field-label">Metric</span><Combobox label="Metric" value={builder.metric} options={metricOptions} onChange={selectMetric} searchable placeholder="Select a metric…" emptyMessage="No matching metrics" /></div>
      <div className="builder-control"><span className="builder-field-label">Calculation</span><Combobox label="Calculation" value={builder.calculation} options={calculationOptions} onChange={(value) => changeCalculation(value as PromqlCalculation)} /></div>
      {builder.calculation === 'percentile' && <div className="builder-control"><span className="builder-field-label">Percentile</span><Combobox label="Percentile" value={String(builder.percentile)} options={quantiles.map(({ value, label }) => ({ value: String(value), label }))} onChange={(value) => apply({ percentile: Number(value) as PromqlQuantile })} /></div>}
      <div className="builder-control"><span className="builder-field-label">Aggregation</span><Combobox label="Aggregation" value={builder.calculation === 'percentile' ? 'sum' : builder.aggregation} options={aggregationOptions} disabled={builder.calculation === 'percentile'} onChange={(value) => apply({ aggregation: value as PromqlAggregation, ...(value === 'none' ? { groupBy: [] } : {}) })} /></div>
      {rangeCalculations.has(builder.calculation) && <div className="builder-control"><span className="builder-field-label">Rate window <InfoTooltip label="Rate window">How much history each calculation looks back over. Example: 5m means rate(...[5m]) uses the previous 5 minutes at each point.</InfoTooltip></span><Combobox label="Rate window" value={builder.window} options={windows.map((value) => ({ value, label: value }))} onChange={(value) => apply({ window: value as PromqlWindow })} /></div>}
    </div>
    <div className="promql-filter-group-row" data-promql-row="filters-and-grouping">
      <div className="builder-control"><span className="builder-field-label">Filter by labels</span><MultiCombobox label="Filter by labels" values={selectedLabels} options={labelOptions} onChange={changeFilterLabels} searchable showChips disabled={!builder.metric || loadingLabels || labelError || labels.length === 0} placeholder={labelPlaceholder} /></div>
      <div className="builder-control"><span className="builder-field-label">Group by</span><MultiCombobox label="Group by labels" values={builder.groupBy} options={labelOptions.filter((option) => builder.calculation !== 'percentile' || option.value !== 'le')} onChange={changeGroupBy} searchable showChips disabled={!builder.metric || builder.calculation === 'raw' && builder.aggregation === 'none' || loadingLabels} placeholder="No grouping" /></div>
    </div>
    <div className="promql-values-grid" data-promql-row="filter-values">{builder.filters.map((filter) => {
      const loading = Boolean(loadingValues[filter.label]); const error = Boolean(valueErrors[filter.label]); const loaded = Object.hasOwn(values, filter.label)
      const placeholder = loading ? 'Loading values…' : error ? 'Could not load values' : loaded && values[filter.label].length === 0 ? 'No values found' : 'Select values…'
      return <div className="builder-control promql-value-control" key={filter.label}><span className="builder-field-label">{filter.label}</span><MultiCombobox label={`${filter.label} values`} values={filter.values} options={(values[filter.label] ?? []).map((value) => ({ value, label: value }))} onChange={(selected) => apply({ filters: builder.filters.map((item) => item.label === filter.label ? { ...item, values: selected } : item) })} onOpen={() => loadValues(filter.label)} searchable showChips disabled={loading || error || loaded && values[filter.label].length === 0} placeholder={placeholder} /></div>
    })}</div>
    <details className="generated-promql"><summary><span>Generated PromQL</span><button className="btn ghost open-promql-action" type="button" disabled={!generated} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (generated) setSql(generated, tabId); setMode('sql', tabId); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="PromQL editor"]')?.focus()) }}>Open in PromQL</button></summary>{validation ? <p className="inline-error" role="status">{validation}</p> : <pre>{generated}</pre>}</details>
  </div>
}
