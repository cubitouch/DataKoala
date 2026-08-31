import assert from 'node:assert/strict'
import test from 'node:test'
import { isPrometheusStepSafe, prometheusAutoStep } from './prometheusResolution.ts'

const bounds = (seconds: number) => ({ start: new Date(0).toISOString(), end: new Date(seconds * 1_000).toISOString() })

test('automatic Prometheus resolution rounds up to friendly intervals', () => {
  assert.equal(prometheusAutoStep(bounds(3_600)), '15s')
  assert.equal(prometheusAutoStep(bounds(6 * 3_600)), '30s')
  assert.equal(prometheusAutoStep(bounds(24 * 3_600)), '2m')
  assert.equal(prometheusAutoStep(bounds(7 * 86_400)), '10m')
  assert.equal(prometheusAutoStep(bounds(30 * 86_400)), '1h')
  assert.equal(prometheusAutoStep(bounds(90 * 86_400)), '2h')
})

test('automatic resolution handles ranges beyond the fixed progression', () => {
  assert.equal(prometheusAutoStep(bounds(2_000 * 86_400)), '2d')
})

test('manual resolution safety includes endpoints and stays below the provider budget', () => {
  assert.equal(isPrometheusStepSafe(bounds(3_999 * 15), '15s'), true)
  assert.equal(isPrometheusStepSafe(bounds(4_000 * 15), '15s'), false)
})
