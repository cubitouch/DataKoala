import type { BuilderQueryState } from '../store/useStore'
import { SERIES_STATS_ACCEPT_THRESHOLD, SERIES_STATS_REJECT_THRESHOLD, type SeriesStatisticsResult } from '../../../shared/chartLimits.ts'
import { SEVEN_DAYS } from './builderTimeRange.ts'

export interface SeriesProbeFingerprintInput {
  profileId: string
  builder: BuilderQueryState
  /** Complete proposed configuration; order affects Builder's display label. */
  seriesColumns: string[]
  /** @deprecated Result filters no longer scope source cardinality. */
  filters?: unknown[]
}

export function seriesProbeFingerprint(input: SeriesProbeFingerprintInput): string {
  return JSON.stringify({
    profileId: input.profileId,
    table: input.builder.table,
    timeColumn: input.builder.timeColumn,
    timeBucket: input.builder.timeBucket,
    seriesColumns: input.seriesColumns,
    timeRange: input.builder.timeRange ?? SEVEN_DAYS
  })
}

export function seriesStatisticsFingerprint(input: Pick<SeriesProbeFingerprintInput, 'profileId' | 'builder' | 'seriesColumns'>): string {
  return JSON.stringify({ profileId: input.profileId, table: input.builder.table, column: input.seriesColumns[0] ?? null })
}

export type SeriesStatisticsDecision = 'accept' | 'reject' | 'probe'
export function decideFromSeriesStatistics(
  statistics: SeriesStatisticsResult,
  hasActiveScope: boolean,
  seriesColumnCount: number
): SeriesStatisticsDecision {
  if (hasActiveScope || seriesColumnCount !== 1 || !statistics.available || statistics.estimatedDistinct === undefined ||
    !Number.isFinite(statistics.estimatedDistinct) || statistics.estimatedDistinct < 0) return 'probe'
  if (statistics.estimatedDistinct <= SERIES_STATS_ACCEPT_THRESHOLD) return 'accept'
  if (statistics.estimatedDistinct > SERIES_STATS_REJECT_THRESHOLD) return 'reject'
  return 'probe'
}

/** Ensures an async response can only approve the latest candidate/fingerprint. */
export class SeriesCardinalityProbeGuard {
  private revision = 0
  private currentFingerprint: string | null = null
  private readonly successful = new Set<string>()

  begin(fingerprint: string): { revision: number; cached: boolean } {
    this.currentFingerprint = fingerprint
    return { revision: ++this.revision, cached: this.successful.has(fingerprint) }
  }

  isCurrent(revision: number, fingerprint: string): boolean {
    return revision === this.revision && fingerprint === this.currentFingerprint
  }

  approve(revision: number, fingerprint: string): boolean {
    if (!this.isCurrent(revision, fingerprint)) return false
    this.successful.add(fingerprint)
    return true
  }

  invalidate(): void {
    this.currentFingerprint = null
    this.revision++
  }
}

export function selectionAfterCardinalityProbe(previous: string[], candidate: string[], exceedsHardLimit: boolean): string[] {
  return exceedsHardLimit ? previous : candidate
}

/** True only for an unchanged selection or deletion that preserves column order. */
export function isSeriesColumnRemoval(previous: string[], candidate: string[]): boolean {
  let cursor = 0
  for (const column of candidate) {
    while (cursor < previous.length && previous[cursor] !== column) cursor++
    if (cursor === previous.length) return false
    cursor++
  }
  return candidate.length <= previous.length
}
