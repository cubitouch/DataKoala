export type TraceRow = Record<string, unknown>

export interface VisibleTraceSpan {
  row: TraceRow
  id: string
  depth: number
  hasChildren: boolean
}

const SPAN_KIND_ORDER = ['SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER', 'INTERNAL', 'UNSPECIFIED']

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function canonicalTraceId(value: unknown): string | null {
  const traceId = text(value).trim().toLowerCase()
  if (!/^[0-9a-f]{1,32}$/.test(traceId)) return null
  return traceId.padStart(32, '0')
}

export function traceSpanKind(row: TraceRow): string {
  const kind = text(row.kind).trim().replace(/^SPAN_KIND_/i, '').toUpperCase()
  return kind || 'UNSPECIFIED'
}

export function traceSpanKindLabel(kind: string): string {
  const normalized = kind.toUpperCase()
  if (normalized === 'INTERNAL') return 'Internal / code'
  if (normalized === 'UNSPECIFIED') return 'Unspecified'
  return normalized.charAt(0) + normalized.slice(1).toLowerCase()
}

export function traceSpanKinds(rows: TraceRow[]): string[] {
  const kinds = [...new Set(rows.map(traceSpanKind))]
  return kinds.sort((left, right) => {
    const leftIndex = SPAN_KIND_ORDER.indexOf(left)
    const rightIndex = SPAN_KIND_ORDER.indexOf(right)
    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1
      if (rightIndex < 0) return -1
      return leftIndex - rightIndex
    }
    return left.localeCompare(right)
  })
}

export function visibleSpanCount(rows: TraceRow[], hiddenKinds: Set<string>): number {
  return rows.reduce((count, row) => count + (hiddenKinds.has(traceSpanKind(row)) ? 0 : 1), 0)
}

export function buildVisibleTraceTree(
  rows: TraceRow[],
  collapsed: Set<string>,
  hiddenKinds: Set<string>
): VisibleTraceSpan[] {
  const sorted = [...rows].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs))
  const byId = new Map<string, TraceRow>()
  for (const row of sorted) {
    const id = text(row.spanId)
    if (id) byId.set(id, row)
  }

  const children = new Map<string, TraceRow[]>()
  for (const row of sorted) {
    const parent = text(row.parentSpanId)
    if (!parent || !byId.has(parent)) continue
    const list = children.get(parent) ?? []
    list.push(row)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs))

  const roots = sorted.filter((row) => !text(row.parentSpanId) || !byId.has(text(row.parentSpanId)))
  const visibleDescendantMemo = new Map<string, boolean>()
  const checking = new Set<string>()
  const hasVisibleDescendant = (id: string): boolean => {
    const cached = visibleDescendantMemo.get(id)
    if (cached !== undefined) return cached
    if (checking.has(id)) return false
    checking.add(id)
    const result = (children.get(id) ?? []).some((child) => {
      const childId = text(child.spanId)
      return !hiddenKinds.has(traceSpanKind(child)) || (!!childId && hasVisibleDescendant(childId))
    })
    checking.delete(id)
    visibleDescendantMemo.set(id, result)
    return result
  }

  const output: VisibleTraceSpan[] = []
  const visited = new Set<string>()
  const markDescendantsVisited = (id: string) => {
    for (const child of children.get(id) ?? []) {
      const childId = text(child.spanId)
      if (!childId || visited.has(childId)) continue
      visited.add(childId)
      markDescendantsVisited(childId)
    }
  }
  const visit = (row: TraceRow, depth: number) => {
    const id = text(row.spanId)
    if (!id || visited.has(id)) return
    visited.add(id)
    const hidden = hiddenKinds.has(traceSpanKind(row))
    const childRows = children.get(id) ?? []

    if (!hidden) {
      output.push({ row, id, depth: Math.min(depth, 16), hasChildren: hasVisibleDescendant(id) })
      if (collapsed.has(id)) {
        markDescendantsVisited(id)
        return
      }
    }

    const childDepth = hidden ? depth : depth + 1
    childRows.forEach((child) => visit(child, childDepth))
  }

  roots.forEach((root) => visit(root, 0))
  sorted.forEach((row) => visit(row, 0))
  return output
}
