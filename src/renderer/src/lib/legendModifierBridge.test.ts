import assert from 'node:assert/strict'
import test from 'node:test'
import { hasLegendModifier, LegendModifierBridge } from './legendModifierBridge.ts'
import { isolateSeries, reconcileSeriesVisibility, showAllSeries } from './chartVisibility.ts'

test('captures real ZRender native modifier payloads for exactly one legend event', () => {
  for (const key of ['shiftKey', 'ctrlKey', 'metaKey'] as const) {
    const bridge = new LegendModifierBridge()
    bridge.capture({ event: { [key]: true } })
    assert.equal(hasLegendModifier(bridge.consume()), true)
    assert.equal(hasLegendModifier(bridge.consume()), false)
  }
})

test('ordinary pointer-down clears stale modifier state', () => {
  const bridge = new LegendModifierBridge()
  bridge.capture({ event: { metaKey: true } })
  bridge.capture({ event: {} })
  assert.equal(hasLegendModifier(bridge.consume()), false)
})

test('normal legend selection toggles one while modifier isolation restores cleanly', () => {
  const ids = ['a', 'b', 'c']
  assert.deepEqual(reconcileSeriesVisibility({ a: true, b: false, c: true }, ids), { a: true, b: false, c: true })
  const isolated = isolateSeries(showAllSeries(ids), ids, 'b')
  assert.deepEqual(isolated, { a: false, b: true, c: false })
  assert.deepEqual(isolateSeries(isolated, ids, 'b'), showAllSeries(ids))
})
