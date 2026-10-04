export interface QueryDiffLine {
  kind: 'context' | 'remove' | 'add'
  text: string
}
const lines = (text: string) => (text ? text.split('\n') : [])
/** Line-level LCS with a bounded work budget; large edits fall back to a simple replacement. */
export function queryDiff(before: string, after: string): QueryDiffLine[] {
  const oldLines = lines(before),
    newLines = lines(after)
  let prefix = 0,
    suffix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] ===
      newLines[newLines.length - suffix - 1]
  )
    suffix++
  const a = oldLines.slice(prefix, oldLines.length - suffix),
    b = newLines.slice(prefix, newLines.length - suffix)
  const result: QueryDiffLine[] = oldLines
    .slice(0, prefix)
    .map((text) => ({ kind: 'context', text }))
  if (a.length * b.length > 250000) {
    result.push(
      ...a.map((text) => ({ kind: 'remove' as const, text })),
      ...b.map((text) => ({ kind: 'add' as const, text })),
    )
  } else {
    const width = b.length + 1,
      grid = new Uint32Array((a.length + 1) * width)
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        grid[i * width + j] =
          a[i] === b[j]
            ? 1 + grid[(i + 1) * width + j + 1]
            : Math.max(grid[(i + 1) * width + j], grid[i * width + j + 1])
    let i = 0,
      j = 0
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        result.push({ kind: 'context', text: a[i++] })
        j++
      } else if (
        i < a.length &&
        (j === b.length || grid[(i + 1) * width + j] >= grid[i * width + j + 1])
      )
        result.push({ kind: 'remove', text: a[i++] })
      else result.push({ kind: 'add', text: b[j++] })
    }
  }
  result.push(
    ...oldLines
      .slice(oldLines.length - suffix)
      .map((text) => ({ kind: 'context' as const, text })),
  )
  return result
}
