const normalNumber = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})
const compactNumber = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 3,
})
const scales = [
  { divisor: 1e3, suffix: 'k' },
  { divisor: 1e6, suffix: 'M' },
  { divisor: 1e9, suffix: 'B' },
  { divisor: 1e12, suffix: 'T' },
] as const

/** Display-only formatting for constrained visualization surfaces, never raw table cells. */
export function formatCompactNumber(value: unknown): string {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isFinite(numeric)) return value == null ? '—' : String(value)
  const magnitude = Math.abs(numeric)
  if (magnitude < 1000) return normalNumber.format(numeric)
  let index = 0
  while (index < scales.length - 1 && magnitude >= scales[index + 1].divisor)
    index++
  // Rounding near a boundary must promote 999.9k to 1M, never render 1,000k.
  if (
    index < scales.length - 1 &&
    Number((magnitude / scales[index].divisor).toPrecision(3)) >= 1000
  )
    index++
  const scale = scales[index]
  return `${compactNumber.format(numeric / scale.divisor)}${scale.suffix}`
}
