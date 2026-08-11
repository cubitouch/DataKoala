import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartEventBridgeLifecycle, type ZRenderLike } from './chartEventBridgeLifecycle.ts'
import { hasLegendModifier, LegendModifierBridge } from './legendModifierBridge.ts'

class FakeZr implements ZRenderLike {
  handlers = new Map<string, Set<(event: unknown) => void>>()
  on(event: string, handler: (event: unknown) => void) { const set = this.handlers.get(event) ?? new Set(); set.add(handler); this.handlers.set(event, set) }
  off(event: string, handler: (event: unknown) => void) { this.handlers.get(event)?.delete(handler) }
  emit(event: string, value: unknown = {}) { this.handlers.get(event)?.forEach((handler) => handler(value)) }
  count() { return [...this.handlers.values()].reduce((total, set) => total + set.size, 0) }
}

test('attaches when identities predate chart mount and never duplicates listeners', () => {
  const modifiers = new LegendModifierBridge(); const zr = new FakeZr()
  const lifecycle = new ChartEventBridgeLifecycle(modifiers, () => {})
  lifecycle.attach(null) // Table view, while semantic identities already exist.
  lifecycle.attach({ getZr: () => zr }) // Table -> Line.
  lifecycle.attach({ getZr: () => zr }) // configuration update on the same chart.
  assert.equal(zr.count(), 2)
  zr.emit('mousedown', { event: { metaKey: true } })
  assert.equal(hasLegendModifier(modifiers.consume()), true)
})

test('replacing, hiding, and unmounting charts clean up the old instance', () => {
  const modifiers = new LegendModifierBridge(); const first = new FakeZr(); const second = new FakeZr(); let globalOut = 0
  const lifecycle = new ChartEventBridgeLifecycle(modifiers, () => globalOut++)
  lifecycle.attach({ getZr: () => first }); lifecycle.attach({ getZr: () => second })
  assert.equal(first.count(), 0); assert.equal(second.count(), 2)
  second.emit('globalout'); assert.equal(globalOut, 1)
  lifecycle.attach(null) // Line/Bar -> Table or unmount.
  assert.equal(second.count(), 0)
})
