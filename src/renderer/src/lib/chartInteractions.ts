import type { ChartPointContext } from './chartPointFilters'
import {
  decodeBuilderSeriesTuple,
  type VisualizationConfiguration,
} from './resultVisualization'

/** ECharts point payload; pixel positioning stays with the chart instance. */
export interface ChartClickEvent {
  componentType?: string
  dataIndex?: number
  seriesIndex?: number
  data?: unknown
}

/** Translate a plotted point to source values without UI or session access. */
export function chartClickContext(
  params: ChartClickEvent,
  chart: {
    renderable: boolean
    xValues: unknown[]
    seriesValues: unknown[]
  } | null,
  configuration: VisualizationConfiguration,
  timeBucket?: ChartPointContext['timeBucket'],
): ChartPointContext | null {
  if (
    (params.data as { aiAnomalyOverlay?: unknown } | undefined)
      ?.aiAnomalyOverlay === true ||
    params.componentType !== 'series' ||
    !chart?.renderable ||
    !configuration.xColumn ||
    params.dataIndex == null ||
    params.seriesIndex == null
  )
    return null
  const xValue = chart.xValues[params.dataIndex]
  const seriesValue = chart.seriesValues[params.seriesIndex] ?? null
  const tuple = decodeBuilderSeriesTuple(seriesValue)
  const directSeriesColumn =
    configuration.seriesColumn && configuration.seriesColumn !== 'series'
      ? configuration.seriesColumn
      : null
  const seriesFilters =
    tuple?.map(({ column, value }) => ({ column, value })) ??
    (directSeriesColumn
      ? [{ column: directSeriesColumn, value: seriesValue }]
      : undefined)
  return {
    xColumn: configuration.xColumn,
    xValue,
    seriesColumn:
      configuration.seriesColumn ??
      (configuration.seriesColumns?.length ? 'series' : null),
    seriesValue,
    seriesFilters,
    timeBucket,
  }
}
