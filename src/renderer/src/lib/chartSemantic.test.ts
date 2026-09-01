import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartAnimationPolicy, createChartFingerprint, semanticChartCounts } from './chartSemantic.ts'
import { ChartReadinessController, createChartRevision } from './chartReadiness.ts'
import type { PivotedResult, VisualizationConfiguration } from './resultVisualization.ts'

const configuration: VisualizationConfiguration = { view: 'line', xColumn: 'x', valueColumn: 'value', seriesColumn: 'series', aggregation: 'sum', valueAxisScale: 'linear' }
const chart: PivotedResult = { renderable: true, labels: ['one'], xValues: [1], seriesValues: ['A'], series: [{ name: 'A', data: [2] }] }

test('fingerprints semantic chart inputs and excludes lifecycle UI state', () => {
  const first = createChartFingerprint(chart, configuration, { A: true })
  assert.equal(createChartFingerprint({ ...chart }, { ...configuration }, { A: true }), first)
  // Hover, readiness, capture and callback identities are intentionally not inputs.
  assert.equal(createChartFingerprint(chart, configuration, { A: true }), first)
  assert.notEqual(createChartFingerprint({ ...chart, series: [{ name: 'A', data: [3] }] }, configuration, { A: true }), first)
  assert.notEqual(createChartFingerprint(chart, { ...configuration, view: 'bar' }, { A: true }), first)
  assert.notEqual(createChartFingerprint(chart, { ...configuration, aggregation: 'average' }, { A: true }), first)
  assert.notEqual(createChartFingerprint(chart, configuration, { A: false }), first)
})

test('render candidates remain animated until their fingerprint is committed', () => {
  const policy = new ChartAnimationPolicy()
  assert.equal(policy.shouldAnimate('result-a'), true)
  assert.equal(policy.shouldAnimate('result-a'), true) // repeated / Strict Mode render
  assert.equal(policy.shouldAnimate('result-a'), true) // an abandoned render consumed nothing
  policy.commit('result-a')
  assert.equal(policy.shouldAnimate('result-a'), false)
  assert.equal(policy.shouldAnimate('result-b'), true)
})

test('a stale ECharts completion cannot commit or suppress the newer revision', () => {
  const policy = new ChartAnimationPolicy()
  const readiness = new ChartReadinessController()
  const oldRevision = createChartRevision()
  const newRevision = createChartRevision()
  readiness.commitRevision(oldRevision)
  readiness.commitRevision(newRevision)

  if (readiness.finishRevision(oldRevision)) policy.commit('result-a')
  assert.equal(policy.shouldAnimate('result-b'), true)
  if (readiness.finishRevision(newRevision)) policy.commit('result-b')
  assert.equal(policy.shouldAnimate('result-b'), false)
})

test('semantic chart counts exclude time-series points outside the final axis domain', () => {
  const report = semanticChartCounts({
    xAxis: { type: 'time', min: Date.UTC(2026, 6, 1), max: Date.UTC(2026, 7, 31) },
    series: [{ name: 'orders', data: [['2025-01-01T00:00:00.000Z', 12], ['2025-02-01T00:00:00.000Z', 14]] }]
  })
  assert.deepEqual(report, { series: 1, items: 0 })
})

test('semantic chart counts include current visible points and exclude null values', () => {
  const report = semanticChartCounts({
    xAxis: { type: 'time', min: Date.UTC(2026, 6, 1), max: Date.UTC(2026, 7, 31) },
    series: [{ name: 'orders', data: [['2026-07-01T00:00:00.000Z', 12], ['2026-08-01T00:00:00.000Z', 14], ['2026-08-02T00:00:00.000Z', null]] }]
  })
  assert.deepEqual(report, { series: 1, items: 2 })
})
