export interface ZRenderLike {
  on(event: 'globalout', handler: (event: unknown) => void): void
  off(event: 'globalout', handler: (event: unknown) => void): void
}
export interface EChartsLike {
  getZr(): ZRenderLike
}

/** Owns exactly one ZRender subscription set, independent of when series arrive. */
export class ChartEventBridgeLifecycle {
  private zr: ZRenderLike | null = null
  private readonly onGlobalOut: () => void
  private readonly clear = () => this.onGlobalOut()

  constructor(onGlobalOut: () => void) {
    this.onGlobalOut = onGlobalOut
  }

  attach(instance: EChartsLike | null): void {
    const next = instance?.getZr() ?? null
    if (next === this.zr) return
    this.detach()
    this.zr = next
    this.zr?.on('globalout', this.clear)
  }

  detach(): void {
    if (this.zr) {
      this.zr.off('globalout', this.clear)
    }
    this.zr = null
  }
}
