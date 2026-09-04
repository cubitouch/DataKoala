import { parser } from '@grafana/lezer-logql'
import type { LokiBuilderState, LokiLabelMatcher } from './loki.ts'

const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/
export function isValidLokiLabelName(value: string): boolean { return LABEL_NAME.test(value) }
export function escapeLogqlString(value: string): string {
  return JSON.stringify(value).replace(/\u2028|\u2029/g, (character) => character === '\u2028' ? '\\u2028' : '\\u2029')
}
export function escapeLogqlRegexValue(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
type RenderedMatcher = { expression: string; anchorsSelector: boolean; safeForMetadata: boolean }
export interface BuildLokiQueryOptions { fallbackMatcher?: LokiLabelMatcher }

function regexMetadataSafety(value: string): { safe: boolean; matchesEmpty: boolean } {
  // Loki uses RE2. Treat constructs whose semantics cannot be verified with the
  // JavaScript regexp engine conservatively instead of risking invalid metadata.
  if (/\\[1-9]|\(\?[=!<]/.test(value)) return { safe: false, matchesEmpty: true }
  try { return { safe: true, matchesEmpty: new RegExp(value).test('') } } catch { return { safe: false, matchesEmpty: true } }
}

function renderedMatcher({ label, operator, value, values }: LokiLabelMatcher): RenderedMatcher | null {
  const unique = [...new Set((values ?? [value]).filter((item) => item !== ''))]
  if (!label.trim() || !unique.length) return null
  if (!isValidLokiLabelName(label)) throw new Error(`Invalid Loki label name: ${label}`)
  if (values && unique.length > 1) return { expression: `${label}=~${escapeLogqlString(`^(?:${unique.map(escapeLogqlRegexValue).join('|')})$`)}`, anchorsSelector: true, safeForMetadata: true }
  if (values) return { expression: `${label}=${escapeLogqlString(unique[0])}`, anchorsSelector: true, safeForMetadata: true }
  const regexSafety = operator === '=~' || operator === '!~' ? regexMetadataSafety(value) : undefined
  return {
    expression: `${label}${operator}${escapeLogqlString(value)}`,
    anchorsSelector: operator === '=' || (operator === '=~' && Boolean(regexSafety?.safe) && !regexSafety?.matchesEmpty),
    safeForMetadata: regexSafety?.safe ?? true
  }
}
function matcherExpression(matcher: LokiLabelMatcher): string | null {
  return renderedMatcher(matcher)?.expression ?? null
}
export function buildLokiQuery(state: LokiBuilderState, options: BuildLokiQueryOptions = {}): string {
  const userMatchers = state.labelMatchers.map(matcherExpression).filter((value): value is string => Boolean(value))
  let selectorMatchers = userMatchers
  if (!selectorMatchers.length && options.fallbackMatcher) {
    const fallback = renderedMatcher(options.fallbackMatcher)
    if (!fallback?.anchorsSelector) throw new Error('The fallback Loki selector must contain a positive matcher that cannot match empty values.')
    selectorMatchers = [fallback.expression]
  }
  if (!selectorMatchers.length) throw new Error('Choose a value for at least one indexed label or provide a safe fallback selector.')
  let query = `{${selectorMatchers.join(', ')}}`
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
  const remaining = matchers.filter(({ label }) => label !== excludedLabel).map(renderedMatcher).filter((value): value is RenderedMatcher => Boolean(value?.safeForMetadata))
  if (!remaining.some(({ anchorsSelector }) => anchorsSelector)) return undefined
  return `{${remaining.map(({ expression }) => expression).join(', ')}}`
}
