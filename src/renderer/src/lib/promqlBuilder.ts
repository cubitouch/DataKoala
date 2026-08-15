export type PromqlCalculation = 'raw' | 'rate' | 'increase' | 'sum' | 'avg' | 'min' | 'max'
export type PromqlLabelOperator = '=' | '!=' | '=~' | '!~'
export type PromqlWindow = '1m' | '5m' | '10m' | '15m' | '30m' | '1h'

export interface PromqlFilter { id: string; label: string; operator: PromqlLabelOperator; value: string }
export interface PromqlBuilderState {
  metric: string
  filters: PromqlFilter[]
  groupBy: string[]
  calculation: PromqlCalculation
  window: PromqlWindow
}

export const DEFAULT_PROMQL_BUILDER: PromqlBuilderState = { metric: '', filters: [], groupBy: [], calculation: 'raw', window: '5m' }

export function escapePromqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

export function validatePromqlBuilder(state: PromqlBuilderState): string | null {
  if (!state.metric.trim()) return 'Select a metric to generate PromQL.'
  for (const filter of state.filters) {
    if (Boolean(filter.label.trim()) !== Boolean(filter.value)) return 'Each filter needs both a label and a value.'
  }
  return null
}

export function buildPromql(state: PromqlBuilderState): string {
  if (validatePromqlBuilder(state)) return ''
  const matchers = state.filters
    .filter((filter) => filter.label && filter.value)
    .map((filter) => `${filter.label}${filter.operator}"${escapePromqlString(filter.value)}"`)
  const selector = `${state.metric}${matchers.length ? `{${matchers.join(',')}}` : ''}`
  const groups = [...new Set(state.groupBy.filter(Boolean))]
  if (state.calculation === 'raw') return selector
  if (state.calculation === 'rate' || state.calculation === 'increase') {
    const range = `${state.calculation}(${selector}[${state.window}])`
    return groups.length ? `sum by (${groups.join(', ')}) (\n  ${range}\n)` : range
  }
  return groups.length
    ? `${state.calculation} by (${groups.join(', ')}) (${selector})`
    : `${state.calculation}(${selector})`
}
