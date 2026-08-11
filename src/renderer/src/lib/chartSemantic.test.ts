import assert from 'node:assert/strict'
import test from 'node:test'
import { ChartAnimationPolicy, createChartFingerprint } from './chartSemantic.ts'
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
