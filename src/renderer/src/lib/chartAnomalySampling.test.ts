import { describe, expect, it } from 'vitest'
import { sampleChartSeries } from './chartAnomalySampling.ts'

describe('sampleChartSeries', () => {
  it('preserves a narrow spike and drop in a bounded sample', () => {
    const values = Array.from({ length: 320 }, () => 20)
    values[157] = 800
    values[212] = -40

    const sample = sampleChartSeries(
      'requests',
      values,
      values.map((_, index) => index),
    )

    expect(sample.points).toHaveLength(32)
    expect(sample.points).toContainEqual({ x: 157, y: 800 })
    expect(sample.points).toContainEqual({ x: 212, y: -40 })
    expect(sample.originalPointCount).toBe(320)
    expect(sample.validPointCount).toBe(320)
    expect(sample.sampleCoverage).toBe(0.1)
    expect(sample.samplingMethod).toBe('bucket-extrema')
  })

  it('retains a sustained level shift across chronological buckets', () => {
    const values = Array.from({ length: 320 }, (_, index) =>
      index < 160 ? 20 : 80,
    )
    const sample = sampleChartSeries(
      'requests',
      values,
      values.map((_, index) => index),
    )

    expect(sample.points.some((point) => point.x < 160 && point.y === 20)).toBe(
      true,
    )
    expect(sample.points.some((point) => point.x >= 160 && point.y === 80)).toBe(
      true,
    )
  })

  it('keeps every point when the series fits in the budget', () => {
    const sample = sampleChartSeries('requests', [2, null, 3], ['a', 'b', 'c'])
    expect(sample.points).toEqual([
      { x: 'a', y: 2 },
      { x: 'c', y: 3 },
    ])
    expect(sample.originalPointCount).toBe(3)
    expect(sample.validPointCount).toBe(2)
    expect(sample.sampleCoverage).toBe(1)
    expect(sample.samplingMethod).toBe('all-points')
  })
})
