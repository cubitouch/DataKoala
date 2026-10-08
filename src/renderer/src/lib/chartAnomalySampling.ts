export const AI_ANOMALY_MAX_POINTS_PER_SERIES = 32

export interface SampledChartPoint {
  x: string | number
  y: number
}

export interface SampledChartSeries {
  name: string
  originalPointCount: number
  validPointCount: number
  sampleCoverage: number
  samplingMethod: 'all-points' | 'bucket-extrema'
  points: SampledChartPoint[]
}

function chartXValue(value: unknown): string | number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string'
      ? value.slice(0, 160)
      : String(value ?? '').slice(0, 160)
}

/**
 * Keeps all points for short series. Longer series retain the first, minimum,
 * maximum, and last valid point from each chronological bucket so narrow spikes,
 * drops, and sustained shifts remain visible within the fixed payload bound.
 */
export function sampleChartSeries(
  name: string,
  values: readonly (number | null)[],
  xValues: readonly unknown[],
  maxPoints = AI_ANOMALY_MAX_POINTS_PER_SERIES,
): SampledChartSeries {
  const validIndices = values.flatMap((value, index) =>
    typeof value === 'number' && Number.isFinite(value) ? [index] : [],
  )
  const selectedIndices = new Set<number>()
  const useBuckets = validIndices.length > maxPoints
  if (!useBuckets) {
    for (const index of validIndices) selectedIndices.add(index)
  } else {
    const bucketCount = Math.floor(maxPoints / 4)
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = Math.floor((bucket * validIndices.length) / bucketCount)
      const end = Math.floor(((bucket + 1) * validIndices.length) / bucketCount)
      const indices = validIndices.slice(start, end)
      if (!indices.length) continue
      let minimum = indices[0]
      let maximum = indices[0]
      for (const index of indices.slice(1)) {
        if ((values[index] as number) < (values[minimum] as number))
          minimum = index
        if ((values[index] as number) > (values[maximum] as number))
          maximum = index
      }
      selectedIndices.add(indices[0])
      selectedIndices.add(minimum)
      selectedIndices.add(maximum)
      selectedIndices.add(indices[indices.length - 1])
    }
  }
  const indices = [...selectedIndices].sort((a, b) => a - b)
  const points = indices.map((index) => ({
    x: chartXValue(xValues[index]),
    y: values[index] as number,
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
  }
}
