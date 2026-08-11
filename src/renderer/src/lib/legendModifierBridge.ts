export interface LegendModifierState { shift: boolean; ctrl: boolean; meta: boolean }
const NONE: LegendModifierState = { shift: false, ctrl: false, meta: false }

/** Bridges ZRender's native pointer payload to ECharts' separate legend event. */
export class LegendModifierBridge {
  private pending: LegendModifierState = NONE

  capture(event: unknown): void {
    const source = event && typeof event === 'object' && 'event' in event
      ? (event as { event?: unknown }).event
      : event
    const native = source && typeof source === 'object' ? source as Record<string, unknown> : {}
    this.pending = { shift: native.shiftKey === true, ctrl: native.ctrlKey === true, meta: native.metaKey === true }
  }

  consume(): LegendModifierState {
    const result = this.pending
    this.pending = NONE
    return result
  }

  clear(): void { this.pending = NONE }
}

export function hasLegendModifier(state: LegendModifierState): boolean {
  return state.shift || state.ctrl || state.meta
}
