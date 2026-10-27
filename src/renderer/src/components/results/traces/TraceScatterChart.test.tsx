// @vitest-environment jsdom
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface ChartInstance {
  dispatchAction: (action: unknown) => void
}
interface MockChartProps {
  option: { xAxis: { min: number; max: number } }
  onChartReady: (instance: ChartInstance) => void
  onEvents: Record<string, (value: unknown) => void>
}

const chart = vi.hoisted(() => {
  const dispatchAction = vi.fn()
  return {
    dispatchAction,
    instance: { dispatchAction },
    props: null as MockChartProps | null,
  }
})

vi.mock('echarts-for-react', () => ({
  default: forwardRef(function MockECharts(
    props: NonNullable<typeof chart.props>,
    ref,
  ) {
    const instance = chart.instance
    const onChartReadyRef = useRef(props.onChartReady)
    chart.props = props
    useImperativeHandle(ref, () => ({ getEchartsInstance: () => instance }), [
      instance,
    ])
    useEffect(() => {
      onChartReadyRef.current(instance)
    }, [instance])
    return <div data-testid="echarts" />
  }),
}))

import { TraceScatterChart, traceScatterLocalRange } from './TraceScatterChart'

const range = {
  kind: 'custom' as const,
  startDate: '2026-09-13',
  startTime: '10:00',
  endDate: '2026-09-13',
  endTime: '11:00',
  recurringWindows: [],
}
const option = {
  series: [{ data: [[Date.parse('2026-09-13T10:30:00Z'), 10]] }],
}
const enableBrushAction = {
  type: 'takeGlobalCursor',
  key: 'brush',
  brushOption: { brushType: 'lineX', brushMode: 'single' },
}

afterEach(cleanup)
beforeEach(() => {
  chart.dispatchAction.mockReset()
  chart.props = null
})

describe('traceScatterLocalRange', () => {
  const domainStart = Date.parse('2026-09-13T10:00:00Z')
  const domainEnd = Date.parse('2026-09-13T11:00:00Z')

  it('clamps a reverse selection to the current domain', () => {
    expect(
      traceScatterLocalRange(
        [domainEnd + 60_000, domainStart - 60_000],
        domainStart,
        domainEnd,
      ),
    ).toEqual({ startMs: domainStart, endMs: domainEnd })
  })

  it('preserves sub-minute precision for local half-open filtering', () => {
    expect(
      traceScatterLocalRange(
        [domainStart + 15678, domainStart + 1234],
        domainStart,
        domainEnd,
      ),
    ).toEqual({ startMs: domainStart + 1234, endMs: domainStart + 15678 })
  })

  it('rejects invalid, zero-width and wholly out-of-domain selections', () => {
    for (const coordinates of [
      [],
      [NaN, domainEnd],
      [domainStart, Infinity],
      ['invalid', domainEnd],
      [null, domainEnd],
      ['', domainEnd],
      [true, domainEnd],
      [domainStart, domainStart],
      [domainStart - 2000, domainStart - 1000],
      [domainEnd + 1000, domainEnd + 2000],
    ]) {
      expect(
        traceScatterLocalRange(coordinates, domainStart, domainEnd),
      ).toBeNull()
    }
  })

  it('applies the minimum width after clamping, including the exact threshold', () => {
    const minimum = (domainEnd - domainStart) * 0.002
    expect(
      traceScatterLocalRange(
        [domainStart - minimum, domainStart + minimum - 1],
        domainStart,
        domainEnd,
      ),
    ).toBeNull()
    expect(
      traceScatterLocalRange(
        [domainStart - minimum, domainStart + minimum],
        domainStart,
        domainEnd,
      ),
    ).toEqual({ startMs: domainStart, endMs: domainStart + minimum })
    expect(traceScatterLocalRange([0, 999], 0, 10_000)).toBeNull()
    expect(traceScatterLocalRange([1000, 0], 0, 10_000)).toEqual({
      startMs: 0,
      endMs: 1000,
    })
  })

  it.each([
    [[1000.9, 3000.9], 0, 10000, { startMs: 1000, endMs: 3000 }],
    [[-1000.9, -3000.9], -10000, 0, { startMs: -3000, endMs: -1000 }],
    [[-2000.9, 2000.9], -1000.7, 1000.7, { startMs: -1000, endMs: 1000 }],
  ] as const)(
    'uses displayed truncated bounds after ordering and clamping: %j',
    (coords, start, end, expected) => {
      const range = traceScatterLocalRange(coords, start, end)
      expect(range).toEqual(expected)
      const inside = (t: number) => t >= range!.startMs && t < range!.endMs
      expect(inside(expected.startMs)).toBe(true)
      expect(inside(expected.endMs)).toBe(false)
      expect(inside(expected.startMs - 0.1)).toBe(false)
      expect(inside(expected.endMs - 0.1)).toBe(true)
    },
  )

  it.each([
    [NaN, 10000],
    [0, Infinity],
    [10000, 0],
    [-9e15, 9e15],
  ])('rejects invalid or unrepresentable domains %j', (start, end) => {
    expect(traceScatterLocalRange([start, end], start, end)).toBeNull()
  })

  it('rejects tiny accidental selections', () => {
    expect(
      traceScatterLocalRange(
        [domainStart, domainStart + 100],
        domainStart,
        domainEnd,
      ),
    ).toBeNull()
  })
})

describe('TraceScatterChart brush lifecycle', () => {
  it('activates lineX brushing when the chart becomes ready', async () => {
    render(
      <TraceScatterChart
        option={option}
        searchRange={range}
        onSelectRange={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(chart.dispatchAction).toHaveBeenCalledWith(enableBrushAction),
    )
  })

  it('clears and re-enables brushing after a valid selection', async () => {
    const onSelectRange = vi.fn()
    render(
      <TraceScatterChart
        option={option}
        searchRange={range}
        onSelectRange={onSelectRange}
      />,
    )
    await waitFor(() => expect(chart.props).not.toBeNull())
    chart.dispatchAction.mockClear()

    chart.props?.onEvents.brushEnd({
      areas: [
        {
          coordRange: [
            Date.parse('2026-09-13T10:10:00Z'),
            Date.parse('2026-09-13T10:40:00Z'),
          ],
        },
      ],
    })

    expect(chart.dispatchAction.mock.calls.map((args) => args[0])).toEqual([
      { type: 'brush', areas: [] },
      enableBrushAction,
    ])
    expect(onSelectRange).toHaveBeenCalledWith({
      startMs: Date.parse('2026-09-13T10:10:00Z'),
      endMs: Date.parse('2026-09-13T10:40:00Z'),
    })
  })

  it('keeps brushing active but ignores a tiny selection', async () => {
    const onSelectRange = vi.fn()
    render(
      <TraceScatterChart
        option={option}
        searchRange={range}
        onSelectRange={onSelectRange}
      />,
    )
    await waitFor(() => expect(chart.props).not.toBeNull())
    chart.dispatchAction.mockClear()
    const start = Date.parse('2026-09-13T10:10:00Z')

    chart.props?.onEvents.brushEnd({
      areas: [{ coordRange: [start, start + 100] }],
    })

    expect(onSelectRange).not.toHaveBeenCalled()
    expect(chart.dispatchAction).toHaveBeenCalledWith({
      type: 'brush',
      areas: [],
    })
    expect(chart.dispatchAction).toHaveBeenCalledWith(enableBrushAction)
  })

  it('retains the full query domain and re-enables brushing after points are filtered', async () => {
    const { rerender } = render(
      <TraceScatterChart
        option={option}
        searchRange={range}
        onSelectRange={vi.fn()}
      />,
    )
    await waitFor(() => expect(chart.dispatchAction).toHaveBeenCalled())
    chart.dispatchAction.mockClear()

    rerender(
      <TraceScatterChart
        option={{ ...option, series: [{ data: [] }] }}
        searchRange={range}
        onSelectRange={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(chart.dispatchAction).toHaveBeenCalledWith(enableBrushAction),
    )
    expect(chart.props?.option.xAxis).toMatchObject({
      min: Date.parse('2026-09-13T10:00:00Z'),
      max: Date.parse('2026-09-13T11:00:00Z'),
    })
  })

  it('preserves the supplied point-click interaction', async () => {
    const click = vi.fn()
    render(
      <TraceScatterChart
        option={option}
        searchRange={range}
        onSelectRange={vi.fn()}
        onEvents={{ click }}
      />,
    )
    await waitFor(() => expect(chart.props).not.toBeNull())
    const point = { data: { traceId: 'trace-one' } }

    chart.props?.onEvents.click(point)

    expect(click).toHaveBeenCalledWith(point)
  })
})

it('fits the active interval and restores frozen loaded bounds without drifting a relative range', () => {
  const loadedRange = { startMs: 100000, endMs: 3700000 }
  const rolling = { kind: 'rolling' as const, amount: 1, unit: 'hour' as const }
  const props = {
    option,
    searchRange: rolling,
    loadedRange,
    onSelectRange: vi.fn(),
  }
  const view = render(<TraceScatterChart {...props} />)
  expect(chart.props?.option.xAxis).toMatchObject({ min: 100000, max: 3700000 })
  view.rerender(
    <TraceScatterChart
      {...props}
      localRange={{ startMs: 125678, endMs: 160999 }}
    />,
  )
  expect(chart.props?.option.xAxis).toMatchObject({ min: 125678, max: 160999 })
  view.rerender(
    <TraceScatterChart
      {...props}
      option={{ series: [] }}
      localRange={{ startMs: 140000, endMs: 140001 }}
    />,
  )
  expect(chart.props?.option.xAxis).toMatchObject({ min: 140000, max: 140001 })
  view.rerender(<TraceScatterChart {...props} localRange={null} />)
  expect(chart.props?.option.xAxis).toMatchObject({ min: 100000, max: 3700000 })
})
