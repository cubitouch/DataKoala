export type ChartRevision = symbol

/** Creates an immutable candidate without changing committed readiness state. */
export function createChartRevision(): ChartRevision {
  return Symbol('chart revision')
}

/** Tracks which committed ECharts option may make chart actions available. */
export class ChartReadinessController {
  private revision: ChartRevision | null = null

  commitRevision(revision: ChartRevision): void {
    this.revision = revision
  }

  finishRevision(revision: ChartRevision): boolean {
    return this.isCurrentRevision(revision)
  }

  isCurrentRevision(revision: ChartRevision): boolean {
    return revision === this.revision
  }
}
