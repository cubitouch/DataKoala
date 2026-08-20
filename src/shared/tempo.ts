export interface TempoQueryRequest {
  start: string
  end: string
  /** Root-span status is enriched by default in batched TraceQL lookups; set false for summary-only callers. */
  includeStatus?: boolean
  /** Optional quick-search result budget. When set, Tempo returns up to this many traces without exhaustive pagination. */
  sampleSize?: number
}

export interface TempoSearchProgress {
  provider: 'tempo'
  /** Exact selected-period duration already proven complete by unsaturated search chunks. */
  coveredMs: number
  /** Exact user-selected period duration, not the second-aligned provider envelope. */
  totalMs: number
  completedChunks: number
  /** Current queued chunk count. This can grow when a saturated chunk is split. */
  pendingChunks: number
  queriesCompleted: number
  tracesFound: number
  /** New or refreshed trace summaries discovered by search or root-status enrichment. */
  rows: Record<string, unknown>[]
}

export type TempoSearchProgressListener = (progress: TempoSearchProgress) => void

/** Main-process-only context. Do not send the callback across Electron IPC. */
export interface TempoQueryContext extends TempoQueryRequest {
  onProgress?: TempoSearchProgressListener
}

export interface TempoSearchProgressEnvelope {
  requestId: string
  progress: TempoSearchProgress
}
