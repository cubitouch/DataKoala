import ReactECharts from 'echarts-for-react'
import type { QueryResult } from '@shared/types'
import styles from './LokiExplorer.module.css'

export interface LokiTrendRange { startMs: number; endMs: number }
export function selectedLokiTrendRange(payload: unknown): LokiTrendRange | null {
  const event = payload as { batch?: { areas?: { coordRange?: unknown[] }[] }[]; areas?: { coordRange?: unknown[] }[] }
  const range = event.batch?.[0]?.areas?.[0]?.coordRange ?? event.areas?.[0]?.coordRange
  if (!Array.isArray(range) || range.length !== 2) return null
  const startMs = Number(range[0]), endMs = Number(range[1])
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs ? { startMs, endMs } : null
}

export function LokiTrendChart({ result, onRangeSelected }: { result: QueryResult; onRangeSelected: (range: LokiTrendRange) => void }) {
  const labelColumns = result.columns.map(({ name }) => name).filter((name) => !['timestamp', 'value'].includes(name))
  const groups = new Map<string, [number, number][]>()
  for (const row of result.rows) {
    const timestamp = Date.parse(String(row.timestamp)); const value = Number(row.value)
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue
    const name = labelColumns.map((label) => `${label}=${String(row[label] ?? '')}`).filter((part) => !part.endsWith('=')).join(', ') || 'Logs'
    groups.set(name, [...(groups.get(name) ?? []), [timestamp, value]])
  }
  const option = {
    animation: false, grid: { left: 48, right: 18, top: 24, bottom: 34 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'time' }, yAxis: { type: 'value', min: 0, name: 'Logs' },
    brush: { toolbox: ['lineX', 'clear'], xAxisIndex: 0, brushMode: 'single', throttleType: 'debounce', throttleDelay: 250 },
    toolbox: { feature: { dataZoom: { yAxisIndex: 'none' }, restore: {} } },
    series: [...groups].map(([name, data]) => ({ name, type: 'line', showSymbol: false, data }))
  }
  return <section className={styles.trend} aria-label="Log volume trend"><header><strong>Log volume</strong><span>Drag horizontally to investigate a narrower range.</span></header><ReactECharts option={option} style={{ height: 220 }} onEvents={{ brushEnd: (event: unknown) => { const range = selectedLokiTrendRange(event); if (range) onRangeSelected(range) } }} /></section>
}
