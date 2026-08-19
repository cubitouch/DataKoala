export interface TempoQueryRequest {
  start: string
  end: string
  /** Optional explicit status enrichment. Exhaustive UI searches leave this off to avoid one trace-body fetch per result. */
  includeStatus?: boolean
}
