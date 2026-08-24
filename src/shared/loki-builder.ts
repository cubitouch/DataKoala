import { parser } from '@grafana/lezer-logql'
import type { LokiBuilderState, LokiLabelMatcher } from './loki.ts'

const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/
export function isValidLokiLabelName(value: string): boolean { return LABEL_NAME.test(value) }
export function escapeLogqlString(value: string): string {
  return JSON.stringify(value).replace(/\u2028|\u2029/g, (character) => character === '\u2028' ? '\\u2028' : '\\u2029')
}
export function escapeLogqlRegexValue(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function matcherExpression({ label, operator, value, values }: LokiLabelMatcher): string | null {
  const unique = [...new Set((values ?? [value]).filter((item) => item !== ''))]
  if (!label.trim() || !unique.length) return null
  if (!isValidLokiLabelName(label)) throw new Error(`Invalid Loki label name: ${label}`)
  if (values && unique.length > 1) return `${label}=~${escapeLogqlString(`^(?:${unique.map(escapeLogqlRegexValue).join('|')})$`)}`
  if (values) return `${label}=${escapeLogqlString(unique[0])}`
  return `${label}${operator}${escapeLogqlString(value)}`
}
export function buildLokiQuery(state: LokiBuilderState): string {
  const complete = state.labelMatchers.map(matcherExpression).filter((value): value is string => Boolean(value))
  if (!complete.length) throw new Error('Choose a value for at least one indexed label.')
  let query = `{${complete.join(', ')}}`
  for (const filter of state.lineFilters) query += ` ${filter.operator} ${escapeLogqlString(filter.value)}`
  for (const stage of state.parsers) {
    query += ` | ${stage.kind}`
    if (stage.expression !== undefined && stage.expression !== '') query += ` ${escapeLogqlString(stage.expression)}`
  }
  for (const filter of state.fieldFilters) {
    if (!isValidLokiLabelName(filter.field)) throw new Error(`Invalid Loki field name: ${filter.field}`)
    query += ` | ${filter.field}${filter.operator}${escapeLogqlString(filter.value)}`
  }
  assertValidLogql(query)
  return query
}
export function assertValidLogql(query: string): void {
  const tree = parser.parse(query)
  const cursor = tree.cursor()
  do { if (cursor.type.isError) throw new Error('Generated LogQL is not parser-valid.') } while (cursor.next())
}
export function logqlResultKind(query: string): 'logs' | 'metrics' {
  const tree = parser.parse(query)
  let kind: 'logs' | 'metrics' | undefined
  const cursor = tree.cursor()
  do {
    if (cursor.type.isError) throw new Error('Invalid LogQL expression.')
    if (cursor.name === 'MetricExpr') kind = 'metrics'
    else if (cursor.name === 'LogExpr' && !kind) kind = 'logs'
  } while (cursor.next())
  if (!kind) throw new Error('LogQL expression must produce logs or metrics.')
  return kind
}
export function selectorWithoutMatcher(matchers: LokiLabelMatcher[], excludedLabel: string): string | undefined {
  const remaining = matchers.filter(({ label }) => label !== excludedLabel).map(matcherExpression).filter((value): value is string => Boolean(value))
  if (!remaining.length) return undefined
  return `{${remaining.join(', ')}}`
}
