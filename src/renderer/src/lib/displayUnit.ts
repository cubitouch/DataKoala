/** Presentation metadata: values stay in their selected input unit, without conversion. */
export type DisplayUnit =
  { family: 'number' } | { family: 'time'; unit: 'ms' | 's' | 'min' | 'h' }

export function normalizeDisplayUnit(value: unknown): DisplayUnit {
  if (
    typeof value === 'object' &&
    value !== null &&
    'family' in value &&
    value.family === 'time' &&
    'unit' in value
  ) {
    const unit = value.unit
    if (unit === 'ms' || unit === 's' || unit === 'min' || unit === 'h')
      return { family: 'time', unit }
  }
  return { family: 'number' }
}

export function formatDisplayUnit(
  value: unknown,
  formatted: string,
  unit?: DisplayUnit,
): string {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN
  return unit?.family === 'time' && Number.isFinite(numeric)
    ? `${formatted} ${unit.unit}`
    : formatted
}
