const normal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumSignificantDigits: 3,
})

/** Presentation only: preserve the existing formatting below one thousand. */
export function formatCompactNumber(value: number): string {
  return Math.abs(value) < 1000
    ? normal.format(value)
    : compact.format(value).replace('K', 'k')
}
