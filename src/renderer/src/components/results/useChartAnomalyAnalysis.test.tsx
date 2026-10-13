// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AiAnomalyAnalysis, AiResult } from '@shared/ai'
import type { QueryResult } from '@shared/types'
import { useChartAnomalyAnalysis } from './useChartAnomalyAnalysis'

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), cancel: vi.fn() }))
vi.mock('@lib/api', () => ({
  api: { ai: { analyzeAnomalies: mocks.analyze, cancel: mocks.cancel } },
}))
const success: AiResult<AiAnomalyAnalysis> = {
  ok: true,
  value: {
    summary: 'Current analysis',
    anomalies: [
      { seriesIndex: 0, pointIndex: 1, title: 'Spike', reason: 'High' },
    ],
    limitations: ['Sample only'],
    followUps: [],
  },
}
function deferred() {
  let resolve!: (value: AiResult<AiAnomalyAnalysis>) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<AiResult<AiAnomalyAnalysis>>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const input = {
  owner: {},
  result: { columns: [], rows: [], rowCount: 0, durationMs: 1 } as QueryResult,
  contextKey: 'revision A',
  configured: true,
  chart: {
    renderable: true,
    labels: ['a', 'b', 'c'],
    xValues: [10, 20, 30],
    seriesValues: [null],
    series: [{ name: 'value', data: [1, 100, 2] }],
  },
  configuration: {
    view: 'line' as const,
    xColumn: 'time',
    valueColumn: 'value',
    seriesColumn: null,
    aggregation: 'sum' as const,
  },
  seriesVisibility: {},
  isResultStale: false,
}
beforeEach(() => {
  mocks.analyze.mockReset().mockResolvedValue(success)
  mocks.cancel.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

it('requires explicit action and retains exact submitted samples locally', async () => {
  const { result } = renderHook(() => useChartAnomalyAnalysis(input))
  expect(mocks.analyze).not.toHaveBeenCalled()
  await act(async () => result.current.analyze())
  expect(result.current.analysis).toEqual(success.ok && success.value)
  expect(result.current.submittedSamples?.[0].sample.points[1]).toEqual({
    x: 20,
    y: 100,
    originalIndex: 1,
  })
  expect(mocks.analyze.mock.calls[0][0].chart.series[0].points[1]).toEqual({
    x: 20,
    y: 100,
  })
  expect(result.current.analyzing).toBe(false)
  await act(async () => result.current.analyze())
  expect(mocks.analyze).toHaveBeenCalledTimes(2)
})

it.each(['provider', 'rejection'])(
  'cleans up %s failure and allows explicit retry',
  async (kind) => {
    if (kind === 'provider')
      mocks.analyze.mockResolvedValueOnce({
        ok: false,
        code: 'provider',
        message: 'Unavailable',
      })
    else mocks.analyze.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useChartAnomalyAnalysis(input))
    await act(async () => result.current.analyze())
    expect(result.current.error).toContain(
      kind === 'provider' ? 'Unavailable' : 'try again',
    )
    expect(result.current.analyzing).toBe(false)
    await act(async () => result.current.analyze())
    expect(result.current.error).toBe('')
    expect(result.current.analysis).toEqual(success.ok && success.value)
  },
)

it.each(['success', 'failure'])(
  'ignores old %s after newer success',
  async (kind) => {
    const a = deferred(),
      b = deferred()
    mocks.analyze.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const { result } = renderHook(() => useChartAnomalyAnalysis(input))
    let first!: Promise<void>, second!: Promise<void>
    act(() => {
      first = result.current.analyze()
    })
    act(() => {
      second = result.current.analyze()
    })
    expect(mocks.cancel).toHaveBeenCalledWith(
      mocks.analyze.mock.calls[0][0].requestId,
    )
    await act(async () => {
      b.resolve(success)
      await second
    })
    await act(async () => {
      if (kind === 'success')
        a.resolve({
          ok: true,
          value: {
            summary: 'Obsolete',
            anomalies: [],
            limitations: [],
            followUps: [],
          },
        })
      else a.reject(new Error('obsolete failure'))
      await first
    })
    expect(result.current.analysis).toEqual(success.ok && success.value)
    expect(result.current.error).toBe('')
    expect(result.current.analyzing).toBe(false)
  },
)

it('old completion cannot clear loading of a newer request', async () => {
  const a = deferred(),
    b = deferred()
  mocks.analyze.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const { result } = renderHook(() => useChartAnomalyAnalysis(input))
  let first!: Promise<void>, second!: Promise<void>
  act(() => {
    first = result.current.analyze()
  })
  act(() => {
    second = result.current.analyze()
  })
  await act(async () => {
    a.resolve(success)
    await first
  })
  expect(result.current.analyzing).toBe(true)
  expect(result.current.analysis).toBeNull()
  await act(async () => {
    b.resolve(success)
    await second
  })
  expect(result.current.analyzing).toBe(false)
})

it.each(['revision', 'data'])(
  'invalidates pending and completed analysis on %s replacement',
  async (kind) => {
    const a = deferred()
    mocks.analyze.mockReturnValueOnce(a.promise)
    const { result, rerender } = renderHook(useChartAnomalyAnalysis, {
      initialProps: input,
    })
    let first!: Promise<void>
    act(() => {
      first = result.current.analyze()
    })
    const next =
      kind === 'revision'
        ? { ...input, contextKey: 'revision B' }
        : { ...input, result: { ...input.result, rows: [{ value: 3 }] } }
    rerender(next)
    expect(result.current.analyzing).toBe(false)
    expect(mocks.cancel).toHaveBeenCalledOnce()
    await act(async () => {
      a.resolve(success)
      await first
    })
    expect(result.current.analysis).toBeNull()
    await act(async () => result.current.analyze())
    expect(result.current.analysis).not.toBeNull()
    rerender({ ...next, contextKey: 'revision C' })
    expect(result.current.analysis).toBeNull()
    expect(result.current.submittedSamples).toBeNull()
    expect(result.current.anomaliesVisible).toBe(false)
  },
)

it('cancels on unmount, ignores late failure, and refuses a retained action', async () => {
  const a = deferred()
  mocks.analyze.mockReturnValueOnce(a.promise)
  const { result, unmount } = renderHook(() => useChartAnomalyAnalysis(input))
  const analyze = result.current.analyze
  let pending!: Promise<void>
  act(() => {
    pending = analyze()
  })
  unmount()
  expect(mocks.cancel).toHaveBeenCalledOnce()
  await act(async () => {
    a.reject(new Error('late'))
    await pending
    await analyze()
  })
  expect(mocks.analyze).toHaveBeenCalledOnce()
})

it('preserves samples and toggle across visibility changes with no request', async () => {
  const { result, rerender } = renderHook(useChartAnomalyAnalysis, {
    initialProps: input,
  })
  await act(async () => result.current.analyze())
  const samples = result.current.submittedSamples
  act(() => result.current.setAnomaliesVisible(() => false))
  rerender({ ...input, seriesVisibility: { value: false } })
  rerender({ ...input, seriesVisibility: {} })
  expect(result.current.submittedSamples).toBe(samples)
  expect(result.current.anomaliesVisible).toBe(false)
  expect(mocks.analyze).toHaveBeenCalledOnce()
  expect(mocks.cancel).not.toHaveBeenCalled()
})

it('cancels pending work when AI is disabled and remains usable when re-enabled', async () => {
  const a = deferred()
  mocks.analyze.mockReturnValueOnce(a.promise)
  const { result, rerender } = renderHook(useChartAnomalyAnalysis, {
    initialProps: input,
  })
  let pending!: Promise<void>
  act(() => {
    pending = result.current.analyze()
  })
  rerender({ ...input, configured: false })
  await act(async () => {
    a.resolve(success)
    await pending
    await result.current.analyze()
  })
  expect(result.current.analysis).toBeNull()
  expect(result.current.analyzing).toBe(false)
  expect(mocks.analyze).toHaveBeenCalledOnce()
  rerender(input)
  await act(async () => result.current.analyze())
  expect(result.current.analysis).not.toBeNull()
})

it('keeps sampling limits and excludes source rows and point indexes from IPC', async () => {
  const series = Array.from({ length: 12 }, (_, index) => ({
    name: String(index),
    data: Array.from({ length: 400 }, (_, x) => x),
  }))
  const { result } = renderHook(() =>
    useChartAnomalyAnalysis({
      ...input,
      chart: { ...input.chart, series, xValues: series[0].data },
    }),
  )
  await act(async () => result.current.analyze())
  const request = mocks.analyze.mock.calls[0][0]
  expect(Object.keys(request)).toEqual(['requestId', 'chart'])
  expect(request.chart.series).toHaveLength(8)
  for (const sample of request.chart.series) {
    expect(sample.points.length).toBeLessThanOrEqual(32)
    for (const point of sample.points)
      expect(Object.keys(point)).toEqual(['x', 'y'])
  }
})

it('invalidates a replacement even when no visible series has enough points', async () => {
  const a = deferred()
  mocks.analyze.mockReturnValueOnce(a.promise)
  const { result, rerender } = renderHook(useChartAnomalyAnalysis, {
    initialProps: input,
  })
  let pending!: Promise<void>
  act(() => {
    pending = result.current.analyze()
  })
  rerender({ ...input, seriesVisibility: { value: false } })
  await act(async () => result.current.analyze())
  expect(result.current.error).toContain('three numeric points')
  expect(result.current.analyzing).toBe(false)
  await act(async () => {
    a.resolve(success)
    await pending
  })
  expect(result.current.analysis).toBeNull()
  expect(result.current.error).toContain('three numeric points')
})
