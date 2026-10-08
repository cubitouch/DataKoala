import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { AiAnomalyAnalysis } from '@shared/ai'
import { resolveAiAnomalies } from './chartAnomalyMapping.ts'
import type { SampledChartSeries } from './chartAnomalySampling.ts'

const sample: SampledChartSeries = {
  name: 'Requests',
  originalPointCount: 4,
  validPointCount: 3,
  sampleCoverage: 2 / 3,
  samplingMethod: 'bucket-extrema',
  points: [
    { x: 'same', y: 8, originalIndex: 2 },
    { x: 'last', y: 10, originalIndex: 3 },
  ],
}
const analysis: AiAnomalyAnalysis = {
  summary: 'Two candidates.',
  anomalies: [
    { seriesIndex: 0, pointIndex: 0, title: 'Candidate', reason: 'High.' },
    { seriesIndex: 0, pointIndex: 1, title: 'Second', reason: 'Higher.' },
  ],
  limitations: [],
  followUps: [],
}

test('maps AI sample references to exact original rows even when X values repeat', () => {
  const result = resolveAiAnomalies(
    analysis,
    [{ chartSeriesIndex: 0, sample }],
    [{ name: 'Requests', data: [1, null, 8, 10], missing: [false, true, false, false] }],
    ['same', 'same', 'same', 'last'],
    {},
  )
  assert.deepEqual(
    result.map(({ originalIndex, x, y }) => ({ originalIndex, x, y })),
    [
      { originalIndex: 2, x: 'same', y: 8 },
      { originalIndex: 3, x: 'last', y: 10 },
    ],
  )
})

test('drops stale, missing, hidden, misassociated and non-plottable log references', () => {
  const changed = resolveAiAnomalies(
    analysis,
    [{ chartSeriesIndex: 0, sample }],
    [{ name: 'Requests', data: [1, null, 9, 10], missing: [false, true, false, false] }],
    ['a', 'b', 'same', 'last'],
    {},
  )
  assert.deepEqual(changed.map(({ originalIndex }) => originalIndex), [3])

  const hidden = resolveAiAnomalies(
    analysis,
    [{ chartSeriesIndex: 0, sample }],
    [{ name: 'Requests', data: [1, null, 8, 10] }],
    ['a', 'b', 'same', 'last'],
    { Requests: false },
  )
  assert.deepEqual(hidden, [])

  const logInvalid = resolveAiAnomalies(
    { ...analysis, anomalies: [analysis.anomalies[0]] },
    [{ chartSeriesIndex: 0, sample: { ...sample, points: [{ ...sample.points[0], y: -8 }] } }],
    [{ name: 'Requests', data: [1, null, -8, 10] }],
    ['a', 'b', 'same', 'last'],
    {},
    'log',
  )
  assert.deepEqual(logInvalid, [])

  const wrongSeries = resolveAiAnomalies(
    analysis,
    [{ chartSeriesIndex: 0, sample }],
    [{ name: 'Other', data: [1, null, 8, 10] }],
    ['a', 'b', 'same', 'last'],
    {},
  )
  assert.deepEqual(wrongSeries, [])
})
