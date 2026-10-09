import { formatCompactNumber } from './compactNumber.ts'
import type { ChartSeries, ResultView } from './resultVisualization.ts'
import { summarizeTooltipRows } from './chartTooltip.ts'
import { prepareLogScaleSeries, type ValueAxisScale } from './chartAxisScale.ts'
import type { HierarchyNode } from './chartHierarchy.ts'
import { formatDisplayValue, type DisplayUnit } from './displayUnit.ts'

export type TimeDisplayPrecision =
  'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'datetime'

import { CHART_COLORS, chartSeriesColor } from './chartLegend.ts'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const two = (value: number) => String(value).padStart(2, '0')

function dateValue(value: unknown): Date | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-]+Z?)?$/.test(value.trim())
  )
    return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

/** Formats in UTC so labels do not vary with the machine running DataKoala. */
export function formatTimeBucketLabel(
  value: unknown,
  bucket: TimeDisplayPrecision,
): string {
  const date = dateValue(value)
  if (!date) return String(value)
  const dayMonth = `${two(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]}`
  const year = date.getUTCFullYear()
  if (bucket === 'year') return String(year)
  if (bucket === 'quarter')
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${year}`
  if (bucket === 'month') return `${MONTHS[date.getUTCMonth()]} ${year}`
  if (bucket === 'week') return `Week of ${dayMonth}`
  if (bucket === 'day') return dayMonth
  const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}`
  return `${dayMonth}, ${bucket === 'hour' ? `${two(date.getUTCHours())}:00` : time}`
}

/** Returns null for categories or too little evidence, preventing accidental date conversion. */
export function inferTimeDisplayPrecision(
  values: readonly unknown[],
): TimeDisplayPrecision | null {
  if (!values.length) return null
  const dates = values.map(dateValue)
  if (dates.some((value) => value === null)) return null
  if (values.length < 2) return 'datetime'
  const valid = dates as Date[]
  const every = (predicate: (date: Date) => boolean) => valid.every(predicate)
  if (
    every(
      (date) =>
        date.getUTCMonth() === 0 &&
        date.getUTCDate() === 1 &&
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0,
    )
  )
    return 'year'
  if (
    every(
      (date) =>
        date.getUTCDate() === 1 &&
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0,
    )
  )
    return 'month'
  if (every((date) => date.getUTCHours() === 0 && date.getUTCMinutes() === 0))
    return 'day'
  if (every((date) => date.getUTCMinutes() === 0)) return 'hour'
  return 'minute'
}

export function formatChartNumber(value: unknown): string {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isFinite(numeric)) return value == null ? '—' : String(value)
  return formatCompactNumber(numeric)
}

const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  )

export interface ChartAiAnomalyTooltip {
  seriesName: string
  originalIndex: number
  title: string
  reason: string
  severity?: 'low' | 'medium' | 'high'
}

export function buildChartTooltipFormatter(
  formatLabel: (value: unknown) => string,
  hoveredSeriesIdentity?: string | (() => string | undefined),
  originalSeries?: readonly ChartSeries[],
  visibility: Readonly<Record<string, boolean>> = {},
  formatValue: (value: unknown) => string = formatChartNumber,
  aiAnomalies: readonly ChartAiAnomalyTooltip[] = [],
) {
  return (input: unknown): string => {
    const params = (Array.isArray(input) ? input : [input]).filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object',
    )
    if (!params.length) return ''
    const markerParam = params.find(
      (param) => param.componentType === 'markPoint',
    )
    const markerData = markerParam?.data as
      { originalIndex?: unknown; coord?: unknown[] } | undefined
    const axisValue =
      markerData?.coord?.[0] ?? params[0].axisValue ?? params[0].name
    const dataIndex =
      typeof markerData?.originalIndex === 'number'
        ? markerData.originalIndex
        : params.find((param) => typeof param.dataIndex === 'number')?.dataIndex
    const hoveredIdentity =
      markerParam && typeof markerParam.seriesName === 'string'
        ? markerParam.seriesName
        : typeof hoveredSeriesIdentity === 'function'
          ? hoveredSeriesIdentity()
          : hoveredSeriesIdentity
    const colors = new Map(
      params.map((param) => [
        typeof param.seriesName === 'string' ? param.seriesName : '',
        typeof param.color === 'string' ? param.color : undefined,
      ]),
    )
    const sourceRows =
      originalSeries && typeof dataIndex === 'number'
        ? originalSeries
            .filter((series) => visibility[series.name] !== false)
            .map((series) => ({
              identity: series.name,
              name: series.name,
              value: series.missing?.[dataIndex]
                ? null
                : series.data[dataIndex],
              color: colors.get(series.name),
            }))
        : params.map((param) => {
            const raw = Array.isArray(param.value)
              ? param.value[param.value.length - 1]
              : param.value
            const name =
              typeof param.seriesName === 'string' ? param.seriesName : ''
            return {
              identity: name,
              name,
              value:
                typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
              color: typeof param.color === 'string' ? param.color : undefined,
            }
          })
    const summary = summarizeTooltipRows(
      sourceRows.map((row) => ({
        ...row,
        value:
          typeof row.value === 'number' && Number.isFinite(row.value)
            ? row.value
            : null,
      })),
      hoveredIdentity,
    )
    const rows = summary.rows.map(
      (row) =>
        `<div class="chart-tooltip-row${row.hovered ? ' chart-tooltip-row-hovered' : ''}"><span class="chart-tooltip-marker" style="background:${escapeHtml(row.color ?? '#9aa0b0')}"></span><span class="chart-tooltip-series" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span><strong>${escapeHtml(formatValue(row.value))}</strong></div>`,
    )
    const anomaly =
      typeof dataIndex === 'number' && hoveredIdentity
        ? aiAnomalies.find(
            (item) =>
              item.seriesName === hoveredIdentity &&
              item.originalIndex === dataIndex &&
              visibility[item.seriesName] !== false,
          )
        : undefined
    const anomalyDetails = anomaly
      ? `<div class="chart-tooltip-anomaly"><div class="chart-tooltip-anomaly-heading">${anomaly.severity ? `AI anomaly · ${escapeHtml(anomaly.severity)}` : 'AI anomaly'}</div><strong>${escapeHtml(anomaly.title)}</strong><div class="chart-tooltip-anomaly-reason">${escapeHtml(anomaly.reason)}</div></div>`
      : ''
    return `<div class="chart-tooltip-content"><div class="chart-tooltip-heading">${escapeHtml(formatLabel(axisValue))}</div>${rows.join('')}${summary.omitted ? `<div class="chart-tooltip-more">${summary.omitted} more</div>` : ''}${anomalyDetails}</div>`
  }
}

export const positionChartTooltip = (
  point: number[],
  _params: unknown,
  _element: HTMLElement,
  _rect: unknown,
  sizes: { contentSize: number[]; viewSize: number[] },
): [number, number] => {
  const gap = 12
  const maxX = Math.max(0, sizes.viewSize[0] - sizes.contentSize[0])
  const maxY = Math.max(0, sizes.viewSize[1] - sizes.contentSize[1])
  return [
    Math.max(0, Math.min(point[0] + gap, maxX)),
    Math.max(0, Math.min(point[1] + gap, maxY)),
  ]
}

interface PresentationInput {
  labels: string[]
  series: ChartSeries[]
  view: ResultView
  hasSeriesColumn: boolean
  mode: 'sql' | 'builder'
  timeBucket?: string
  timeDomain?: { min: number; max: number }
  displayUnit?: DisplayUnit
  valueAxisScale?: ValueAxisScale
  visibility?: Readonly<Record<string, boolean>>
  hoveredSeriesIdentity?: string | (() => string | undefined)
  rangeSelectionEnabled?: boolean
  hierarchy?: HierarchyNode[]
  aiAnomalies?: readonly ChartAiAnomalyTooltip[]
  showAiAnomalies?: boolean
}

export function buildChartPresentationOptions(
  input: PresentationInput,
): Record<string, unknown> {
  const formatValue = (value: unknown) =>
    formatDisplayValue(value, input.displayUnit, formatChartNumber)
  if (input.view === 'treemap' || input.view === 'sunburst') {
    const total = (input.hierarchy ?? []).reduce(
      (sum, node) => sum + node.value,
      0,
    )
    return {
      backgroundColor: 'transparent',
      color: CHART_COLORS,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (param: {
          treePathInfo?: Array<{ name: string }>
          name?: string
          value?: unknown
        }) => {
          const path =
            (param.treePathInfo ?? [])
              .map(({ name }) => name)
              .filter(Boolean)
              .join(' → ') || String(param.name ?? '')
          const value =
            typeof param.value === 'number' ? param.value : Number(param.value)
          const percentage =
            total > 0 && Number.isFinite(value)
              ? `${((value / total) * 100).toFixed(1)}%`
              : '—'
          return `<div class="chart-tooltip-content"><div class="chart-tooltip-heading">${escapeHtml(path)}</div><div class="chart-tooltip-row"><span>Value</span><strong>${escapeHtml(formatValue(value))}</strong></div><div class="chart-tooltip-row"><span>Share</span><strong>${percentage}</strong></div></div>`
        },
        backgroundColor: '#161922',
        borderColor: '#2a2f3d',
        borderWidth: 1,
        textStyle: { color: '#f2f4f8' },
      },
      series: [
        {
          type: input.view,
          data: input.hierarchy ?? [],
          ...(input.view === 'treemap'
            ? {
                roam: true,
                nodeClick: 'zoomToNode',
                breadcrumb: {
                  show: true,
                  top: 4,
                  itemStyle: {
                    color: '#252a36',
                    borderColor: '#3a4050',
                    textStyle: { color: '#f2f4f8' },
                  },
                },
                top: 34,
                left: 8,
                right: 8,
                bottom: 8,
              }
            : {
                radius: ['10%', '90%'],
                sort: null,
                emphasis: { focus: 'ancestor' },
                label: { rotate: 'radial', minAngle: 8 },
              }),
        },
      ],
    }
  }
  const precision =
    input.mode === 'builder'
      ? (input.timeBucket as TimeDisplayPrecision)
      : inferTimeDisplayPrecision(input.labels)
  const temporal = Boolean(
    precision &&
    input.labels.length &&
    input.labels.every((label) => dateValue(label)),
  )
  const temporalXValues = temporal
    ? input.labels.map((label) => dateValue(label)!.getTime())
    : []
  const domain = temporal ? input.timeDomain : undefined
  const temporalBarOutsideDomain = Boolean(
    temporal &&
    input.view === 'bar' &&
    domain &&
    !temporalXValues.some((time) => time >= domain.min && time <= domain.max),
  )
  const formatLabel = precision
    ? (value: unknown) => formatTimeBucketLabel(value, precision)
    : (value: unknown) => String(value)
  const renderedSeries =
    input.valueAxisScale === 'log'
      ? prepareLogScaleSeries(input.series, input.visibility).series
      : input.series
  const tooltipFormatter = buildChartTooltipFormatter(
    formatLabel,
    input.hoveredSeriesIdentity,
    input.series,
    input.visibility,
    formatValue,
    input.showAiAnomalies ? input.aiAnomalies : [],
  )
  return {
    useUTC: true,
    backgroundColor: 'transparent',
    color: CHART_COLORS,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: {
        type: 'cross',
        lineStyle: { color: '#697184', width: 1, type: 'dashed' },
        crossStyle: {
          color: '#697184',
          width: 1,
          type: 'dashed',
        },

        label: {
          show: true,
          color: '#f2f4f8',
          backgroundColor: '#252a36',
          borderColor: '#3a4050',
          borderWidth: 1,
          padding: [4, 7],
          borderRadius: 4,
          fontSize: 11,
          formatter: (params: { axisDimension?: string; value?: unknown }) =>
            params.axisDimension === 'x'
              ? formatLabel(params.value)
              : formatValue(params.value),
        },
      },
      position: positionChartTooltip,
      formatter: tooltipFormatter,
      backgroundColor: '#161922',
      borderColor: '#2a2f3d',
      borderWidth: 1,
      textStyle: { color: '#f2f4f8', fontSize: 12, lineHeight: 16 },
      extraCssText:
        'box-sizing:border-box;max-width:min(300px,calc(100% - 16px));max-height:calc(100% - 16px);padding:8px 10px;overflow:hidden;overflow-wrap:anywhere;white-space:normal;box-shadow:0 5px 14px rgba(0,0,0,.3);border-radius:6px;',
    },
    // Hidden legend retains ECharts selection filtering; HTML owns its presentation.
    legend: { show: false, selected: input.visibility },
    grid: { left: 50, right: 24, top: 20, bottom: 45 },
    xAxis: temporal
      ? {
          type: 'time',
          ...(domain ?? {}),
          // ECharts 6.1 enables containShape for bar series on time/value axes by
          // default. When every bar lies outside a bounded domain (for example while
          // a previous result is stale), its inferred band can collapse visible ticks.
          ...(temporalBarOutsideDomain ? { containShape: false } : {}),
          axisLabel: { color: '#9aa0b0', formatter: formatLabel },
        }
      : {
          type: 'category',
          data: input.labels,
          axisLabel: { color: '#9aa0b0', formatter: formatLabel },
        },
    yAxis: {
      type: input.valueAxisScale === 'log' ? 'log' : 'value',
      axisLabel: { color: '#9aa0b0', formatter: formatValue },
    },
    ...(input.rangeSelectionEnabled
      ? {
          toolbox: { show: false },
          brush: {
            toolbox: [],
            xAxisIndex: 'all',
            brushMode: 'single',
            transformable: false,
            throttleType: 'debounce',
            throttleDelay: 0,
          },
        }
      : {}),
    series: renderedSeries.map((series, index) => ({
      ...series,
      ...(input.showAiAnomalies
        ? (() => {
            const data = (input.aiAnomalies ?? [])
              .filter(
                (anomaly) =>
                  anomaly.seriesName === series.name &&
                  anomaly.originalIndex >= 0 &&
                  anomaly.originalIndex < series.data.length &&
                  input.visibility?.[series.name] !== false &&
                  typeof series.data[anomaly.originalIndex] === 'number' &&
                  (input.valueAxisScale !== 'log' ||
                    (series.data[anomaly.originalIndex] as number) > 0),
              )
              .map((anomaly) => ({
                coord: [
                  temporal
                    ? temporalXValues[anomaly.originalIndex]
                    : input.labels[anomaly.originalIndex],
                  series.data[anomaly.originalIndex],
                ],
                value: series.data[anomaly.originalIndex],
                originalIndex: anomaly.originalIndex,
              }))
            return data.length
              ? {
                  markPoint: {
                    symbol: 'circle',
                    symbolSize: 14,
                    label: { show: false },
                    tooltip: {
                      show: true,
                      trigger: 'item',
                      formatter: tooltipFormatter,
                    },
                    itemStyle: {
                      color: 'rgba(0, 0, 0, 0)',
                      borderColor: '#ff4d4f',
                      borderWidth: 2,
                    },
                    data,
                  },
                }
              : {}
          })()
        : {}),
      missing: undefined,
      itemStyle: { color: chartSeriesColor(index) },
      lineStyle: { color: chartSeriesColor(index) },
      type: input.view === 'area' ? 'line' : input.view,
      data: temporal
        ? series.data.map((value, index) => [temporalXValues[index], value])
        : series.data,
      stack:
        (input.view === 'bar' || input.view === 'area') && input.hasSeriesColumn
          ? 'total'
          : undefined,
      areaStyle: input.view === 'area' ? { opacity: 0.3 } : undefined,
      smooth: input.view === 'line' || input.view === 'area',
      connectNulls: false,
      showSymbol: input.view === 'line',
      symbolSize: input.view === 'scatter' ? 8 : 6,
    })),
  }
}
