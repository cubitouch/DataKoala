export const PROMETHEUS_AUTO_TARGET_POINTS = 1_200
export const PROMETHEUS_SAFE_POINT_LIMIT = 4_000
export const PROMETHEUS_MANUAL_STEPS = ['15s', '30s', '1m', '2m', '5m', '10m', '15m', '30m', '1h', '2h', '6h', '12h', '1d'] as const
export type PrometheusStep = 'auto' | typeof PROMETHEUS_MANUAL_STEPS[number]

const FRIENDLY_STEPS = [15, 30, 60, 120, 300, 600, 900, 1_800, 3_600, 7_200, 21_600, 43_200, 86_400] as const

export function prometheusRangeSeconds(bounds: { start: string; end: string }): number {
  return Math.max(0, (Date.parse(bounds.end) - Date.parse(bounds.start)) / 1_000)
}

export function prometheusAutoStep(bounds: { start: string; end: string }, targetPoints = PROMETHEUS_AUTO_TARGET_POINTS): string {
  const minimum = Math.ceil(prometheusRangeSeconds(bounds) / targetPoints)
  const friendly = FRIENDLY_STEPS.find((seconds) => seconds >= minimum)
  if (friendly) return formatStep(friendly)
  return `${Math.ceil(minimum / 86_400)}d`
}

export function prometheusStepSeconds(step: string): number | null {
  const match = /^(\d+)(s|m|h|d)$/.exec(step)
  if (!match) return null
  return Number(match[1]) * ({ s: 1, m: 60, h: 3_600, d: 86_400 }[match[2]] ?? 0)
}

export function effectivePrometheusStep(bounds: { start: string; end: string }, selected: PrometheusStep): string {
  return selected === 'auto' ? prometheusAutoStep(bounds) : selected
}

export function isPrometheusStepSafe(bounds: { start: string; end: string }, step: string): boolean {
  const seconds = prometheusStepSeconds(step)
  return seconds !== null && Math.ceil(prometheusRangeSeconds(bounds) / seconds) + 1 <= PROMETHEUS_SAFE_POINT_LIMIT
}

function formatStep(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}
