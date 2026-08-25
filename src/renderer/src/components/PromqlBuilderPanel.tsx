import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { selectActiveSession, useStore } from '../store/useStore'
import { buildPromql, detectPromqlHistogramKind, resolvePromqlHistogramKind, validatePromqlBuilder, type PromqlAggregation, type PromqlCalculation, type PromqlHistogramKind, type PromqlHistogramKindOverride, type PromqlQuantile, type PromqlWindow } from '../lib/promqlBuilder'
import { metricLabels, metricLabelValues, prometheusMetadataError } from '../lib/prometheusMetadata'
import { Combobox, MultiCombobox } from './ui/combobox'
import { InfoTooltip } from './ui/InfoTooltip'
import { GeneratedQueryPanel } from './query/GeneratedQueryPanel'
import styles from './PromqlBuilderPanel.module.css'

const ordinaryCalculations = ['raw', 'rate', 'increase'] as const
const histogramCalculations = ['observation-rate', 'histogram-average', 'histogram-sum', 'percentile'] as const
const aggregations = ['none', 'sum', 'avg', 'min', 'max'] as const
const windows = ['1m', '5m', '10m', '15m', '30m', '1h'] as const
const quantiles = [{ value: 0.5, label: 'P50' }, { value: 0.75, label: 'P75' }, { value: 0.9, label: 'P90' }, { value: 0.95, label: 'P95' }, { value: 0.99, label: 'P99' }, { value: 0.999, label: 'P99.9' }] as const
const histogramKindOverrides: { value: PromqlHistogramKindOverride; label: string }[] = [{ value: 'auto', label: 'Auto' }, { value: 'classic', label: 'Classic histogram' }, { value: 'native', label: 'Native histogram' }]
const rangeCalculations = new Set<PromqlCalculation>(['rate', 'increase', ...histogramCalculations])
const histogramCalculationSet = new Set<PromqlCalculation>(histogramCalculations)
const calculationLabels: Record<PromqlCalculation, string> = { raw: 'Raw', rate: 'Rate', increase: 'Increase', 'observation-rate': 'Observation rate', 'histogram-average': 'Average', 'histogram-sum': 'Sum of observations', percentile: 'Percentile' }
const titleCase = (value: string) => value === 'avg' ? 'Average' : value === 'min' ? 'Minimum' : value === 'max' ? 'Maximum' : value[0].toUpperCase() + value.slice(1)

function calculationsForHistogramKind(kind: PromqlHistogramKind): readonly PromqlCalculation[] {
  if (kind === 'classic') return ['raw', 'percentile']
  if (kind === 'native') return ['raw', ...histogramCalculations]
  if (kind === 'not-histogram') return ordinaryCalculations
  return [...ordinaryCalculations, ...histogramCalculations]
}

export function PromqlBuilderPanel() {
  const tabId = useStore((state) => state.activeTabId)
  const session = useStore(selectActiveSession)
  const profileId = session.connectionProfileId
  const connectionGeneration = useStore((state) => state.connectionGeneration)
  const metadata = useStore((state) => profileId ? state.metadataByProfileId[profileId] : undefined)
  const setBuilder = useStore((state) => state.setPromqlBuilder)
  const setSql = useStore((state) => state.setSql)
  const setMode = useStore((state) => state.setQueryMode)
  const [labels, setLabels] = useState<string[]>([])
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({})
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({})
  const builder = session.promqlBuilder
  const metrics = useMemo(() => (metadata?.schemas ?? []).flatMap((schema) => schema.relations).filter((relation) => relation.kind === 'metric'), [metadata?.schemas])
  const selectedMetric = metrics.find((metric) => metric.name === builder.metric)
  const metadataType = selectedMetric?.details?.kind === 'metric' ? selectedMetric.details.type : undefined
  const detectedHistogramKind = detectPromqlHistogramKind({ metric: builder.metric, labels, metadataType })
  const histogramKindOverride = builder.histogramKindOverride ?? 'auto'
  const histogramKind = resolvePromqlHistogramKind(detectedHistogramKind, histogramKindOverride)
  const previousHistogramKind = useRef(histogramKind)
  const labelRequest = useRef(0)
  const metricOptions = metrics.map((metric) => ({ value: metric.name, label: metric.name, subtitle: metric.details?.kind === 'metric' ? metric.details.type : undefined }))
  const labelOptions = labels.filter((label) => label !== '__name__').sort((left, right) => left.localeCompare(right)).map((label) => ({ value: label, label }))
  const activeLabels = [...new Set([...builder.groupBy, ...builder.filterBy])]
  const loadingMetrics = metadata?.status === 'loading'

  const apply = (patch: Partial<typeof builder>) => {
    const next = { ...builder, ...patch }
    const nextHistogramKind = resolvePromqlHistogramKind(detectedHistogramKind, next.histogramKindOverride ?? 'auto')
    setBuilder(patch, tabId)
    const generated = buildPromql(next, nextHistogramKind)
    if (generated) setSql(generated, tabId)
  }
  const loadValues = useCallback((label: string) => {
    if (!profileId || !builder.metric || !label || values[label] || loadingValues[label]) return
    setLoadingValues((current) => ({ ...current, [label]: true }))
    setValueErrors((current) => { const next = { ...current }; delete next[label]; return next })
    void metricLabelValues(profileId, builder.metric, label, connectionGeneration)
      .then((found) => setValues((current) => ({ ...current, [label]: found })))
      .catch((error) => setValueErrors((current) => ({ ...current, [label]: prometheusMetadataError(error).message })))
      .finally(() => setLoadingValues((current) => ({ ...current, [label]: false })))
  }, [profileId, builder.metric, connectionGeneration, values, loadingValues])
  const loadLabels = useCallback(() => {
    if (!profileId || !builder.metric) return
    const request = ++labelRequest.current
    setLoadingLabels(true)
    setLabelError(null)
    void metricLabels(profileId, builder.metric, connectionGeneration)
      .then((found) => { if (request === labelRequest.current) setLabels(found.filter((label) => label !== '__name__')) })
      .catch((error) => { if (request === labelRequest.current) setLabelError(prometheusMetadataError(error).message) })
      .finally(() => { if (request === labelRequest.current) setLoadingLabels(false) })
  }, [profileId, builder.metric, connectionGeneration])
  const selectMetric = (metric: string) => {
    if (metric === builder.metric) return
    const target = metrics.find((candidate) => candidate.name === metric)
    const targetType = target?.details?.kind === 'metric' ? target.details.type : undefined
    const targetDetectedKind = detectPromqlHistogramKind({ metric, labels: [], metadataType: targetType })
    const targetKind = resolvePromqlHistogramKind(targetDetectedKind, 'auto')
    const calculation = calculationsForHistogramKind(targetKind).includes(builder.calculation) ? builder.calculation : 'raw' as const
    const next = { ...builder, metric, calculation, histogramKindOverride: 'auto' as const, aggregation: histogramCalculationSet.has(calculation) ? 'sum' as const : calculation === 'raw' ? 'none' as const : builder.aggregation, filterBy: [], groupBy: [], labelValues: {} }
    setBuilder(next, tabId)
    const generated = buildPromql(next, targetKind)
    if (generated) setSql(generated, tabId)
    setLabels([]); setValues({}); setLoadingValues({}); setValueErrors({}); setLabelError(null)
  }
  useEffect(() => {
    labelRequest.current++
    setLabels([]); setValues({}); setLoadingValues({}); setValueErrors({}); setLabelError(null)
    loadLabels()
    return () => { labelRequest.current++ }
  }, [profileId, builder.metric, connectionGeneration])
  const changeDimensions = (kind: 'groupBy' | 'filterBy', nextLabels: string[]) => {
    const other = kind === 'groupBy' ? builder.filterBy : builder.groupBy
    const nextActive = [...new Set([...nextLabels, ...other])]
    const added = nextActive.filter((label) => !activeLabels.includes(label))
    const labelValues = Object.fromEntries(Object.entries(builder.labelValues).filter(([label]) => nextActive.includes(label)))
    const aggregation = kind === 'groupBy' && nextLabels.length && builder.aggregation === 'none' ? 'sum' as const : builder.aggregation
    apply({ [kind]: nextLabels, labelValues, aggregation })
    added.forEach(loadValues)
  }
  const loadedValueLabels = Object.keys(values).sort().join('\0')
  useEffect(() => { activeLabels.forEach(loadValues) }, [profileId, builder.metric, connectionGeneration, activeLabels.join('\0'), loadedValueLabels])
  useEffect(() => {
    if (!calculationsForHistogramKind(histogramKind).includes(builder.calculation)) {
      apply({ calculation: 'raw', aggregation: 'none' })
      previousHistogramKind.current = histogramKind
      return
    }
    if (previousHistogramKind.current !== histogramKind && histogramCalculationSet.has(builder.calculation)) {
      const generated = buildPromql(builder, histogramKind)
      if (generated) setSql(generated, tabId)
    }
    previousHistogramKind.current = histogramKind
    if (import.meta.env.DEV && builder.metric && !loadingLabels) console.debug(`[prometheus:builder] selectedMetric=${builder.metric} metadataType=${metadataType ?? 'unknown'} labels=${JSON.stringify(labels)} detectedHistogramKind=${detectedHistogramKind} histogramKind=${histogramKind}`)
  }, [histogramKind, builder.metric, loadingLabels])
  const changeCalculation = (calculation: PromqlCalculation) => {
    const aggregation: PromqlAggregation = histogramCalculationSet.has(calculation) ? 'sum' : calculation === 'rate' || calculation === 'increase' ? 'sum' : builder.aggregation
    apply({ calculation, aggregation, groupBy: calculation === 'raw' && aggregation === 'none' ? [] : builder.groupBy })
  }
  const changeHistogramKindOverride = (override: PromqlHistogramKindOverride) => {
    const nextKind = resolvePromqlHistogramKind(detectedHistogramKind, override)
    const calculation = calculationsForHistogramKind(nextKind).includes(builder.calculation) ? builder.calculation : 'raw' as const
    apply({ histogramKindOverride: override, calculation, aggregation: histogramCalculationSet.has(calculation) ? 'sum' : calculation === 'raw' ? 'none' : builder.aggregation })
  }
  const validation = validatePromqlBuilder(builder, histogramKind)
  const generated = buildPromql(builder, histogramKind)
  const availableCalculations = calculationsForHistogramKind(histogramKind)
  const calculationOptions = availableCalculations.map((value) => ({ value, label: calculationLabels[value] }))
  const aggregationOptions = aggregations.map((value) => ({ value, label: titleCase(value) }))
  const metricPlaceholder = loadingMetrics ? 'Loading metrics…' : 'Select a metric…'
  const groupByPlaceholder = loadingLabels ? 'Loading labels…' : labelError ? 'Could not load labels' : labels.length === 0 ? 'No labels available' : 'No grouping'
  const labelPlaceholder = loadingLabels ? 'Loading labels…' : labelError ? 'Could not load labels' : labels.length === 0 ? 'No labels available' : 'No filters'
  const histogramAmbiguous = detectedHistogramKind === 'unknown' && !loadingLabels
  const openGeneratedQuery = () => {
    if (!generated) return
    setSql(generated, tabId)
    setMode('sql', tabId)
  }

  return <div className={`${styles.root} promql-builder-form`} data-promql-builder="">
    <div className={styles.coreRow} data-promql-row="core">
      <div className={styles.control}><span className={styles.fieldLabel}>Metric</span><Combobox label="Metric" value={builder.metric} options={metricOptions} onChange={selectMetric} searchable placeholder={metricPlaceholder} emptyMessage="No matching metrics" disabled={loadingMetrics} /></div>
      <div className={styles.control}><span className={styles.fieldLabel}>Calculation {histogramAmbiguous && <InfoTooltip label="Histogram representation" tone="warning">Auto detection could not determine whether this metric is a classic or native histogram. Histogram calculations are not generated until you choose a representation.</InfoTooltip>}</span><Combobox label="Calculation" value={builder.calculation} options={calculationOptions} onChange={(value) => changeCalculation(value as PromqlCalculation)} /></div>
      {histogramAmbiguous && <div className={styles.control}><span className={styles.fieldLabel}>Histogram representation</span><Combobox label="Histogram representation" value={histogramKindOverride} options={histogramKindOverrides} onChange={(value) => changeHistogramKindOverride(value as PromqlHistogramKindOverride)} /></div>}
      {builder.calculation === 'percentile' && <div className={styles.control}><span className={styles.fieldLabel}>Percentile</span><Combobox label="Percentile" value={String(builder.percentile)} options={quantiles.map(({ value, label }) => ({ value: String(value), label }))} onChange={(value) => apply({ percentile: Number(value) as PromqlQuantile })} /></div>}
      {!histogramCalculationSet.has(builder.calculation) && <div className={styles.control}><span className={styles.fieldLabel}>Aggregation <InfoTooltip label="Aggregation">Combines the resulting time series after the calculation. Sum is common for counters split across instances; Average, Minimum and Maximum compare the calculated values across series.</InfoTooltip></span><Combobox label="Aggregation" value={builder.aggregation} options={aggregationOptions} onChange={(value) => apply({ aggregation: value as PromqlAggregation, ...(value === 'none' ? { groupBy: [] } : {}) })} /></div>}
      {rangeCalculations.has(builder.calculation) && <div className={styles.control}><span className={styles.fieldLabel}>Rate window <InfoTooltip label="Rate window">How much history each calculation looks back over. Example: 5m means rate(...[5m]) uses the previous 5 minutes at each point.</InfoTooltip></span><Combobox label="Rate window" value={builder.window} options={windows.map((value) => ({ value, label: value }))} onChange={(value) => apply({ window: value as PromqlWindow })} /></div>}
    </div>
    <div className={styles.filterGroupRow} data-promql-row="filters-and-grouping">
      <div className={styles.control}><span className={styles.fieldLabel}>Group by</span><MultiCombobox label="Group by" values={builder.groupBy} options={labelOptions.filter((option) => builder.calculation !== 'percentile' || histogramKind !== 'classic' || option.value !== 'le')} onChange={(labels) => changeDimensions('groupBy', labels)} searchable showChips disabled={!builder.metric || loadingLabels || Boolean(labelError) || labels.length === 0} placeholder={groupByPlaceholder} /></div>
      <div className={styles.control}><span className={styles.fieldLabel}>Filter by</span><MultiCombobox label="Filter by" values={builder.filterBy} options={labelOptions} onChange={(labels) => changeDimensions('filterBy', labels)} searchable showChips disabled={!builder.metric || loadingLabels || Boolean(labelError) || labels.length === 0} placeholder={labelPlaceholder} /></div>
    </div>
    {labelError && <div className="inline-error" role="alert">Could not load metric labels. {labelError} <button type="button" className="btn ghost" onClick={loadLabels} disabled={loadingLabels}>{loadingLabels ? 'Retrying…' : 'Retry'}</button></div>}
    <div className={styles.valuesGrid} data-promql-row="filter-values">{activeLabels.map((label) => {
      const loading = Boolean(loadingValues[label]); const error = valueErrors[label]; const loaded = Object.hasOwn(values, label)
      const placeholder = loading ? 'Loading values…' : error ? 'Could not load values' : loaded && values[label].length === 0 ? 'No values found' : 'Select values…'
      return <div className={`${styles.control} ${styles.valueControl}`} key={label}><span className={styles.fieldLabel}>{label}</span><MultiCombobox label={`${label} values`} values={builder.labelValues[label] ?? []} options={[...(values[label] ?? [])].sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value }))} onChange={(selected) => apply({ labelValues: { ...builder.labelValues, [label]: selected } })} onOpen={() => loadValues(label)} searchable showChips disabled={loading || Boolean(error) || loaded && values[label].length === 0} placeholder={placeholder} />{error && <small className="inline-error" role="alert">{error} <button type="button" className="btn ghost" onClick={() => { setValues((current) => { const next = { ...current }; delete next[label]; return next }); loadValues(label) }}>Retry</button></small>}</div>
    })}</div>
    <GeneratedQueryPanel language="PromQL" value={generated} validation={validation} onOpenInEditor={openGeneratedQuery} />
  </div>
}
