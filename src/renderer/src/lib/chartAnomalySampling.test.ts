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

    expect(sample.points.length).toBeLessThanOrEqual(256)
    expect(sample.points).toContainEqual({ x: 157, y: 800, originalIndex: 157 })
    expect(sample.points).toContainEqual({ x: 212, y: -40, originalIndex: 212 })
    expect(sample.originalPointCount).toBe(320)
    expect(sample.validPointCount).toBe(320)
    expect(sample.sampleCoverage).toBe(sample.points.length / 320)
    expect(sample.samplingMethod).toBe('bucket-extrema')
    expect(
      sample.bucketSummaries.reduce((count, bucket) => count + bucket.count, 0),
    ).toBe(320)
    expect(sample.bucketSummaries).toHaveLength(16)
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

    expect(
      sample.points.some(
        (point) =>
          typeof point.x === 'number' && point.x < 160 && point.y === 20,
      ),
    ).toBe(true)
    expect(
      sample.points.some(
        (point) =>
          typeof point.x === 'number' && point.x >= 160 && point.y === 80,
      ),
    ).toBe(true)
  })

  it('keeps every point when the series fits in the budget', () => {
    const sample = sampleChartSeries('requests', [2, null, 3], ['a', 'b', 'c'])
    expect(sample.points).toEqual([
      { x: 'a', y: 2, originalIndex: 0 },
      { x: 'c', y: 3, originalIndex: 2 },
    ])
    expect(sample.originalPointCount).toBe(3)
    expect(sample.validPointCount).toBe(2)
    expect(sample.sampleCoverage).toBe(1)
    expect(sample.samplingMethod).toBe('all-points')
    expect(sample.bucketSummaries).toEqual([
      { startX: 'a', endX: 'c', count: 2, min: 2, max: 3, mean: 2.5 },
    ])
  })

  it('retains exactly 256 valid points without downsampling', () => {
    const values = Array.from({ length: 256 }, (_, index) => index)
    const sample = sampleChartSeries('requests', values, values)
    expect(sample.points).toHaveLength(256)
    expect(sample.points[0].originalIndex).toBe(0)
    expect(sample.points.at(-1)?.originalIndex).toBe(255)
    expect(sample.samplingMethod).toBe('all-points')
  })

  it('bounds thousands of observations and retains endpoints and chronology', () => {
    const values = Array.from({ length: 10_000 }, (_, index) => index % 31)
    values[2_345] = 10_000
    values[7_654] = -10_000
    const sample = sampleChartSeries(
      'requests',
      values,
      values.map((_, i) => i),
    )
    const indices = sample.points.map((point) => point.originalIndex)
    expect(sample.points.length).toBeLessThanOrEqual(256)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(9_999)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(indices).toContain(2_345)
    expect(indices).toContain(7_654)
    expect(sample.bucketSummaries).toHaveLength(16)
    expect(
      sample.bucketSummaries.reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(10_000)
  })

  it('summarizes valid sparse observations only and keeps means finite and bounded', () => {
    const values: Array<number | null> = [
      1,
      null,
      Number.NaN,
      4,
      Number.POSITIVE_INFINITY,
      7,
    ]
    const sample = sampleChartSeries('sparse', values, [
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ])
    expect(sample.validPointCount).toBe(3)
    expect(sample.points.map((point) => point.originalIndex)).toEqual([0, 3, 5])
    expect(sample.bucketSummaries).toEqual([
      { startX: 'a', endX: 'f', count: 3, min: 1, max: 7, mean: 4 },
    ])
  })

  it('retains representative midpoint observations across chronological buckets', () => {
    const values = Array.from({ length: 2_000 }, (_, index) =>
      index < 1_000 ? 10 : 40,
    )
    const sample = sampleChartSeries(
      'shift',
      values,
      values.map((_, i) => i),
    )
    expect(
      sample.points.some(
        (point) => point.originalIndex < 1_000 && point.y === 10,
      ),
    ).toBe(true)
    expect(
      sample.points.some(
        (point) => point.originalIndex >= 1_000 && point.y === 40,
      ),
    ).toBe(true)
    expect(sample.points.length).toBeLessThanOrEqual(256)
  })
})
