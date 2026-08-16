export type PromqlCalculation = 'raw' | 'rate' | 'increase' | 'observation-rate' | 'histogram-average' | 'histogram-sum' | 'percentile'
export type PromqlAggregation = 'none' | 'sum' | 'avg' | 'min' | 'max'
export type PromqlWindow = '1m' | '5m' | '10m' | '15m' | '30m' | '1h'
export type PromqlQuantile = 0.5 | 0.75 | 0.9 | 0.95 | 0.99 | 0.999
export type PromqlHistogramKind = 'classic' | 'native' | 'unknown' | 'not-histogram'
export type PromqlHistogramKindOverride = 'auto' | 'classic' | 'native'
export interface PromqlBuilderState {
  metric: string
  filterBy: string[]
  groupBy: string[]
  labelValues: Record<string, string[]>
  calculation: PromqlCalculation
  aggregation: PromqlAggregation
  window: PromqlWindow
  percentile: PromqlQuantile
  histogramKindOverride?: PromqlHistogramKindOverride
}

export const DEFAULT_PROMQL_BUILDER: PromqlBuilderState = { metric: '', filterBy: [], groupBy: [], labelValues: {}, calculation: 'raw', aggregation: 'none', window: '5m', percentile: 0.95, histogramKindOverride: 'auto' }
const HISTOGRAM_CALCULATIONS = new Set<PromqlCalculation>(['observation-rate', 'histogram-average', 'histogram-sum', 'percentile'])
const NATIVE_ONLY_HISTOGRAM_CALCULATIONS = new Set<PromqlCalculation>(['observation-rate', 'histogram-average', 'histogram-sum'])
const KNOWN_NON_HISTOGRAM_METADATA_TYPES = new Set(['counter', 'gauge', 'summary', 'info', 'stateset', 'gaugehistogram'])

export function isHistogramCalculation(calculation: PromqlCalculation): boolean {
  return HISTOGRAM_CALCULATIONS.has(calculation)
}

export function escapePromqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

export function escapePromqlRegexLiteral(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

export function validatePromqlBuilder(state: PromqlBuilderState, histogramKind: PromqlHistogramKind = 'unknown'): string | null {
  if (!state.metric.trim()) return 'Select a metric to generate PromQL.'
  if (state.percentile <= 0 || state.percentile >= 1) return 'Percentile must be between 0 and 1.'
  if (isHistogramCalculation(state.calculation)) {
    if (histogramKind === 'unknown') return 'Choose Classic histogram or Native histogram to generate this histogram calculation.'
    if (histogramKind === 'not-histogram') return 'Histogram calculations are not available for this metric.'
    if (histogramKind === 'classic' && NATIVE_ONLY_HISTOGRAM_CALCULATIONS.has(state.calculation)) return 'This calculation is only supported for native histograms.'
  }
  if (state.groupBy.length && state.aggregation === 'none' && !isHistogramCalculation(state.calculation)) return 'Group by requires an aggregation.'
  return null
}

export function buildSelector(metric: string, labels: string[], labelValues: Record<string, string[]>): string {
  const matchers = [...new Set(labels)].flatMap((label) => {
    const values = labelValues[label] ?? []
    if (!values.length) return []
    if (values.length === 1) return `${label}="${escapePromqlString(values[0])}"`
    const regex = values.map(escapePromqlRegexLiteral).join('|')
    return `${label}=~"${escapePromqlString(regex)}"`
  })
  return `${metric}${matchers.length ? `{${matchers.join(',')}}` : ''}`
}

export function buildAggregation(operator: 'sum' | 'avg' | 'min' | 'max', expression: string, groupBy: string[]): string {
  const groups = [...new Set(groupBy.filter(Boolean))]
  return groups.length ? `${operator} by (${groups.join(', ')}) (\n${indentPromql(expression)}\n)` : `${operator}(${expression})`
}

function indentPromql(expression: string, spaces = 2): string {
  const indentation = ' '.repeat(spaces)
  return expression.split('\n').map((line) => `${indentation}${line}`).join('\n')
}

export function detectPromqlHistogramKind({ metric, labels, metadataType }: { metric: string; labels: readonly string[]; metadataType?: string }): PromqlHistogramKind {
  if (labels.includes('le')) return 'classic'
  if (metric.endsWith('_bucket')) return 'classic'
  const normalizedType = metadataType?.trim().toLowerCase()
  if (normalizedType === 'histogram') return 'native'
  // Gauge histograms and known scalar metric families must not receive counter-style
  // rate semantics. Unknown future metadata types remain user-resolvable instead.
  if (normalizedType && KNOWN_NON_HISTOGRAM_METADATA_TYPES.has(normalizedType)) return 'not-histogram'
  return 'unknown'
}

export function resolvePromqlHistogramKind(detectedKind: PromqlHistogramKind, override: PromqlHistogramKindOverride = 'auto'): PromqlHistogramKind {
  if (detectedKind !== 'unknown' || override === 'auto') return detectedKind
  return override
}

export function buildClassicHistogramPercentile(state: PromqlBuilderState, selector: string): string {
  const groups = [...new Set([...state.groupBy.filter((label) => label !== 'le'), 'le'])]
  return `histogram_quantile(\n  ${state.percentile},\n  sum by (${groups.join(', ')}) (\n    rate(${selector}[${state.window}])\n  )\n)`
}

export function buildNativeHistogramPercentile(state: PromqlBuilderState, selector: string): string {
  const groups = [...new Set(state.groupBy.filter(Boolean))]
  const aggregation = groups.length ? `sum by (${groups.join(', ')}) (` : 'sum('
  return `histogram_quantile(\n  ${state.percentile},\n  ${aggregation}\n    rate(${selector}[${state.window}])\n  )\n)`
}

function buildRateSelector(selector: string, window: PromqlWindow): string {
  return `rate(${selector}[${window}])`
}

export function buildNativeHistogramObservationRate(state: PromqlBuilderState, selector: string): string {
  const expression = `histogram_count(\n  ${buildRateSelector(selector, state.window)}\n)`
  return state.groupBy.length ? buildAggregation('sum', expression, state.groupBy) : expression
}

export function buildNativeHistogramSum(state: PromqlBuilderState, selector: string): string {
  const expression = `histogram_sum(\n  ${buildRateSelector(selector, state.window)}\n)`
  return state.groupBy.length ? buildAggregation('sum', expression, state.groupBy) : expression
}

export function buildNativeHistogramAverage(state: PromqlBuilderState, selector: string): string {
  const rate = buildRateSelector(selector, state.window)
  if (!state.groupBy.length) return `histogram_avg(\n  ${rate}\n)`
  const sum = buildAggregation('sum', `histogram_sum(\n  ${rate}\n)`, state.groupBy)
  const count = buildAggregation('sum', `histogram_count(\n  ${rate}\n)`, state.groupBy)
  return `${sum}\n/\n${count}`
}

export function buildPercentile(state: PromqlBuilderState, selector: string, histogramKind: PromqlHistogramKind): string {
  if (histogramKind === 'classic') return buildClassicHistogramPercentile(state, selector)
  if (histogramKind === 'native') return buildNativeHistogramPercentile(state, selector)
  return ''
}

export function buildPromql(state: PromqlBuilderState, histogramKind: PromqlHistogramKind = 'unknown'): string {
  if (validatePromqlBuilder(state, histogramKind)) return ''
  const selector = buildSelector(state.metric, [...state.groupBy, ...state.filterBy], state.labelValues)
  if (state.calculation === 'percentile') return buildPercentile(state, selector, histogramKind)
  if (state.calculation === 'observation-rate') return histogramKind === 'native' ? buildNativeHistogramObservationRate(state, selector) : ''
  if (state.calculation === 'histogram-average') return histogramKind === 'native' ? buildNativeHistogramAverage(state, selector) : ''
  if (state.calculation === 'histogram-sum') return histogramKind === 'native' ? buildNativeHistogramSum(state, selector) : ''
  const expression = state.calculation === 'raw' ? selector : `${state.calculation}(${selector}[${state.window}])`
  return state.aggregation === 'none' ? expression : buildAggregation(state.aggregation, expression, state.groupBy)
}
