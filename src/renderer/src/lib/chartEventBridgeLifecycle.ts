import { LegendModifierBridge } from './legendModifierBridge.ts'

export interface ZRenderLike {
  on(event: 'mousedown' | 'globalout', handler: (event: unknown) => void): void
  off(event: 'mousedown' | 'globalout', handler: (event: unknown) => void): void
}
export interface EChartsLike { getZr(): ZRenderLike }

/** Owns exactly one ZRender subscription set, independent of when series arrive. */
export class ChartEventBridgeLifecycle {
  private zr: ZRenderLike | null = null
  private readonly modifiers: LegendModifierBridge
  private readonly onGlobalOut: () => void
  private readonly capture = (event: unknown) => this.modifiers.capture(event)
  private readonly clear = () => { this.modifiers.clear(); this.onGlobalOut() }

  constructor(modifiers: LegendModifierBridge, onGlobalOut: () => void) {
    this.modifiers = modifiers
    this.onGlobalOut = onGlobalOut
  }

  attach(instance: EChartsLike | null): void {
    const next = instance?.getZr() ?? null
    if (next === this.zr) return
    this.detach()
    this.zr = next
    this.zr?.on('mousedown', this.capture)
    this.zr?.on('globalout', this.clear)
  }

  detach(): void {
    if (this.zr) {
      this.zr.off('mousedown', this.capture)
      this.zr.off('globalout', this.clear)
    }
    this.zr = null
    this.modifiers.clear()
  }
}
