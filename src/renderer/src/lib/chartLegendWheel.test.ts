import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceLegendWheel, ChartLegendWheelLifecycle, clampLegendScrollIndex, isPointerInVerticalLegend, type LegendWheelECharts } from './chartLegendWheel.ts'

test('legend wheel advances, reverses, accumulates small deltas, and clamps', () => {
  assert.deepEqual(advanceLegendWheel({ index: 2, accumulatedDelta: 0 }, 80, 6), { index: 3, accumulatedDelta: 0 })
  assert.deepEqual(advanceLegendWheel({ index: 2, accumulatedDelta: 0 }, -80, 6), { index: 1, accumulatedDelta: 0 })
  const partial = advanceLegendWheel({ index: 0, accumulatedDelta: 0 }, 30, 6)
  assert.deepEqual(partial, { index: 0, accumulatedDelta: 30 })
  assert.deepEqual(advanceLegendWheel(partial, 50, 6), { index: 1, accumulatedDelta: 0 })
  assert.equal(advanceLegendWheel({ index: 1, accumulatedDelta: 0 }, 400, 6).index, 2)
  assert.equal(advanceLegendWheel({ index: 0, accumulatedDelta: 0 }, -80, 6).index, 0)
  assert.equal(advanceLegendWheel({ index: 5, accumulatedDelta: 0 }, 80, 6).index, 5)
  assert.equal(clampLegendScrollIndex(8, 3), 2)
  assert.equal(clampLegendScrollIndex(2, 0), 0)
})

test('legend hit testing ignores the plot, application exterior, and narrow layout', () => {
  const wide = { left: 10, top: 20, width: 800, height: 400 }
  assert.equal(isPointerInVerticalLegend(700, 200, wide), true)
  assert.equal(isPointerInVerticalLegend(500, 200, wide), false)
  assert.equal(isPointerInVerticalLegend(700, 500, wide), false)
  assert.equal(isPointerInVerticalLegend(590, 200, { ...wide, width: 600 }), false)
})

test('lifecycle dispatches item scrolling only over a wide vertical legend and tracks native paging', () => {
  let bounds = { left: 0, top: 0, width: 800, height: 400 } as DOMRect
  let wheel: ((event: WheelEvent) => void) | undefined
  let nativeScroll: ((params: unknown) => void) | undefined
  const actions: Array<{ type: 'legendScroll'; scrollDataIndex: number }> = []
  const dom = {
    getBoundingClientRect: () => bounds,
    addEventListener: (_type: 'wheel', listener: (event: WheelEvent) => void) => { wheel = listener },
    removeEventListener: () => { wheel = undefined }
  }
  const chart: LegendWheelECharts = {
    getDom: () => dom,
    dispatchAction: (action) => actions.push(action),
    on: (_event, handler) => { nativeScroll = handler },
    off: () => { nativeScroll = undefined }
  }
  const lifecycle = new ChartLegendWheelLifecycle()
  lifecycle.setSeriesCount(10)
  lifecycle.attach(chart)
  const emit = (clientX: number, deltaY: number) => {
    let prevented = false
    wheel?.({ clientX, clientY: 100, deltaY, deltaMode: 0, preventDefault: () => { prevented = true } } as WheelEvent)
    return prevented
  }

  assert.equal(emit(700, 80), true)
  assert.deepEqual(actions.at(-1), { type: 'legendScroll', scrollDataIndex: 1 })
  assert.equal(emit(500, 80), false)
  assert.equal(actions.length, 1)

  nativeScroll?.({ scrollDataIndex: 7 })
  lifecycle.setSeriesCount(3)
  assert.equal(emit(700, -80), true)
  assert.deepEqual(actions.at(-1), { type: 'legendScroll', scrollDataIndex: 1 })

  bounds = { ...bounds, width: 600 } as DOMRect
  assert.equal(emit(550, 80), false)
  lifecycle.detach()
  assert.equal(wheel, undefined)
})
