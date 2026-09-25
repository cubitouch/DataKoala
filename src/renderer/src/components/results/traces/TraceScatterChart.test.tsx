// @vitest-environment jsdom
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface ChartInstance { dispatchAction: (action: unknown) => void }
interface MockChartProps {
  onChartReady: (instance: ChartInstance) => void
  onEvents: Record<string, (value: unknown) => void>
}

const chart = vi.hoisted(() => ({
  dispatchAction: vi.fn(),
  props: null as MockChartProps | null
}))

vi.mock('echarts-for-react', () => ({
  default: forwardRef(function MockECharts(props: NonNullable<typeof chart.props>, ref) {
    const instance = { dispatchAction: chart.dispatchAction }
    chart.props = props
    useImperativeHandle(ref, () => ({ getEchartsInstance: () => instance }))
    useEffect(() => { props.onChartReady(instance) }, [])
    return <div data-testid="echarts" />
  })
}))

import { TraceScatterChart, traceScatterCustomRange } from './TraceScatterChart'

const range = { kind: 'custom' as const, startDate: '2026-09-13', startTime: '10:00', endDate: '2026-09-13', endTime: '11:00', recurringWindows: [] }
const option = { series: [{ data: [[Date.parse('2026-09-13T10:30:00Z'), 10]] }] }
const enableBrushAction = { type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } }

afterEach(cleanup)
beforeEach(() => { chart.dispatchAction.mockReset(); chart.props = null })

describe('traceScatterCustomRange', () => {
  const domainStart = Date.parse('2026-09-13T10:00:00Z')
  const domainEnd = Date.parse('2026-09-13T11:00:00Z')

  it('clamps and rounds a reverse selection to the current domain', () => {
    expect(traceScatterCustomRange([domainEnd + 60_000, domainStart - 60_000], domainStart, domainEnd)).toEqual({
      kind: 'custom', startDate: '2026-09-13', startTime: '10:00', endDate: '2026-09-13', endTime: '11:00', recurringWindows: []
    })
  })

  it('rejects tiny accidental selections', () => {
    expect(traceScatterCustomRange([domainStart, domainStart + 100], domainStart, domainEnd)).toBeNull()
  })
})

describe('TraceScatterChart brush lifecycle', () => {
  it('activates lineX brushing when the chart becomes ready', async () => {
    render(<TraceScatterChart option={option} searchRange={range} onSelectRange={vi.fn()} />)

    await waitFor(() => expect(chart.dispatchAction).toHaveBeenCalledWith(enableBrushAction))
  })

  it('clears and re-enables brushing after a valid selection', async () => {
    const onSelectRange = vi.fn()
    render(<TraceScatterChart option={option} searchRange={range} onSelectRange={onSelectRange} />)
    await waitFor(() => expect(chart.props).not.toBeNull())
    chart.dispatchAction.mockClear()

    chart.props?.onEvents.brushEnd({ areas: [{ coordRange: [Date.parse('2026-09-13T10:10:00Z'), Date.parse('2026-09-13T10:40:00Z')] }] })

    expect(chart.dispatchAction.mock.calls.map((args) => args[0])).toEqual([{ type: 'brush', areas: [] }, enableBrushAction])
    expect(onSelectRange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'custom', startTime: '10:10', endTime: '10:40' }))
  })

  it('keeps brushing active but ignores a tiny selection', async () => {
    const onSelectRange = vi.fn()
    render(<TraceScatterChart option={option} searchRange={range} onSelectRange={onSelectRange} />)
    await waitFor(() => expect(chart.props).not.toBeNull())
    chart.dispatchAction.mockClear()
    const start = Date.parse('2026-09-13T10:10:00Z')

    chart.props?.onEvents.brushEnd({ areas: [{ coordRange: [start, start + 100] }] })

    expect(onSelectRange).not.toHaveBeenCalled()
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: 'brush', areas: [] })
    expect(chart.dispatchAction).toHaveBeenCalledWith(enableBrushAction)
  })

  it('re-enables brushing when chart options are reapplied', async () => {
    const { rerender } = render(<TraceScatterChart option={option} searchRange={range} onSelectRange={vi.fn()} />)
    await waitFor(() => expect(chart.dispatchAction).toHaveBeenCalled())
    chart.dispatchAction.mockClear()

    rerender(<TraceScatterChart option={{ ...option, symbolSize: 12 }} searchRange={range} onSelectRange={vi.fn()} />)

    await waitFor(() => expect(chart.dispatchAction).toHaveBeenCalledWith(enableBrushAction))
  })

  it('preserves the supplied point-click interaction', async () => {
    const click = vi.fn()
    render(<TraceScatterChart option={option} searchRange={range} onSelectRange={vi.fn()} onEvents={{ click }} />)
    await waitFor(() => expect(chart.props).not.toBeNull())
    const point = { data: { traceId: 'trace-one' } }

    chart.props?.onEvents.click(point)

    expect(click).toHaveBeenCalledWith(point)
  })
})
