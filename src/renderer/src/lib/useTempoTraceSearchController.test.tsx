// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./api', () => ({ api: { tempoPerformanceEnabled: false, query: { run } } }))

import { useTempoTraceSearchController } from './useTempoTraceSearchController'
import { selectActiveSession, useStore } from '@store/useStore'

const range = { kind: 'rolling', amount: 1, unit: 'hour' } as const
const progress = (rows: Record<string, unknown>[]) => ({
  provider: 'tempo' as const, coveredMs: 1, totalMs: 2, completedChunks: 1,
  pendingChunks: 1, queriesCompleted: 1, tracesFound: rows.length, rows
})
const result = (rows: Record<string, unknown>[], notice?: string) => ({
  columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' as const }],
  rows, rowCount: rows.length, durationMs: 1, notice
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('useTempoTraceSearchController', () => {
  beforeEach(() => {
    run.mockReset()
    useStore.setState(useStore.getInitialState(), true)
  })
  afterEach(cleanup)

  it('owns start, progressive merge/order, and successful final state', async () => {
    const pending = deferred<ReturnType<typeof result>>()
    run.mockReturnValue(pending.promise)
    const onSearchStart = vi.fn()
    const onError = vi.fn()
    const hook = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onSearchStart, onError }))

    let search!: Promise<void>
    act(() => { search = hook.result.current.runSearch({ query: '{ }', sampleSize: '250', range }) })
    expect(hook.result.current.searching).toBe(true)
    expect(hook.result.current.searchRows).toEqual([])
    expect(hook.result.current.searchProgress).toBeNull()
    expect(hook.result.current.searchNotice).toBe('Fetching a quick sample of up to 250 traces across the selected period…')
    expect(onSearchStart).toHaveBeenCalledTimes(1)

    const emit = run.mock.calls[0][4]
    act(() => emit(progress([
      { traceId: 'b', startTimeMs: 20, status: 'error' },
      { traceId: 'a', startTimeMs: 20, status: 'ok' },
      { traceId: 'c', startTimeMs: 30 }
    ]), 'request-1'))
    act(() => emit(progress([{ traceId: 'b', startTimeMs: 40, status: 'unknown' }]), 'request-1'))
    expect(hook.result.current.searchRows.map((row) => row.traceId)).toEqual(['b', 'c', 'a'])
    expect(hook.result.current.searchRows[0]?.status).toBe('error')
    expect(hook.result.current.searchProgress?.tracesFound).toBe(1)

    const finalRows = [{ traceId: 'final', startTimeMs: 1 }]
    await act(async () => { pending.resolve(result(finalRows, 'Finished')); await search })
    expect(hook.result.current.searchRows).toEqual(finalRows)
    expect(hook.result.current.searchNotice).toBe('Finished')
    expect(hook.result.current.searchProgress).toBeNull()
    expect(hook.result.current.searching).toBe(false)
    expect(selectActiveSession(useStore.getState()).result?.rows).toEqual(finalRows)
    expect(onError).not.toHaveBeenCalled()
  })

  it('restores a completed search result after the workspace remounts', () => {
    const stored = result([{ traceId: 'stored', startTimeMs: 42 }], 'Stored result')
    const tabId = useStore.getState().activeTabId
    useStore.getState().completeQuery(stored, null, tabId)

    const first = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onError: vi.fn() }))
    expect(first.result.current.searchRows).toEqual(stored.rows)
    expect(first.result.current.searchNotice).toBe('Stored result')
    first.unmount()

    const second = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onError: vi.fn() }))
    expect(second.result.current.searchRows).toEqual(stored.rows)
    expect(second.result.current.searchNotice).toBe('Stored result')
  })

  it.each([
    ['250' as const, 'Sample search stopped before Tempo returned its bounded result set.'],
    ['all' as const, 'Search stopped before the selected period was fully covered; partial results found so far are shown.']
  ])('retains partial rows after a %s search failure', async (sampleSize, notice) => {
    const pending = deferred<ReturnType<typeof result>>()
    run.mockReturnValue(pending.promise)
    const onError = vi.fn()
    const hook = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onError }))
    let search!: Promise<void>
    act(() => { search = hook.result.current.runSearch({ query: '{ }', sampleSize, range }) })
    act(() => run.mock.calls[0][4](progress([{ traceId: 'partial', startTimeMs: 1 }]), 'request-1'))
    await act(async () => { pending.resolve({ ...result([]), columns: [{ name: 'spanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' }] }); await search })
    expect(hook.result.current.searchRows).toHaveLength(1)
    expect(hook.result.current.searchNotice).toBe(notice)
    expect(hook.result.current.searchProgress).toBeNull()
    expect(hook.result.current.searching).toBe(false)
    expect(onError).toHaveBeenCalledWith('TraceQL search returned a trace instead of search results.')
  })

  it('rejects recurring windows before starting an execution', async () => {
    const onError = vi.fn()
    const onSearchStart = vi.fn()
    const hook = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onError, onSearchStart }))
    await act(() => hook.result.current.runSearch({ query: '{ }', sampleSize: '100', range: { ...range, recurringWindows: [{ id: 'window-1', from: '09:00', to: '10:00' }] } }))
    expect(run).not.toHaveBeenCalled()
    expect(onSearchStart).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Recurring daily windows are not supported for Tempo trace searches yet. Choose a continuous range.')
  })

  it('reports failed range conversion without executing', async () => {
    const onError = vi.fn()
    const hook = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onError }))
    await act(() => hook.result.current.runSearch({ query: '{ }', sampleSize: 'all', range: { kind: 'custom', startDate: null, startTime: '00:00', endDate: null, endTime: '00:00' } }))
    expect(run).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('rejects a span-shaped response as a search result', async () => {
    run.mockResolvedValue({ ...result([]), columns: [{ name: 'spanId' }] })
    const onError = vi.fn()
    const hook = renderHook(() => useTempoTraceSearchController({ connectionId: 'tempo-1', onError }))
    await act(() => hook.result.current.runSearch({ query: '{ }', sampleSize: '100', range }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('TraceQL search returned a trace instead of search results.'))
  })
})
