import { parser } from '@grafana/lezer-logql'
import type { LokiBuilderState, LokiLabelMatcher } from './loki.ts'

const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/
export function isValidLokiLabelName(value: string): boolean { return LABEL_NAME.test(value) }
export function escapeLogqlString(value: string): string {
  return JSON.stringify(value).replace(/\u2028|\u2029/g, (character) => character === '\u2028' ? '\\u2028' : '\\u2029')
}
export function buildLokiQuery(state: LokiBuilderState): string {
  if (!state.labelMatchers.length) throw new Error('Add at least one indexed label matcher.')
  const matchers = state.labelMatchers.map(({ label, operator, value }) => {
    if (!isValidLokiLabelName(label)) throw new Error(`Invalid Loki label name: ${label}`)
    return `${label}${operator}${escapeLogqlString(value)}`
  })
  let query = `{${matchers.join(', ')}}`
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
export function selectorWithoutMatcher(matchers: LokiLabelMatcher[], excludedLabel: string): string | undefined {
  const remaining = matchers.filter(({ label }) => label !== excludedLabel)
  if (!remaining.length) return undefined
  return `{${remaining.map(({ label, operator, value }) => {
    if (!isValidLokiLabelName(label)) throw new Error(`Invalid Loki label name: ${label}`)
    return `${label}${operator}${escapeLogqlString(value)}`
  }).join(', ')}}`
}

