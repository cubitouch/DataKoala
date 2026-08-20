export type TraceRow = Record<string, unknown>

export interface VisibleTraceSpan {
  row: TraceRow
  id: string
  depth: number
  hasChildren: boolean
}

export type TraceResultStatus = 'ok' | 'error' | 'unknown'

export interface TraceTimelineGap {
  startMs: number
  endMs: number
  durationMs: number
  displayDurationMs: number
}

export interface TraceTimelineScale {
  startMs: number
  endMs: number
  wallDurationMs: number
  displayDurationMs: number
  gaps: TraceTimelineGap[]
  offsetPercent: (timeMs: number) => number
  widthPercent: (startMs: number, durationMs: number) => number
}

const SPAN_KIND_ORDER = ['SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER', 'INTERNAL', 'UNSPECIFIED']
const ASYNC_SPAN_KINDS = new Set(['PRODUCER', 'CONSUMER'])
const MIN_IDLE_GAP_THRESHOLD_MS = 20
const MAX_IDLE_GAP_THRESHOLD_MS = 500

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

export function traceResultStatus(row: TraceRow): TraceResultStatus {
  const value = text(row.status).trim().toLowerCase()
  if (value.includes('error') || value === 'failed' || value === 'failure') return 'error'
  if (value === 'ok' || value.includes('success')) return 'ok'
  return 'unknown'
}

export function openedTraceStatus(rows: TraceRow[]): TraceResultStatus {
  if (!rows.length) return 'unknown'
  const sorted = [...rows].sort((left, right) => number(left.startTimeMs) - number(right.startTimeMs))
  const root = sorted.find((row) => !text(row.parentSpanId)) ?? sorted[0]
  const rootStatus = traceResultStatus(root)
  if (rootStatus !== 'unknown') return rootStatus
  return sorted.some((row) => traceResultStatus(row) === 'error') ? 'error' : 'unknown'
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

export function withoutAsyncTraceBranches(rows: TraceRow[]): TraceRow[] {
  const byId = new Map<string, TraceRow>()
  const children = new Map<string, TraceRow[]>()
  for (const row of rows) {
    const id = text(row.spanId)
    if (id) byId.set(id, row)
  }
  for (const row of rows) {
    const parent = text(row.parentSpanId)
    if (!parent || !byId.has(parent)) continue
    const list = children.get(parent) ?? []
    list.push(row)
    children.set(parent, list)
  }

  const hidden = new Set<string>()
  const hideBranch = (row: TraceRow) => {
    const id = text(row.spanId)
    if (!id || hidden.has(id)) return
    hidden.add(id)
    for (const child of children.get(id) ?? []) hideBranch(child)
  }

  for (const row of rows) {
    if (!text(row.parentSpanId)) continue
    if (ASYNC_SPAN_KINDS.has(traceSpanKind(row))) hideBranch(row)
  }
  return rows.filter((row) => !hidden.has(text(row.spanId)))
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * Builds a piecewise timeline projection that can compress long periods where no
 * visible leaf span is active. Parent/container spans are deliberately excluded
 * from idle-gap detection because a root request often encloses delayed messaging
 * work and would otherwise make the complete wall-clock range look continuously busy.
 *
 * Span ordering and real duration labels remain unchanged. Only the horizontal gap
 * between activity islands is compressed, and callers can expose the returned gaps
 * as visual break markers so the transformed scale is never mistaken for wall time.
 */
export function buildTraceTimelineScale(rows: TraceRow[], compressIdleGaps = true): TraceTimelineScale {
  if (!rows.length) {
    return {
      startMs: 0,
      endMs: 0,
      wallDurationMs: 0,
      displayDurationMs: 0,
      gaps: [],
      offsetPercent: () => 0,
      widthPercent: () => 0
    }
  }

  const starts = rows.map((row) => number(row.startTimeMs))
  const ends = rows.map((row) => number(row.startTimeMs) + Math.max(0, number(row.durationMs)))
  const startMs = Math.min(...starts)
  const endMs = Math.max(...ends)
  const wallDurationMs = Math.max(0, endMs - startMs)

  if (!compressIdleGaps || wallDurationMs <= 0) {
    const percent = (timeMs: number) => wallDurationMs > 0
      ? Math.max(0, Math.min(100, ((timeMs - startMs) / wallDurationMs) * 100))
      : 0
    return {
      startMs,
      endMs,
      wallDurationMs,
      displayDurationMs: wallDurationMs,
      gaps: [],
      offsetPercent: percent,
      widthPercent: (spanStartMs, durationMs) => Math.max(0, percent(spanStartMs + Math.max(0, durationMs)) - percent(spanStartMs))
    }
  }

  const parentIds = new Set(rows.map((row) => text(row.parentSpanId)).filter(Boolean))
  const leaves = rows.filter((row) => !parentIds.has(text(row.spanId)))
  const activityRows = leaves.length ? leaves : rows
  const intervals = activityRows
    .map((row) => {
      const start = number(row.startTimeMs)
      return { start, end: start + Math.max(0, number(row.durationMs)) }
    })
    .sort((left, right) => left.start - right.start || left.end - right.end)

  const merged: Array<{ start: number; end: number }> = []
  for (const interval of intervals) {
    const previous = merged[merged.length - 1]
    if (!previous || interval.start > previous.end) merged.push({ ...interval })
    else previous.end = Math.max(previous.end, interval.end)
  }

  const positiveDurations = activityRows.map((row) => number(row.durationMs)).filter((duration) => duration > 0)
  const thresholdMs = Math.max(
    MIN_IDLE_GAP_THRESHOLD_MS,
    Math.min(MAX_IDLE_GAP_THRESHOLD_MS, Math.max(MIN_IDLE_GAP_THRESHOLD_MS, median(positiveDurations) * 2))
  )
  const gapMinimumMs = thresholdMs * 4
  const gaps: TraceTimelineGap[] = []

  const addGap = (gapStart: number, gapEnd: number) => {
    const durationMs = Math.max(0, gapEnd - gapStart)
    if (durationMs <= gapMinimumMs) return
    const ratio = Math.max(1, durationMs / thresholdMs)
    const displayDurationMs = thresholdMs * (1 + Math.log10(ratio))
    gaps.push({ startMs: gapStart, endMs: gapEnd, durationMs, displayDurationMs })
  }

  if (merged.length) {
    addGap(startMs, merged[0].start)
    for (let index = 1; index < merged.length; index += 1) addGap(merged[index - 1].end, merged[index].start)
    addGap(merged[merged.length - 1].end, endMs)
  }

  const removedMs = gaps.reduce((total, gap) => total + gap.durationMs - gap.displayDurationMs, 0)
  const displayDurationMs = Math.max(0, wallDurationMs - removedMs)
  const project = (timeMs: number): number => {
    const clamped = Math.max(startMs, Math.min(endMs, timeMs))
    let removedBefore = 0
    for (const gap of gaps) {
      if (clamped >= gap.endMs) {
        removedBefore += gap.durationMs - gap.displayDurationMs
        continue
      }
      if (clamped > gap.startMs) {
        const progress = (clamped - gap.startMs) / gap.durationMs
        const displayedInsideGap = progress * gap.displayDurationMs
        return gap.startMs - startMs - removedBefore + displayedInsideGap
      }
      break
    }
    return clamped - startMs - removedBefore
  }
  const offsetPercent = (timeMs: number) => displayDurationMs > 0
    ? Math.max(0, Math.min(100, (project(timeMs) / displayDurationMs) * 100))
    : 0

  return {
    startMs,
    endMs,
    wallDurationMs,
    displayDurationMs,
    gaps,
    offsetPercent,
    widthPercent: (spanStartMs, durationMs) => Math.max(
      0,
      offsetPercent(spanStartMs + Math.max(0, durationMs)) - offsetPercent(spanStartMs)
    )
  }
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
