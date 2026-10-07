import type { BuilderQueryState } from '@store/useStore'
import { SEVEN_DAYS } from './builderTimeRange.ts'

export interface SeriesProbeFingerprintInput {
  profileId: string
  builder: BuilderQueryState
  /** Complete proposed configuration; used only to invalidate stale work. */
  seriesColumns: string[]
  /** @deprecated Result filters no longer scope source cardinality. */
  filters?: unknown[]
}

export function seriesProbeFingerprint(
  input: SeriesProbeFingerprintInput,
): string {
  return JSON.stringify({
    profileId: input.profileId,
    table: input.builder.table,
    timeColumn: input.builder.timeColumn,
    timeBucket: input.builder.timeBucket,
    seriesColumns: input.seriesColumns,
    timeRange: input.builder.timeRange ?? SEVEN_DAYS,
  })
}

export function addedSeriesColumns(
  previous: string[],
  candidate: string[],
): string[] {
  const existing = new Set(previous)
  return candidate.filter((column) => !existing.has(column))
}

/** Ensures an async response can only approve the latest candidate/fingerprint. */
export class SeriesCardinalityProbeGuard {
  private revision = 0
  private currentFingerprint: string | null = null

  begin(fingerprint: string): { revision: number } {
    this.currentFingerprint = fingerprint
    return {
      revision: ++this.revision,
    }
  }

  isCurrent(revision: number, fingerprint: string): boolean {
    return revision === this.revision && fingerprint === this.currentFingerprint
  }

  approve(revision: number, fingerprint: string): boolean {
    if (!this.isCurrent(revision, fingerprint)) return false
    return true
  }

  invalidate(): void {
    this.currentFingerprint = null
    this.revision++
  }
}

export function selectionAfterCardinalityProbe(
  previous: string[],
  candidate: string[],
  exceedsHardLimit: boolean,
): string[] {
  return exceedsHardLimit ? previous : candidate
}

/** True only for an unchanged selection or deletion that preserves column order. */
export function isSeriesColumnRemoval(
  previous: string[],
  candidate: string[],
): boolean {
  let cursor = 0
  for (const column of candidate) {
    while (cursor < previous.length && previous[cursor] !== column) cursor++
    if (cursor === previous.length) return false
    cursor++
  }
  return candidate.length <= previous.length
}
