import assert from 'node:assert/strict'
import test from 'node:test'
import { validateVisualReport } from './assertions.mjs'

const populated = { selector: '[data-chart]', description: 'fixture chart', minSeries: 1, minItems: 1 }
const current = { type: 'line', finished: true, series: 1, items: 4, fingerprint: 'current', expectedFingerprint: 'current' }

test('populated semantic report passes', () => {
  assert.doesNotThrow(() => validateVisualReport('populated.png', populated, current))
})

test('zero rendered items fails when populated data is expected', () => {
  assert.throws(() => validateVisualReport('empty-by-accident.png', populated, { type: 'line', finished: true, series: 1, items: 0 }), /actual items=0/)
})

test('zero rendered items passes when emptiness is explicit', () => {
  assert.doesNotThrow(() => validateVisualReport('intentional-empty.png', { ...populated, minSeries: undefined, minItems: undefined, expectEmpty: true }, { type: 'line', finished: true, series: 0, items: 0 }))
})

test('Tempo data outside its visible range fails the populated scatter expectation', () => {
  const timestamps = [Date.UTC(2026, 7, 19, 15), Date.UTC(2026, 7, 19, 16)]
  const range = [Date.UTC(2026, 7, 20, 15), Date.UTC(2026, 7, 20, 16)]
  const visible = timestamps.filter((value) => value >= range[0] && value <= range[1]).length
  assert.throws(() => validateVisualReport('tempo-trace-scatter.png', { selector: '[data-scatter]', description: 'Tempo scatter', minSeries: 1, minItems: 1 }, { type: 'scatter', finished: true, series: 1, items: visible, range: range.join('..') }), /actual items=0/)
})

test('a non-empty series with zero points in the effective domain fails', () => {
  assert.throws(() => validateVisualReport('outside-domain.png', populated, { ...current, items: 0, rawItems: 4 }), /actual items=0/)
})

test('a chart rendered for the previous configuration fails', () => {
  assert.throws(() => validateVisualReport('stale.png', populated, { ...current, fingerprint: 'previous' }), /stale chart/)
})

test('the current configuration with visible points passes', () => {
  const expectation = { ...populated, expectedConfig: { view: 'bar', x: 'series' } }
  assert.doesNotThrow(() => validateVisualReport('current.png', expectation, { ...current, type: 'bar', config: { view: 'bar', x: 'series', resultRevision: 7 } }))
})
