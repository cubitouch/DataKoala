import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EDITOR_MIN, MIN_WINDOW_HEIGHT, RESULTS_MIN, SPLITTER_SIZE, TITLEBAR_HEIGHT,
  clampDimension, editorBounds, keyboardDimension, parseStoredDimension, sidebarBounds
} from './layoutDimensions.ts'

test('persisted dimensions accept finite numbers and reject invalid values', () => {
  assert.equal(parseStoredDimension('312.5', 240), 312.5)
  for (const value of [null, '', 'not-a-number', 'Infinity', '12px']) {
    assert.equal(parseStoredDimension(value, 240), 240)
  }
})

test('dimensions clamp at both bounds', () => {
  const bounds = { min: 180, max: 520 }
  assert.equal(clampDimension(100, bounds), 180)
  assert.equal(clampDimension(300, bounds), 300)
  assert.equal(clampDimension(900, bounds), 520)
})

test('keyboard resizing uses directional arrows and respects bounds', () => {
  assert.equal(keyboardDimension(200, 'ArrowRight', 'sidebar', { min: 180, max: 208 }), 208)
  assert.equal(keyboardDimension(200, 'ArrowLeft', 'sidebar', { min: 180, max: 520 }), 184)
  assert.equal(keyboardDimension(200, 'ArrowDown', 'editor', { min: 180, max: 400 }), 216)
  assert.equal(keyboardDimension(200, 'Enter', 'editor', { min: 180, max: 400 }), null)
})

test('the enforced minimum window retains both pane minimums', () => {
  const mainHeight = MIN_WINDOW_HEIGHT - TITLEBAR_HEIGHT
  assert.ok(editorBounds(mainHeight).max >= EDITOR_MIN)
  assert.ok(mainHeight >= EDITOR_MIN + SPLITTER_SIZE + RESULTS_MIN)
  assert.ok(sidebarBounds(1000).max >= 520)
})

test('bounds degrade to a stable minimum for unsupported tiny viewports', () => {
  assert.deepEqual(editorBounds(200), { min: EDITOR_MIN, max: 32 })
  assert.equal(clampDimension(400, editorBounds(200)), EDITOR_MIN)
  assert.equal(clampDimension(400, sidebarBounds(400)), 180)
})
