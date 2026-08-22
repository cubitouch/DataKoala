import { useEffect, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type EChartsReact from 'echarts-for-react'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { prometheusRangeBounds } from '../lib/prometheusTimeRange'

interface TraceScatterChartProps {
  option: Record<string, unknown>
  searchRange: BuilderTimeRange
  onSelectRange: (range: BuilderTimeRange) => void
  onEvents?: Record<string, (value: unknown) => void>
}

const MINUTE_MS = 60_000

function datePart(value: Date): { date: string; time: string } {
  return { date: value.toISOString().slice(0, 10), time: value.toISOString().slice(11, 16) }
}

export function traceScatterCustomRange(coordRange: readonly unknown[], domainStartMs: number, domainEndMs: number): BuilderTimeRange | null {
  if (coordRange.length < 2) return null
  const first = Number(coordRange[0])
  const second = Number(coordRange[1])
  if (!Number.isFinite(first) || !Number.isFinite(second) || first === second) return null
  const startMs = Math.max(domainStartMs, Math.min(first, second))
  const endMs = Math.min(domainEndMs, Math.max(first, second))
  const minimumSelectionMs = Math.max(1_000, (domainEndMs - domainStartMs) * 0.002)
  if (endMs - startMs < minimumSelectionMs) return null

  const start = new Date(Math.floor(startMs / MINUTE_MS) * MINUTE_MS)
  const end = new Date(Math.ceil(endMs / MINUTE_MS) * MINUTE_MS)
  if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + MINUTE_MS)
  const from = datePart(start)
  const to = datePart(end)
  return { kind: 'custom', startDate: from.date, startTime: from.time, endDate: to.date, endTime: to.time, recurringWindows: [] }
}

export function TraceScatterChart({ option, searchRange, onSelectRange, onEvents = {} }: TraceScatterChartProps) {
  const ref = useRef<EChartsReact | null>(null)
  const domain = useMemo(() => {
    try {
      const bounds = prometheusRangeBounds(searchRange)
      return { start: Date.parse(bounds.start), end: Date.parse(bounds.end) }
    } catch {
      return null
    }
  }, [searchRange])
  const renderedOption = useMemo(() => ({
    ...option,
    xAxis: {
      ...((option.xAxis as Record<string, unknown> | undefined) ?? {}),
      ...(domain && Number.isFinite(domain.start) && Number.isFinite(domain.end) ? { min: domain.start, max: domain.end } : {})
    },
    toolbox: { show: false },
    brush: { toolbox: [], xAxisIndex: 'all', brushMode: 'single', transformable: false, throttleType: 'debounce', throttleDelay: 0 }
  }), [option, domain])

  const enableBrush = () => ref.current?.getEchartsInstance().dispatchAction({
    type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' }
  })
  useEffect(() => { enableBrush() }, [renderedOption])

  const brushEnd = (value: unknown) => {
    if (!domain) return
    const coordRange = (value as { areas?: Array<{ coordRange?: unknown[] }> })?.areas?.[0]?.coordRange ?? []
    const next = traceScatterCustomRange(coordRange, domain.start, domain.end)
    const instance = ref.current?.getEchartsInstance()
    instance?.dispatchAction({ type: 'brush', areas: [] })
    enableBrush()
    if (next) onSelectRange(next)
  }

  return <ReactECharts
    ref={ref}
    option={renderedOption}
    onEvents={{ ...onEvents, brushEnd }}
    notMerge
    lazyUpdate
    style={{ width: '100%', height: '100%' }}
  />
}
