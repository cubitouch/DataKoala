// Relative rather than the '@shared' alias: this module is unit tested under plain
// Node, which does not know about Vite's path aliases, and `isTimeType` is a runtime
// value so the import is not erased by type stripping.
import { isTimeType, type QueryResult } from '../../../shared/types.ts'
import type { ChartConfig } from '../store/useStore'
import { buildChartData } from './data.ts'

/**
 * Builds the ECharts option for a result set. Kept as a pure function so the axis
 * and series wiring can be unit tested without a browser.
 *
 * Two things here are easy to get wrong and were previously wrong:
 *
 * 1. A `time` axis ignores `xAxis.data`. Series must carry their own x value as
 *    `[x, y]` pairs, otherwise ECharts positions points by array index and the
 *    chart shows dates near the epoch instead of the real timestamps.
 * 2. On a `category` axis, every series' data array is indexed against
 *    `xAxis.data`. Series must be padded to the full category list, or a series
 *    missing an early category has all its later points shifted left.
 */

export const CHART_COLORS = ['#f5cf33', '#75a8a6', '#e99a5b', '#8d83d8', '#69b978', '#d97883', '#62a0d2', '#d8a45d', '#a887c4', '#59b9b1', '#b7b96a', '#d786ae']

const AXIS_LINE = { lineStyle: { color: '#516666' } }
const AXIS_LABEL = { color: '#809ca0' }

export interface BuiltOption {
  option: Record<string, unknown>
  /** Diagnostics the tests assert on and the UI can surface. */
  meta: {
    isTimeAxis: boolean
    seriesNames: string[]
    categoryCount: number
    pointCount: number
  }
}

const SINGLE_SERIES = '__default__'

export function buildEChartsOption(
  result: QueryResult | null,
  cfg: ChartConfig
): BuiltOption | null {
  if (!result || !cfg.xField || !cfg.yField) return null
  const rows = buildChartData(result, cfg)
  if (!rows.length) return null

  const isTimeAxis = result.columns.some(
    (c) => c.name === cfg.xField && isTimeType(c.dataTypeName)
  )
  const isScatter = cfg.type === 'scatter'
  const echartsType = isScatter ? 'scatter' : cfg.type === 'area' ? 'line' : cfg.type

  // Group into series, preserving first-seen order.
  const grouped = new Map<string, { x: string; y: number }[]>()
  for (const r of rows) {
    const name = cfg.seriesField ? String(r[cfg.seriesField] ?? '(null)') : SINGLE_SERIES
    if (!grouped.has(name)) grouped.set(name, [])
    grouped.get(name)!.push({ x: String(r[cfg.xField]), y: Number(r[cfg.yField]) })
  }

  // Categories, in the sorted order buildChartData already established.
  const categories: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const x = String(r[cfg.xField])
    if (!seen.has(x)) {
      seen.add(x)
      categories.push(x)
    }
  }

  const usePairs = isTimeAxis || isScatter

  const series = [...grouped.entries()].map(([name, pts]) => {
    let data: unknown[]
    if (usePairs) {
      // Carry x explicitly; required for time and scatter axes.
      data = pts.map((p) => [p.x, p.y])
    } else {
      // Align to the category list so multiple series cannot drift out of step.
      const byX = new Map(pts.map((p) => [p.x, p.y]))
      data = categories.map((c) => (byX.has(c) ? byX.get(c)! : null))
    }
    return {
      name: name === SINGLE_SERIES ? cfg.yField : name,
      type: echartsType,
      data,
      smooth: cfg.type === 'line' || cfg.type === 'area',
      areaStyle: cfg.type === 'area' ? { opacity: 0.15 } : undefined,
      showSymbol: !isScatter && pts.length > 40 ? false : true,
      emphasis: { focus: 'series' as const }
    }
  })

  const xAxis: Record<string, unknown> = {
    type: isTimeAxis ? 'time' : 'category',
    axisLine: AXIS_LINE,
    axisLabel: AXIS_LABEL
  }
  // Only a category axis consumes `data`; setting it on a time axis is misleading.
  if (!isTimeAxis) xAxis.data = categories

  return {
    option: {
      backgroundColor: 'transparent',
      animationDuration: 300,
      grid: { left: 64, right: 20, top: grouped.size > 1 ? 34 : 20, bottom: 44 },
      tooltip: {
        trigger: isScatter ? 'item' : 'axis',
        axisPointer: { type: cfg.type === 'bar' ? 'shadow' : 'line' }
      },
      legend: {
        show: grouped.size > 1,
        textStyle: AXIS_LABEL,
        top: 0,
        type: 'scroll'
      },
      xAxis,
      yAxis: {
        type: 'value',
        axisLine: AXIS_LINE,
        splitLine: { lineStyle: { color: '#2a3736' } },
        axisLabel: AXIS_LABEL
      },
      series,
      color: CHART_COLORS
    },
    meta: {
      isTimeAxis,
      seriesNames: [...grouped.keys()],
      categoryCount: categories.length,
      pointCount: rows.length
    }
  }
}
