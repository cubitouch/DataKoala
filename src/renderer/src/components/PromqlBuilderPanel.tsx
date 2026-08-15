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
  const labelOptions = labels.filter((label) => label !== '__name__').sort((left, right) => left.localeCompare(right)).map((label) => ({ value: label, label }))
  const activeLabels = [...new Set([...builder.groupBy, ...builder.filterBy])]

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
    const calculation = builder.calculation === 'percentile' && !percentile ? 'raw' : builder.calculation
    apply({ metric, calculation, aggregation: calculation === 'percentile' ? 'sum' : builder.aggregation, filterBy: [], groupBy: [], labelValues: {} })
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
  const changeDimensions = (kind: 'groupBy' | 'filterBy', nextLabels: string[]) => {
    const other = kind === 'groupBy' ? builder.filterBy : builder.groupBy
    const nextActive = [...new Set([...nextLabels, ...other])]
    const added = nextActive.filter((label) => !activeLabels.includes(label))
    const labelValues = Object.fromEntries(Object.entries(builder.labelValues).filter(([label]) => nextActive.includes(label)))
    const aggregation = kind === 'groupBy' && nextLabels.length && builder.aggregation === 'none' ? 'sum' as const : builder.aggregation
    apply({ [kind]: nextLabels, labelValues, aggregation })
    added.forEach(loadValues)
  }
  useEffect(() => { activeLabels.forEach(loadValues) }, [profileId, builder.metric, activeLabels.join('\0')])
  const changeCalculation = (calculation: PromqlCalculation) => {
    const aggregation: PromqlAggregation = calculation === 'percentile' ? 'sum' : calculation === 'rate' || calculation === 'increase' ? 'sum' : builder.aggregation
    apply({ calculation, aggregation, groupBy: calculation === 'raw' && aggregation === 'none' ? [] : builder.groupBy })
  }
  const validation = validatePromqlBuilder(builder)
  const generated = buildPromql(builder)
  const calculationOptions = calculations.map((value) => ({ value, label: titleCase(value), disabled: value === 'percentile' && !builder.metric.endsWith('_bucket') }))
  const aggregationOptions = aggregations.map((value) => ({ value, label: titleCase(value) }))
  const labelPlaceholder = loadingLabels ? 'Loading labels…' : labelError ? 'Could not load labels' : labels.length === 0 ? 'No labels available' : 'No filters'

  return <div className="promql-builder-form">
    <div className="promql-builder-grid promql-core-row" data-promql-row="core">
      <div className="builder-control promql-metric-control"><span className="builder-field-label">Metric</span><Combobox label="Metric" value={builder.metric} options={metricOptions} onChange={selectMetric} searchable placeholder="Select a metric…" emptyMessage="No matching metrics" /></div>
      <div className="builder-control"><span className="builder-field-label">Calculation</span><Combobox label="Calculation" value={builder.calculation} options={calculationOptions} onChange={(value) => changeCalculation(value as PromqlCalculation)} /></div>
      {builder.calculation === 'percentile' && <div className="builder-control"><span className="builder-field-label">Percentile</span><Combobox label="Percentile" value={String(builder.percentile)} options={quantiles.map(({ value, label }) => ({ value: String(value), label }))} onChange={(value) => apply({ percentile: Number(value) as PromqlQuantile })} /></div>}
      {builder.calculation !== 'percentile' && <div className="builder-control"><span className="builder-field-label">Aggregation <InfoTooltip label="Aggregation">Combines the resulting time series after the calculation. Sum is common for counters split across instances; Average, Minimum and Maximum compare the calculated values across series.</InfoTooltip></span><Combobox label="Aggregation" value={builder.aggregation} options={aggregationOptions} onChange={(value) => apply({ aggregation: value as PromqlAggregation, ...(value === 'none' ? { groupBy: [] } : {}) })} /></div>}
      {rangeCalculations.has(builder.calculation) && <div className="builder-control"><span className="builder-field-label">Rate window <InfoTooltip label="Rate window">How much history each calculation looks back over. Example: 5m means rate(...[5m]) uses the previous 5 minutes at each point.</InfoTooltip></span><Combobox label="Rate window" value={builder.window} options={windows.map((value) => ({ value, label: value }))} onChange={(value) => apply({ window: value as PromqlWindow })} /></div>}
    </div>
    <div className="promql-filter-group-row" data-promql-row="filters-and-grouping">
      <div className="builder-control"><span className="builder-field-label">Group by</span><MultiCombobox label="Group by" values={builder.groupBy} options={labelOptions.filter((option) => builder.calculation !== 'percentile' || option.value !== 'le')} onChange={(labels) => changeDimensions('groupBy', labels)} searchable showChips disabled={!builder.metric || loadingLabels} placeholder="No grouping" /></div>
      <div className="builder-control"><span className="builder-field-label">Filter by</span><MultiCombobox label="Filter by" values={builder.filterBy} options={labelOptions} onChange={(labels) => changeDimensions('filterBy', labels)} searchable showChips disabled={!builder.metric || loadingLabels || labelError || labels.length === 0} placeholder={labelPlaceholder} /></div>
    </div>
    <div className="promql-values-grid" data-promql-row="filter-values">{activeLabels.map((label) => {
      const loading = Boolean(loadingValues[label]); const error = Boolean(valueErrors[label]); const loaded = Object.hasOwn(values, label)
      const placeholder = loading ? 'Loading values…' : error ? 'Could not load values' : loaded && values[label].length === 0 ? 'No values found' : 'Select values…'
      return <div className="builder-control promql-value-control" key={label}><span className="builder-field-label">{label}</span><MultiCombobox label={`${label} values`} values={builder.labelValues[label] ?? []} options={[...(values[label] ?? [])].sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value }))} onChange={(selected) => apply({ labelValues: { ...builder.labelValues, [label]: selected } })} onOpen={() => loadValues(label)} searchable showChips disabled={loading || error || loaded && values[label].length === 0} placeholder={placeholder} /></div>
    })}</div>
    <details className="generated-promql"><summary><span>Generated PromQL</span><button className="btn ghost open-promql-action" type="button" disabled={!generated} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (generated) setSql(generated, tabId); setMode('sql', tabId); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="PromQL editor"]')?.focus()) }}>Open in PromQL</button></summary>{validation ? <p className="inline-error" role="status">{validation}</p> : <pre>{generated}</pre>}</details>
  </div>
}
