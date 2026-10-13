import { AI_LIMITS } from '../../../shared/ai.ts'
import type {
  AiAnomalyAnalysis,
  AiAnomalyAnalysisRequest,
} from '../../../shared/ai.ts'
import { AiError, record, requestId, textValue } from './primitives.ts'

const onlyKeys = (value: Record<string, unknown>, keys: string[]) => {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new AiError('validation', 'Invalid AI anomaly analysis input.')
}
const finite = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new AiError('validation', 'Invalid AI anomaly analysis input.')
  return value
}
const anomalyX = (value: unknown): string | number =>
  typeof value === 'string' ? textValue(value, 160) : finite(value)

export function anomalyAnalysisRequest(
  value: unknown,
): AiAnomalyAnalysisRequest {
  const input = record(value)
  onlyKeys(input, ['requestId', 'chart'])
  const chart = record(input.chart)
  onlyKeys(chart, ['chartType', 'xColumn', 'valueColumn', 'series'])
  if (
    !Array.isArray(chart.series) ||
    chart.series.length < 1 ||
    chart.series.length > AI_LIMITS.anomalySeries
  )
    throw new AiError('validation', 'Invalid AI anomaly chart context.')
  const chartType = textValue(chart.chartType, 32)
  if (chartType !== 'line')
    throw new AiError(
      'validation',
      'AI anomaly analysis only supports line charts.',
    )
  const series = chart.series.map((raw) => {
    const item = record(raw)
    onlyKeys(item, [
      'name',
      'originalPointCount',
      'validPointCount',
      'sampleCoverage',
      'samplingMethod',
      'points',
    ])
    if (
      !Array.isArray(item.points) ||
      item.points.length < AI_LIMITS.anomalyMinimumPointsPerSeries ||
      item.points.length > AI_LIMITS.anomalyPointsPerSeries
    )
      throw new AiError(
        'validation',
        'AI anomaly analysis needs at least three numeric points per series.',
      )
    const originalPointCount = finite(item.originalPointCount)
    const validPointCount = finite(item.validPointCount)
    const sampleCoverage = finite(item.sampleCoverage)
    if (
      !Number.isInteger(originalPointCount) ||
      !Number.isInteger(validPointCount) ||
      validPointCount < item.points.length ||
      originalPointCount < validPointCount ||
      sampleCoverage <= 0 ||
      sampleCoverage > 1 ||
      Math.abs(sampleCoverage - item.points.length / validPointCount) >
        0.000001 ||
      !['all-points', 'bucket-extrema'].includes(String(item.samplingMethod))
    )
      throw new AiError('validation', 'Invalid AI anomaly chart context.')
    return {
      name: textValue(item.name, 256),
      originalPointCount,
      validPointCount,
      sampleCoverage,
      samplingMethod: item.samplingMethod as 'all-points' | 'bucket-extrema',
      points: item.points.map((rawPoint) => {
        const point = record(rawPoint)
        onlyKeys(point, ['x', 'y'])
        return { x: anomalyX(point.x), y: finite(point.y) }
      }),
    }
  })
  return {
    requestId: requestId(input.requestId),
    chart: {
      chartType,
      xColumn: textValue(chart.xColumn, 256),
      valueColumn: textValue(chart.valueColumn, 256),
      series,
    },
  }
}
export function anomalyAnalysis(
  value: unknown,
  request: AiAnomalyAnalysisRequest,
): AiAnomalyAnalysis {
  try {
    const input = record(value)
    onlyKeys(input, ['summary', 'anomalies', 'limitations', 'followUps'])
    const strings = (items: unknown) => {
      if (!Array.isArray(items) || items.length > 8) throw new Error()
      return items.map((item) => textValue(item, AI_LIMITS.anomalyText))
    }
    if (
      !Array.isArray(input.anomalies) ||
      input.anomalies.length > AI_LIMITS.anomalyCount
    )
      throw new Error()
    const seen = new Set<string>()
    const anomalies = input.anomalies.map((raw) => {
      const item = record(raw)
      onlyKeys(item, [
        'seriesIndex',
        'pointIndex',
        'title',
        'reason',
        'severity',
      ])
      const seriesIndex = finite(item.seriesIndex)
      const pointIndex = finite(item.pointIndex)
      if (
        !Number.isInteger(seriesIndex) ||
        seriesIndex < 0 ||
        seriesIndex >= request.chart.series.length ||
        !Number.isInteger(pointIndex) ||
        pointIndex < 0 ||
        pointIndex >= request.chart.series[seriesIndex].points.length
      )
        throw new Error()
      const reference = `${seriesIndex}:${pointIndex}`
      if (seen.has(reference)) throw new Error()
      seen.add(reference)
      const severity =
        item.severity == null ? undefined : textValue(item.severity, 16)
      if (
        severity !== undefined &&
        !['low', 'medium', 'high'].includes(severity)
      )
        throw new Error()
      return {
        seriesIndex,
        pointIndex,
        title: textValue(item.title, AI_LIMITS.anomalyTitle),
        reason: textValue(item.reason, AI_LIMITS.anomalyReason),
        ...(severity
          ? { severity: severity as 'low' | 'medium' | 'high' }
          : {}),
      }
    })
    return {
      summary: textValue(input.summary, AI_LIMITS.anomalySummary),
      anomalies,
      limitations: strings(input.limitations),
      followUps: strings(input.followUps),
    }
  } catch {
    throw new AiError(
      'invalid-response',
      'The model returned an invalid anomaly analysis. Try again or choose another model.',
    )
  }
}
