export function traceText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

export function traceNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function traceDurationLabel(milliseconds: number): string {
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`
  if (milliseconds >= 1) return `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)}ms`
  return `${Math.max(0, milliseconds * 1_000).toFixed(0)}µs`
}

export function tracePeriodLabel(milliseconds: number): string {
  if (milliseconds >= 3_600_000) return `${(milliseconds / 3_600_000).toFixed(milliseconds % 3_600_000 === 0 ? 0 : 1)}h`
  if (milliseconds >= 60_000) return `${(milliseconds / 60_000).toFixed(milliseconds % 60_000 === 0 ? 0 : 1)}m`
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds % 1_000 === 0 ? 0 : 1)}s`
  return `${Math.max(0, Math.round(milliseconds))}ms`
}

export function traceDateTimeLabel(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(milliseconds))
}
