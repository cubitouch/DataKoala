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
export interface LokiMetricResult extends QueryResult { resultKind: 'metrics' }
export type LokiQueryResult = LokiLogResult | LokiMetricResult
export interface LokiDatasourceOption { uid: string; name: string; type: string }
export interface LokiMetadataRequest { start: string; end: string; selector?: string }

export type LokiLabelOperator = '=' | '!=' | '=~' | '!~'
export type LokiLineOperator = '|=' | '!=' | '|~' | '!~'
export interface LokiLabelMatcher { label: string; operator: LokiLabelOperator; value: string; values?: string[] }
export interface LokiLineFilter { operator: LokiLineOperator; value: string }
export interface LokiFieldFilter { field: string; operator: LokiLabelOperator; value: string }
export interface LokiParserStage { kind: 'json' | 'logfmt' | 'pattern' | 'regexp'; expression?: string }
export interface LokiBuilderState {
  labelMatchers: LokiLabelMatcher[]
  lineFilters: LokiLineFilter[]
  parsers: LokiParserStage[]
  fieldFilters: LokiFieldFilter[]
}
export const DEFAULT_LOKI_BUILDER: LokiBuilderState = { labelMatchers: [], lineFilters: [], parsers: [], fieldFilters: [] }
