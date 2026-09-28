import type { QueryResult } from './types.ts'

export type LokiResultKind = 'logs' | 'metrics'
export interface LokiQueryRequest {
  expression: string
  start: string
  end: string
  step: string
  limit: number
}
export interface LokiLogRow {
  [key: string]: unknown
  id: string
  timestampNs: string
  timestampMs: number
  line: string
  labels: Record<string, string>
  structuredMetadata: Record<string, string>
  parsedFields: Record<string, unknown>
  severity: string
  traceId?: string
  spanId?: string
}
export interface LokiLogResult extends QueryResult {
  resultKind: 'logs'
  logRows: LokiLogRow[]
}

function stableLogOrderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableLogOrderValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableLogOrderValue(item)]))
  return value
}

export function sortLokiLogRowsNewestFirst(rows: LokiLogRow[]): LokiLogRow[] {
  return rows
    .map((row, index) => ({
      row,
      index,
      timestampNs: BigInt(row.timestampNs),
      tieBreakKey: JSON.stringify(stableLogOrderValue({ line: row.line, labels: row.labels, structuredMetadata: row.structuredMetadata, parsedFields: row.parsedFields })) ?? ''
    }))
    .sort((left, right) => {
      if (left.timestampNs !== right.timestampNs) return left.timestampNs > right.timestampNs ? -1 : 1
      return left.tieBreakKey.localeCompare(right.tieBreakKey) || left.index - right.index
    })
    .map(({ row }) => row)
}
export interface LokiMetricResult extends QueryResult { resultKind: 'metrics' }
export type LokiQueryResult = LokiLogResult | LokiMetricResult
export interface LokiDatasourceOption { uid: string; name: string; type: string }
export interface LokiMetadataRequest { start: string; end: string; selector?: string }

export type LokiLabelOperator = '=' | '!=' | '=~' | '!~'
export type LokiLineOperator = '|=' | '!=' | '|~' | '!~'
export interface LokiLabelMatcher { label: string; operator: LokiLabelOperator; value: string; values?: string[] }
export interface LokiLineFilter { operator: LokiLineOperator; value: string }
export interface LokiFieldFilter { field: string; operator: LokiLabelOperator; value: string }
export type LokiParserKind = 'json' | 'logfmt' | 'pattern' | 'regexp'
export interface LokiParserStage { kind: LokiParserKind; expression?: string }
export type LokiFilterSource = 'label' | 'structured-metadata' | 'parsed-field'
export interface LokiBuilderState {
  labelMatchers: LokiLabelMatcher[]
  lineFilters: LokiLineFilter[]
  parsers: LokiParserStage[]
  fieldFilters: LokiFieldFilter[]
}
export const DEFAULT_LOKI_BUILDER: LokiBuilderState = { labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }
