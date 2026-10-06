/** Unit of the input values, applied without conversion or query changes. */
export type DisplayUnit =
  { family: 'number' } | { family: 'time'; unit: 'ms' | 's' | 'min' | 'h' }

export function isDisplayUnit(value: unknown): value is DisplayUnit {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.family === 'number' ||
    (candidate.family === 'time' &&
      typeof candidate.unit === 'string' &&
      ['ms', 's', 'min', 'h'].includes(candidate.unit))
  )
}

export function formatDisplayValue(
  value: unknown,
  unit: DisplayUnit | undefined,
  formatNumber: (value: unknown) => string,
): string {
  const formatted = formatNumber(value)
  const numeric =
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '')
  return unit?.family === 'time' && numeric && Number.isFinite(Number(value))
    ? `${formatted} ${unit.unit}`
    : formatted
}
