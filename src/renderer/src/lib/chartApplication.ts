import type { ChartRevision } from './chartReadiness.ts'

export type ChartRevisionOrigin = 'query-result' | 'view' | 'configuration' | 'series-visibility'
export interface ChartCandidate<Option> { revision: ChartRevision; fingerprint: string; option: Option; origin: ChartRevisionOrigin }
export interface AppliedChart<Option> extends ChartCandidate<Option> { token: number }

/** Latest-wins coordinator. Scheduling is supplied by React so this stays deterministic in tests. */
export class ChartApplicationController<Option> {
  private pending: ChartCandidate<Option> | null = null
  private applied: AppliedChart<Option> | null = null
  private completed: AppliedChart<Option> | null = null
  private superseded = new Set<ChartRevision>()
  private nextToken = 0

  request(candidate: ChartCandidate<Option>): void {
    if (this.pending) this.superseded.add(this.pending.revision)
    if (this.applied && this.completed?.token !== this.applied.token) this.superseded.add(this.applied.revision)
    this.pending = candidate
  }
  applyPending(): AppliedChart<Option> | null {
    if (!this.pending) return null
    this.applied = { ...this.pending, token: ++this.nextToken }
    this.pending = null
    return this.applied
  }
  finish(token: number): AppliedChart<Option> | null {
    if (this.applied?.token !== token) return null
    this.completed = this.applied
    return this.completed
  }
  getPending(): ChartCandidate<Option> | null { return this.pending }
  getApplied(): AppliedChart<Option> | null { return this.applied }
  getCompleted(): AppliedChart<Option> | null { return this.completed }
  isSuperseded(revision: ChartRevision): boolean { return this.superseded.has(revision) }
}
