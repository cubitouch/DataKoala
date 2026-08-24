import ReactECharts from 'echarts-for-react'
import type { EChartsType } from 'echarts/core'
import type { QueryResult } from '@shared/types'
import styles from './LokiExplorer.module.css'
import { selectedLokiTrendRange, type LokiTrendRange } from '../lib/lokiTrendRange.ts'

const colors = ['#70a5ff', '#56c7a5', '#e4a853', '#c38cff', '#ef7474']
export function LokiTrendChart({ result, view, onRangeSelected }: { result: QueryResult; view: 'line' | 'area' | 'bar'; onRangeSelected: (range: LokiTrendRange) => void }) {
  const labelColumns = result.columns.map(({ name }) => name).filter((name) => !['timestamp', 'value'].includes(name))
  const groups = new Map<string, [number, number][]>()
  for (const row of result.rows) {
    const timestamp = Date.parse(String(row.timestamp)), value = Number(row.value)
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue
    const name = labelColumns.map((label) => `${label}=${String(row[label] ?? '')}`).filter((part) => !part.endsWith('=')).join(', ') || 'Logs'
    groups.set(name, [...(groups.get(name) ?? []), [timestamp, value]])
  }
  const option = {
    animation: false, color: colors, backgroundColor: 'transparent', grid: { left: 42, right: 12, top: 10, bottom: 24 },
    tooltip: { trigger: 'axis', backgroundColor: '#171b24', borderColor: '#343b49', textStyle: { color: '#e7ebf2', fontSize: 11 } },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: '#343b49' } }, axisTick: { show: false }, axisLabel: { color: '#858d9d', fontSize: 10 }, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, splitNumber: 3, axisLabel: { color: '#858d9d', fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#252b36' } } },
    toolbox: { show: false }, brush: { toolbox: ['lineX', 'clear'], xAxisIndex: 0, brushMode: 'single', throttleType: 'debounce', throttleDelay: 250, brushStyle: { color: '#70a5ff26', borderColor: '#70a5ff' } },
    series: [...groups].map(([name, data]) => ({ name, type: view === 'bar' ? 'bar' : 'line', showSymbol: false, smooth: 0.18, lineStyle: { width: 1.7 }, areaStyle: view === 'area' ? { opacity: 0.2 } : undefined, data }))
  }
  const activateBrush = (chart: EChartsType) => chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
  return <section className={styles.trend} aria-label="Log volume trend"><header><strong>Log volume</strong><span>Drag across the chart to investigate a narrower range.</span></header><ReactECharts option={option} style={{ height: 'calc(100% - 20px)', minHeight: 200 }} onChartReady={activateBrush} onEvents={{ brushEnd: (event: unknown) => { const range = selectedLokiTrendRange(event); if (range && range.endMs - range.startMs >= 1000) onRangeSelected(range) } }} /></section>
}
