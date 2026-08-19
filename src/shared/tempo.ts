export interface TempoQueryRequest {
  start: string
  end: string
  /** Optional explicit status enrichment. Exhaustive UI searches leave this off to avoid one trace-body fetch per result. */
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
  /** New or refreshed trace summaries discovered by the latest provider query. */
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
