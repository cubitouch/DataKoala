export interface TooltipRow { identity: string; name: string; value: number | null; color?: string; hovered?: boolean }
export interface TooltipSummary { rows: TooltipRow[]; omitted: number; zeroOmitted: number }
export function summarizeTooltipRows(rows: readonly TooltipRow[], hoveredIdentity?: string, limit = 12): TooltipSummary {
  const many = rows.length > limit
  let zeroOmitted = 0
  const candidates = rows.filter((row) => {
    const omit = many && row.value === 0 && row.identity !== hoveredIdentity
    if (omit) zeroOmitted++
    return !omit
  }).map((row) => ({ ...row, hovered: row.identity === hoveredIdentity }))
  const hoveredIndex = candidates.findIndex((row) => row.hovered)
  const visible = candidates.slice(0, limit)
  // Axis tooltips can cap dozens of rows. Always retain the actual hovered
  // series, replacing the final summary row rather than changing order.
  if (hoveredIndex >= limit && limit > 0) visible[limit - 1] = candidates[hoveredIndex]
  return { rows: visible, zeroOmitted, omitted: candidates.length - visible.length + zeroOmitted }
}
