/** Unit of the input values. Display scaling never changes query results. */
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

const timeUnits = [
  { label: 'ns', seconds: 1e-9 },
  { label: 'µs', seconds: 1e-6 },
  { label: 'ms', seconds: 1e-3 },
  { label: 's', seconds: 1 },
  { label: 'min', seconds: 60 },
  { label: 'h', seconds: 3600 },
] as const
const inputSeconds = { ms: 1e-3, s: 1, min: 60, h: 3600 }

export function formatDisplayValue(
  value: unknown,
  unit: DisplayUnit | undefined,
  formatNumber: (value: unknown) => string,
): string {
  const numeric =
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '')
  if (unit?.family !== 'time' || !numeric || !Number.isFinite(Number(value)))
    return formatNumber(value)

  const input = Number(value)
  if (input === 0) return `0 ${unit.unit}`
  // Compare in input units to avoid overflowing while converting large values.
  let index = 0
  for (let next = 1; next < timeUnits.length; next++) {
    const threshold = timeUnits[next].seconds / inputSeconds[unit.unit]
    if (Number(Math.abs(input / threshold).toPrecision(3)) < 1) break
    index = next
  }
  const selected = timeUnits[index]
  const scaled = input / (selected.seconds / inputSeconds[unit.unit])
  const rounded = Number(scaled.toPrecision(3))
  // Preserve sub-nanosecond values instead of rounding them to zero.
  const formatted =
    Math.abs(rounded) < 1 ? rounded.toString() : formatNumber(rounded)
  return `${formatted} ${selected.label}`
}
