import type { QueryResult } from '@shared/types'
import type { ChartConfig } from '../store/useStore'

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = value instanceof Date ? value.toISOString() : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function resultToCsv(result: QueryResult): string {
  const header = result.columns.map((c) => escapeCsv(c.name)).join(',')
  const lines = result.rows.map((row) =>
    result.columns.map((c) => escapeCsv(row[c.name])).join(',')
  )
  return [header, ...lines].join('\n')
}

interface AccRow {
  [key: string]: unknown
  _count: number
  _sum: number
  _min: number
  _max: number
}

/**
 * Aggregate raw query rows into one row per (series, x) pair.
 *
 * The series field is copied onto each output row. Without it the chart layer has
 * no way to tell series apart and collapses them all into one.
 */
export function buildChartData(result: QueryResult, cfg: ChartConfig): Record<string, unknown>[] {
  if (!result || !cfg.xField || !cfg.yField) return []
  const map = new Map<string, AccRow>()
  // Only carry the series field if it is a distinct column; writing it over the
  // x or y field would clobber the value we are aggregating.
  const carrySeries =
    cfg.seriesField && cfg.seriesField !== cfg.xField && cfg.seriesField !== cfg.yField
      ? cfg.seriesField
      : null

  const accumulate = (key: string, y: number, seriesKey: string, seriesValue: unknown) => {
    const mapKey = seriesKey + '\u0000' + key
    let row = map.get(mapKey)
    if (!row) {
      row = { [cfg.xField]: key, [cfg.yField]: 0, _count: 0, _sum: 0, _min: Infinity, _max: -Infinity } as AccRow
      if (carrySeries) row[carrySeries] = seriesValue
      map.set(mapKey, row)
    }
    row._count += 1
    row._sum += y
    row._min = Math.min(row._min, y)
    row._max = Math.max(row._max, y)
    if (cfg.aggregation === 'none' || cfg.aggregation === 'sum') row[cfg.yField] = row._sum
    if (cfg.aggregation === 'avg') row[cfg.yField] = row._sum / row._count
    if (cfg.aggregation === 'count') row[cfg.yField] = row._count
    if (cfg.aggregation === 'min') row[cfg.yField] = row._min
    if (cfg.aggregation === 'max') row[cfg.yField] = row._max
  }

  for (const raw of result.rows) {
    const xRaw = raw[cfg.xField]
    const key = xRaw instanceof Date ? xRaw.toISOString() : xRaw === null || xRaw === undefined ? '(null)' : String(xRaw)
    const yRaw = raw[cfg.yField]
    const y = typeof yRaw === 'number' ? yRaw : Number(yRaw)
    if (!Number.isFinite(y)) continue
    const seriesValue = cfg.seriesField ? raw[cfg.seriesField] : undefined
    const seriesKey = cfg.seriesField ? String(seriesValue ?? '(null)') : ''
    accumulate(key, y, seriesKey, seriesValue)
  }

  const rows = [...map.values()].map((r) => {
    const { _count, _sum, _min, _max, ...rest } = r
    void _count
    void _sum
    void _min
    void _max
    return rest
  })
  // ISO timestamps sort chronologically under a lexicographic compare, and the
  // numeric option keeps "10" after "9" for numeric-looking categories.
  rows.sort((a, b) => String(a[cfg.xField]).localeCompare(String(b[cfg.xField]), undefined, { numeric: true }))
  return rows
}
