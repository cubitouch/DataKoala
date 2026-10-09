import { useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type EChartsReact from 'echarts-for-react'
import type { BuilderTimeRange } from '@lib/builderTimeRange'
import { createChartRevision, type ChartRevision } from '@lib/chartReadiness'
import { prometheusRangeBounds } from '@lib/prometheusTimeRange'

export interface TraceScatterRange {
  startMs: number
  endMs: number
}

interface TraceScatterChartProps {
  option: Record<string, unknown>
  searchRange: BuilderTimeRange
  onSelectRange: (range: TraceScatterRange) => void
  onEvents?: Record<string, (value: unknown) => void>
}

export function traceScatterLocalRange(
  coordRange: readonly unknown[],
  domainStartMs: number,
  domainEndMs: number,
): TraceScatterRange | null {
  if (coordRange.length < 2) return null
  const first = Number(coordRange[0])
  const second = Number(coordRange[1])
  if (!Number.isFinite(first) || !Number.isFinite(second) || first === second)
    return null
  const startMs = Math.max(domainStartMs, Math.min(first, second))
  const endMs = Math.min(domainEndMs, Math.max(first, second))
  const minimumSelectionMs = Math.max(
    1_000,
    (domainEndMs - domainStartMs) * 0.002,
  )
  if (endMs - startMs < minimumSelectionMs) return null

  return { startMs, endMs }
}

export function TraceScatterChart({
  option,
  searchRange,
  onSelectRange,
  onEvents = {},
}: TraceScatterChartProps) {
  const ref = useRef<EChartsReact | null>(null)
  const [finishedRevision, setFinishedRevision] =
    useState<ChartRevision | null>(null)
  const domain = useMemo(() => {
    try {
      const bounds = prometheusRangeBounds(searchRange)
      return { start: Date.parse(bounds.start), end: Date.parse(bounds.end) }
    } catch {
      return null
    }
  }, [searchRange])
  const renderedOption = useMemo(
    () => ({
      ...option,
      xAxis: {
        ...((option.xAxis as Record<string, unknown> | undefined) ?? {}),
        ...(domain &&
        Number.isFinite(domain.start) &&
        Number.isFinite(domain.end)
          ? { min: domain.start, max: domain.end }
          : {}),
      },
      toolbox: { show: false },
      brush: {
        toolbox: [],
        xAxisIndex: 'all',
        brushMode: 'single',
        transformable: false,
        throttleType: 'debounce',
        throttleDelay: 0,
      },
    }),
    [option, domain],
  )
  const renderRevision = useMemo(createChartRevision, [renderedOption])
  const series = useMemo(() => {
    const value = option.series
    return (Array.isArray(value) ? value : value ? [value] : []) as Array<{
      data?: unknown[]
    }>
  }, [option])
  const visibleItems = useMemo(
    () =>
      series.reduce(
        (count, item) =>
          count +
          (item.data ?? []).filter((datum) => {
            const value = Array.isArray(datum)
              ? datum
              : (datum as { value?: unknown[] } | null)?.value
            const timestamp = Number(Array.isArray(value) ? value[0] : NaN)
            return Boolean(
              domain &&
              Number.isFinite(timestamp) &&
              timestamp >= domain.start &&
              timestamp <= domain.end,
            )
          }).length,
        0,
      ),
    [domain, series],
  )
  const enableBrush = (instance = ref.current?.getEchartsInstance()) =>
    instance?.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' },
    })
  useEffect(() => {
    enableBrush()
  }, [renderedOption])

  const brushEnd = (value: unknown) => {
    if (!domain) return
    const coordRange =
      (value as { areas?: Array<{ coordRange?: unknown[] }> })?.areas?.[0]
        ?.coordRange ?? []
    const next = traceScatterLocalRange(coordRange, domain.start, domain.end)
    const instance = ref.current?.getEchartsInstance()
    instance?.dispatchAction({ type: 'brush', areas: [] })
    enableBrush()
    if (next) onSelectRange(next)
  }

  return (
    <div
      data-visual-type="scatter"
      data-visual-finished={finishedRevision === renderRevision}
      data-visual-series={series.length}
      data-visual-items={visibleItems}
      data-visual-range={
        domain
          ? `${new Date(domain.start).toISOString()}..${new Date(domain.end).toISOString()}`
          : 'invalid'
      }
      style={{ width: '100%', height: '100%' }}
    >
      <ReactECharts
        ref={ref}
        option={renderedOption}
        onChartReady={(instance) => {
          enableBrush(instance)
          setFinishedRevision(renderRevision)
        }}
        onEvents={{
          ...onEvents,
          brushEnd,
          finished: (value: unknown) => {
            setFinishedRevision(renderRevision)
            onEvents.finished?.(value)
          },
        }}
        notMerge
        lazyUpdate
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
