import { AI_LIMITS } from '@shared/ai'

export const AI_ANOMALY_MAX_POINTS_PER_SERIES = AI_LIMITS.anomalyPointsPerSeries
export const AI_ANOMALY_MAX_BUCKET_SUMMARIES =
  AI_LIMITS.anomalyBucketSummariesPerSeries

export interface SampledChartPoint {
  x: string | number
  y: number
  originalIndex: number
}

export interface AiAnomalyBucketSummary {
  startX: string | number
  endX: string | number
  count: number
  min: number
  max: number
  mean: number
}

export interface SampledChartSeries {
  name: string
  originalPointCount: number
  validPointCount: number
  sampleCoverage: number
  samplingMethod: 'all-points' | 'bucket-extrema'
  points: SampledChartPoint[]
  bucketSummaries: AiAnomalyBucketSummary[]
}

function chartXValue(value: unknown): string | number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string'
      ? value.slice(0, 160)
      : String(value ?? '').slice(0, 160)
}

function summarizeBuckets(
  validIndices: readonly number[],
  values: readonly (number | null)[],
  xValues: readonly unknown[],
): AiAnomalyBucketSummary[] {
  if (!validIndices.length) return []
  const bucketCount = Math.min(
    AI_ANOMALY_MAX_BUCKET_SUMMARIES,
    Math.ceil(validIndices.length / 16),
  )
  return Array.from({ length: bucketCount }, (_, bucket) => {
    const start = Math.floor((bucket * validIndices.length) / bucketCount)
    const end = Math.floor(((bucket + 1) * validIndices.length) / bucketCount)
    const firstIndex = validIndices[start]
    const lastIndex = validIndices[end - 1]
    let min = values[firstIndex] as number
    let max = min
    let mean = min
    let count = 1
    for (let position = start + 1; position < end; position += 1) {
      const value = values[validIndices[position]] as number
      count += 1
      min = Math.min(min, value)
      max = Math.max(max, value)
      mean += value / count - mean / count
    }
    return {
      startX: chartXValue(xValues[firstIndex]),
      endX: chartXValue(xValues[lastIndex]),
      count,
      min,
      max,
      mean: Math.min(max, Math.max(min, mean)),
    }
  })
}

/**
 * Keeps all valid points for short series. Longer series retain five
 * observations per chronological bucket: its endpoints, local extrema, and
 * midpoint. Summaries are computed from every valid observation before the
 * sample is reduced.
 */
export function sampleChartSeries(
  name: string,
  values: readonly (number | null)[],
  xValues: readonly unknown[],
  maxPoints = AI_ANOMALY_MAX_POINTS_PER_SERIES,
): SampledChartSeries {
  const requestedBudget = Number.isFinite(maxPoints)
    ? Math.floor(maxPoints)
    : AI_ANOMALY_MAX_POINTS_PER_SERIES
  const budget = Math.min(
    AI_ANOMALY_MAX_POINTS_PER_SERIES,
    Math.max(3, requestedBudget),
  )
  const validIndices: number[] = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (typeof value === 'number' && Number.isFinite(value))
      validIndices.push(index)
  }

  const selectedIndices = new Set<number>()
  const useBuckets = validIndices.length > budget
  if (!useBuckets) {
    for (const index of validIndices) selectedIndices.add(index)
  } else {
    const bucketCount = Math.floor(budget / 5)
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = Math.floor((bucket * validIndices.length) / bucketCount)
      const end = Math.floor(((bucket + 1) * validIndices.length) / bucketCount)
      const first = validIndices[start]
      const last = validIndices[end - 1]
      const middle = validIndices[Math.floor((start + end - 1) / 2)]
      let minimum = first
      let maximum = first
      for (let position = start + 1; position < end; position += 1) {
        const index = validIndices[position]
        if ((values[index] as number) < (values[minimum] as number))
          minimum = index
        if ((values[index] as number) > (values[maximum] as number))
          maximum = index
      }
      selectedIndices.add(first)
      selectedIndices.add(minimum)
      selectedIndices.add(middle)
      selectedIndices.add(maximum)
      selectedIndices.add(last)
    }
  }
  const indices = [...selectedIndices].sort((a, b) => a - b)
  const points = indices.map((index) => ({
    x: chartXValue(xValues[index]),
    y: values[index] as number,
    originalIndex: index,
  }))
  return {
    name,
    originalPointCount: values.length,
    validPointCount: validIndices.length,
    sampleCoverage: validIndices.length
      ? points.length / validIndices.length
      : 0,
    samplingMethod: useBuckets ? 'bucket-extrema' : 'all-points',
    points,
    bucketSummaries: summarizeBuckets(validIndices, values, xValues),
  }
}
