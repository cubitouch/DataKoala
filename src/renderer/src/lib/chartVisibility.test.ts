import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileSeriesVisibility } from './chartVisibility.ts'

test('unchanged visibility retains its object identity regardless of identity order', () => {
  const previous = { A: true, B: false }
  assert.equal(reconcileSeriesVisibility(previous, ['A', 'B']), previous)
  assert.equal(reconcileSeriesVisibility(previous, ['B', 'A']), previous)
})

test('added and removed series create state only when identities actually change', () => {
  const previous = { A: true, B: false }
  assert.deepEqual(reconcileSeriesVisibility(previous, ['A', 'B', 'C']), { A: true, B: false, C: true })
  assert.deepEqual(reconcileSeriesVisibility(previous, ['B']), { B: true })
})

test('hidden state survives compatible updates while an all-hidden set is normalized', () => {
  assert.deepEqual(reconcileSeriesVisibility({ A: false, B: true }, ['A', 'B', 'C']), { A: false, B: true, C: true })
  assert.deepEqual(reconcileSeriesVisibility({ A: false }, ['A']), { A: true })
  const visible = { A: true }
  assert.equal(reconcileSeriesVisibility(visible, ['A']), visible)
})
