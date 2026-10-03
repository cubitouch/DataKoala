import { createTextSearch } from './textSearch'
import type { TraceRow, VisibleTraceSpan } from './traceViewer'

// Decode serialized attribute/event collections once per loaded trace. Search
// values as well as keys without JSON escaping hiding human-readable content.
export function traceSearchText(row: TraceRow): string {
  const parts: string[] = []
  const collect = (value: unknown): void => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        parts.push(key)
        collect(item)
      }
    } else parts.push(String(value))
  }
  for (const value of Object.values(row)) {
    if (
      typeof value === 'string' &&
      (value.trim().startsWith('[') || value.trim().startsWith('{'))
    ) {
      try {
        collect(JSON.parse(value))
        continue
      } catch {
        /* Keep malformed payloads searchable. */
      }
    }
    collect(value)
  }
  return parts.join('\n')
}

export function filterTraceSearch(
  tree: VisibleTraceSpan[],
  rows: TraceRow[],
  index: Map<TraceRow, string>,
  query: string,
) {
  const search = createTextSearch(query)
  const matches = new Set(
    tree
      .filter(({ row }) => search.matches(index.get(row) ?? ''))
      .map(({ id }) => id),
  )
  const included = new Set<string>()
  const parents = new Map(
    rows.map((row) => [
      String(row.spanId ?? ''),
      String(row.parentSpanId ?? ''),
    ]),
  )
  for (const id of matches) {
    let current = id
    while (current && !included.has(current)) {
      included.add(current)
      current = parents.get(current) ?? ''
    }
  }
  return { tree: tree.filter(({ id }) => included.has(id)), matches }
}
