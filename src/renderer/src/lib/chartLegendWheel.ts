import { CHART_LEGEND_RIGHT, CHART_LEGEND_WIDTH, CHART_NARROW_WIDTH } from './chartPresentation.ts'

export const LEGEND_WHEEL_DELTA_THRESHOLD = 80

export interface LegendWheelState {
  index: number
  accumulatedDelta: number
}

export function clampLegendScrollIndex(index: number, seriesCount: number): number {
  return Math.max(0, Math.min(Math.max(0, seriesCount - 1), index))
}

/** Converts wheel/trackpad movement into gradual item-sized legend steps. */
export function advanceLegendWheel(state: LegendWheelState, delta: number, seriesCount: number): LegendWheelState {
  if (seriesCount <= 1 || !Number.isFinite(delta) || delta === 0) return { index: clampLegendScrollIndex(state.index, seriesCount), accumulatedDelta: state.accumulatedDelta }
  let accumulatedDelta = state.accumulatedDelta + delta
  if (Math.abs(accumulatedDelta) < LEGEND_WHEEL_DELTA_THRESHOLD) return { index: clampLegendScrollIndex(state.index, seriesCount), accumulatedDelta }
  const direction = accumulatedDelta > 0 ? 1 : -1
  const index = clampLegendScrollIndex(state.index + direction, seriesCount)
  // One native event advances at most one item. Discarding excess prevents a
  // coarse wheel tick or momentum gesture from unexpectedly skipping entries.
  return { index, accumulatedDelta: 0 }
}

export function isPointerInVerticalLegend(clientX: number, clientY: number, bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): boolean {
  if (bounds.width <= CHART_NARROW_WIDTH) return false
  const x = clientX - bounds.left
  const y = clientY - bounds.top
  return x >= bounds.width - CHART_LEGEND_RIGHT - CHART_LEGEND_WIDTH && x <= bounds.width - CHART_LEGEND_RIGHT && y >= 0 && y <= bounds.height
}

interface LegendWheelDom {
  getBoundingClientRect(): DOMRect
  addEventListener(type: 'wheel', listener: (event: WheelEvent) => void, options: AddEventListenerOptions): void
  removeEventListener(type: 'wheel', listener: (event: WheelEvent) => void): void
}

export interface LegendWheelECharts {
  getDom(): LegendWheelDom
  dispatchAction(action: { type: 'legendScroll'; scrollDataIndex: number }): void
  on(event: 'legendscroll', handler: (params: unknown) => void): void
  off(event: 'legendscroll', handler: (params: unknown) => void): void
}

/** Owns wheel and native-pager synchronization without adding React render state. */
export class ChartLegendWheelLifecycle {
  private chart: LegendWheelECharts | null = null
  private seriesCount = 0
  private state: LegendWheelState = { index: 0, accumulatedDelta: 0 }

  private readonly onLegendScroll = (params: unknown) => {
    const scrollDataIndex = params && typeof params === 'object' && 'scrollDataIndex' in params ? params.scrollDataIndex : undefined
    if (typeof scrollDataIndex === 'number') this.state = { index: clampLegendScrollIndex(scrollDataIndex, this.seriesCount), accumulatedDelta: 0 }
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (!this.chart || this.seriesCount <= 1 || !isPointerInVerticalLegend(event.clientX, event.clientY, this.chart.getDom().getBoundingClientRect())) return
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.chart.getDom().getBoundingClientRect().height : 1
    const next = advanceLegendWheel(this.state, event.deltaY * unit, this.seriesCount)
    const changed = next.index !== this.state.index
    this.state = next
    if (changed) this.chart.dispatchAction({ type: 'legendScroll', scrollDataIndex: next.index })
  }

  setSeriesCount(seriesCount: number): void {
    this.seriesCount = Math.max(0, seriesCount)
    this.state = { index: clampLegendScrollIndex(this.state.index, this.seriesCount), accumulatedDelta: 0 }
  }

  attach(chart: LegendWheelECharts | null): void {
    if (chart === this.chart) return
    this.detach()
    this.chart = chart
    this.chart?.getDom().addEventListener('wheel', this.onWheel, { passive: false })
    this.chart?.on('legendscroll', this.onLegendScroll)
  }

  detach(): void {
    if (this.chart) {
      this.chart.getDom().removeEventListener('wheel', this.onWheel)
      this.chart.off('legendscroll', this.onLegendScroll)
    }
    this.chart = null
  }
}
