export type PromqlCalculation = 'raw' | 'rate' | 'increase' | 'percentile'
export type PromqlAggregation = 'none' | 'sum' | 'avg' | 'min' | 'max'
export type PromqlWindow = '1m' | '5m' | '10m' | '15m' | '30m' | '1h'
export type PromqlQuantile = 0.5 | 0.75 | 0.9 | 0.95 | 0.99 | 0.999
export interface PromqlBuilderFilter { label: string; values: string[] }
export interface PromqlBuilderState {
  metric: string
  filters: PromqlBuilderFilter[]
  groupBy: string[]
  calculation: PromqlCalculation
  aggregation: PromqlAggregation
  window: PromqlWindow
  percentile: PromqlQuantile
}

export const DEFAULT_PROMQL_BUILDER: PromqlBuilderState = { metric: '', filters: [], groupBy: [], calculation: 'raw', aggregation: 'none', window: '5m', percentile: 0.95 }

export function escapePromqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

export function escapePromqlRegexLiteral(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

export function validatePromqlBuilder(state: PromqlBuilderState): string | null {
  if (!state.metric.trim()) return 'Select a metric to generate PromQL.'
  if (state.filters.some((filter) => !filter.label.trim() || filter.values.length === 0)) return 'Choose at least one value for every selected label.'
  if (state.calculation === 'percentile' && !state.metric.endsWith('_bucket')) return 'Percentile requires a classic histogram _bucket metric.'
  if (state.groupBy.length && state.aggregation === 'none' && state.calculation !== 'percentile') return 'Group by requires an aggregation.'
  if (state.percentile <= 0 || state.percentile >= 1) return 'Percentile must be between 0 and 1.'
  return null
}

export function buildSelector(metric: string, filters: PromqlBuilderFilter[]): string {
  const matchers = filters.map(({ label, values }) => {
    if (values.length === 1) return `${label}="${escapePromqlString(values[0])}"`
    const regex = values.map(escapePromqlRegexLiteral).join('|')
    return `${label}=~"${escapePromqlString(regex)}"`
  })
  return `${metric}${matchers.length ? `{${matchers.join(',')}}` : ''}`
}

export function buildAggregation(operator: 'sum' | 'avg' | 'min' | 'max', expression: string, groupBy: string[]): string {
  const groups = [...new Set(groupBy.filter(Boolean))]
  return groups.length ? `${operator} by (${groups.join(', ')}) (\n  ${expression}\n)` : `${operator}(${expression})`
}

export function buildPercentile(state: PromqlBuilderState, selector = buildSelector(state.metric, state.filters)): string {
  const groups = [...new Set([...state.groupBy.filter((label) => label !== 'le'), 'le'])]
  return `histogram_quantile(\n  ${state.percentile},\n  sum by (${groups.join(', ')}) (\n    rate(${selector}[${state.window}])\n  )\n)`
}

export function buildPromql(state: PromqlBuilderState): string {
  if (validatePromqlBuilder(state)) return ''
  const selector = buildSelector(state.metric, state.filters)
  if (state.calculation === 'percentile') return buildPercentile(state, selector)
  const expression = state.calculation === 'raw' ? selector : `${state.calculation}(${selector}[${state.window}])`
  return state.aggregation === 'none' ? expression : buildAggregation(state.aggregation, expression, state.groupBy)
}
