import ReactECharts from 'echarts-for-react'
import type { EChartsType } from 'echarts/core'
import type { QueryResult } from '@shared/types'
import { buildChartPresentationOptions } from '../lib/chartPresentation'
import { pivotRowsForChart, type VisualizationConfiguration } from '../lib/resultVisualization'
import styles from './LokiExplorer.module.css'
import { selectedLokiTrendRange, type LokiTrendRange } from '../lib/lokiTrendRange.ts'

export function lokiTrendPresentation(result: QueryResult, view: 'line' | 'area' | 'bar') {
  const groupColumns = result.columns.map(({ name }) => name).filter((name) => !['timestamp', 'value'].includes(name))
  const chartResult = groupColumns.length ? {
    ...result,
    columns: [...result.columns, { name: '__loki_series', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' as const, nativeType: 'text' }],
    rows: result.rows.map((row) => ({ ...row, __loki_series: groupColumns.map((label) => `${label}=${String(row[label] ?? '')}`).join(', ') }))
  } : result
  const configuration: VisualizationConfiguration = { view, xColumn: 'timestamp', valueColumn: 'value', aggregation: 'sum', seriesColumn: groupColumns.length ? '__loki_series' : null, seriesColumns: [], valueAxisScale: 'linear' }
  const chart = pivotRowsForChart(chartResult, configuration)
  if (!chart.renderable) return { chart, option: null }
  return { chart, option: buildChartPresentationOptions({ labels: chart.labels, series: chart.series, view, hasSeriesColumn: groupColumns.length > 0, mode: 'sql', rangeSelectionEnabled: true }) }
}
export function LokiTrendChart({ result, view, onRangeSelected }: { result: QueryResult; view: 'line' | 'area' | 'bar'; onRangeSelected: (range: LokiTrendRange) => void }) {
  const { chart, option } = lokiTrendPresentation(result, view)
  const activateBrush = (instance: EChartsType) => instance.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
  if (!chart.renderable) return <div className={styles.empty} role="alert">This log-volume chart exceeds the supported series or point limit.</div>
  if (!chart.series.length || !chart.labels.length) return <div className={styles.empty}>No log-volume data for this range.</div>
  return <div className={styles.trend} aria-label="Log volume trend"><div className={styles.chartCanvas}><ReactECharts option={option} theme="dark" notMerge style={{ width: '100%', height: '100%' }} onChartReady={activateBrush} onEvents={{ brushEnd: (event: unknown) => { const range = selectedLokiTrendRange(event); if (range && range.endMs - range.startMs >= 1000) onRangeSelected(range) } }} /></div></div>
}
