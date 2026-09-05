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

type FrameScheduler = (callback: FrameRequestCallback) => number
type FrameCanceller = (handle: number) => void

/**
 * Accepts a revision only after ECharts has had two paint opportunities and the
 * caller confirms that the instance contains the option for that revision.
 * The controller check prevents delayed callbacks from completing a newer chart.
 */
export function finishChartRevisionAfterPaint(
  readiness: ChartReadinessController,
  revision: ChartRevision,
  isApplied: () => boolean,
  onFinished: (revision: ChartRevision) => void,
  scheduleFrame: FrameScheduler = requestAnimationFrame,
  cancelFrame: FrameCanceller = cancelAnimationFrame
): () => void {
  let handle = scheduleFrame(() => {
    handle = scheduleFrame(() => {
      if (isApplied() && readiness.finishRevision(revision)) onFinished(revision)
    })
  })
  return () => cancelFrame(handle)
}
