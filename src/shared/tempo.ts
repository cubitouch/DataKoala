export interface TempoQueryRequest {
  start: string
  end: string
  includeStatus?: boolean
  /** Growing upstream result window used by progressive trace loading. */
  limit?: number
  /** Trace IDs whose already-resolved status should not trigger another trace lookup. */
  skipStatusTraceIds?: string[]
}
