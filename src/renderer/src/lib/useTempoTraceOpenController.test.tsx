// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { run, api } = vi.hoisted(() => {
  const run = vi.fn()
  return { run, api: { tempoPerformanceEnabled: false, query: { run } } }
})
vi.mock('./api', () => ({ api }))

import { tempoTraceLookupRequest } from './traceCohort'
import { useTempoTraceOpenController } from './useTempoTraceOpenController'

const traceId = '000000000000000000000000000000ab'
const searchRow = { traceId: 'ab', startTimeMs: 10_000, durationMs: 2_000 }
const spanResult = (rows: Record<string, unknown>[], requestId = 'request-1') => ({
  columns: [{ name: 'spanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' }],
  rows,
  rowCount: rows.length,
  durationMs: 1,
  execution: { requestId }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('useTempoTraceOpenController', () => {
  beforeEach(() => {
    run.mockReset()
    api.tempoPerformanceEnabled = false
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('rejects an invalid trace ID without executing or disturbing loaded state', async () => {
    const onError = vi.fn()
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError }))
    await act(() => hook.result.current.openTrace({ candidate: 'not-a-trace', searchRows: [] }))
    expect(run).not.toHaveBeenCalled()
    expect(hook.result.current.traceLoading).toBe(false)
    expect(hook.result.current.spans).toEqual([])
    expect(onError).toHaveBeenCalledWith('Trace ID must be a hexadecimal identifier up to 32 characters.')
  })

  it('canonicalizes an ID and uses search-result lookup context', async () => {
    run.mockResolvedValue(spanResult([{ spanId: 'root' }]))
    const onOpenStart = vi.fn()
    const onTraceOpened = vi.fn()
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError: vi.fn(), onOpenStart, onTraceOpened }))
    await act(() => hook.result.current.openTrace({ candidate: ' AB ', searchRows: [searchRow] }))
    expect(run).toHaveBeenCalledWith('tempo-1', traceId, [], tempoTraceLookupRequest(searchRow), undefined, true)
    expect(onOpenStart).toHaveBeenCalledWith(traceId)
    expect(onTraceOpened).toHaveBeenCalledTimes(1)
    expect(hook.result.current.spans).toEqual([{ spanId: 'root' }])
    expect(hook.result.current.traceLoading).toBe(false)
  })

  it('uses no lookup request for a direct ID', async () => {
    run.mockResolvedValue(spanResult([{ spanId: 'root' }]))
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError: vi.fn() }))
    await act(() => hook.result.current.openTrace({ candidate: 'cd', searchRows: [searchRow] }))
    expect(run).toHaveBeenCalledWith('tempo-1', '000000000000000000000000000000cd', [], undefined, undefined, true)
  })

  it('propagates known opened status but not unknown status', async () => {
    const onTraceStatusResolved = vi.fn()
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError: vi.fn(), onTraceStatusResolved }))
    run.mockResolvedValueOnce(spanResult([{ spanId: 'root', status: 'ok', startTimeMs: 1 }]))
    await act(() => hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }))
    expect(onTraceStatusResolved).toHaveBeenCalledWith(traceId, 'ok')

    onTraceStatusResolved.mockClear()
    run.mockResolvedValueOnce(spanResult([{ spanId: 'root', status: 'unknown', startTimeMs: 1 }]))
    await act(() => hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }))
    expect(onTraceStatusResolved).not.toHaveBeenCalled()
  })

  it('rejects search-shaped responses and reports API failures without sticking loading', async () => {
    const onError = vi.fn()
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError }))
    run.mockResolvedValueOnce({ ...spanResult([]), columns: [{ name: 'traceId' }] })
    await act(() => hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }))
    expect(onError).toHaveBeenLastCalledWith('Tempo returned search results instead of the requested trace.')
    expect(hook.result.current.traceLoading).toBe(false)

    run.mockRejectedValueOnce(new Error('Tempo unavailable'))
    await act(() => hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }))
    expect(onError).toHaveBeenLastCalledWith('Tempo unavailable')
    expect(hook.result.current.traceLoading).toBe(false)
  })

  it('preserves loaded spans when a later open fails and resets them explicitly', async () => {
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError: vi.fn() }))
    const loaded = [{ spanId: 'existing' }]
    run.mockResolvedValueOnce(spanResult(loaded)).mockRejectedValueOnce(new Error('missing'))
    await act(() => hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }))
    await act(() => hook.result.current.openTrace({ candidate: 'cd', searchRows: [] }))
    expect(hook.result.current.spans).toEqual(loaded)
    act(() => hook.result.current.resetTrace())
    expect(hook.result.current.spans).toEqual([])
    expect(hook.result.current.traceLoading).toBe(false)
  })

  it('tracks loading while pending and preserves renderer/rendered instrumentation semantics', async () => {
    const pending = deferred<ReturnType<typeof spanResult>>()
    run.mockReturnValue(pending.promise)
    api.tempoPerformanceEnabled = true
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const hook = renderHook(() => useTempoTraceOpenController({ connectionId: 'tempo-1', onError: vi.fn() }))

    let opening!: Promise<void>
    act(() => { opening = hook.result.current.openTrace({ candidate: 'ab', searchRows: [searchRow] }) })
    expect(hook.result.current.traceLoading).toBe(true)
    await act(async () => { pending.resolve(spanResult([{ spanId: 'root' }], 'perf-request')); await opening })
    expect(info.mock.calls.some(([message]) => String(message).includes('"event":"trace.result-renderer"') && String(message).includes('"openSource":"search-result"'))).toBe(true)
    expect(frames).toHaveLength(1)
    act(() => frames[0](performance.now()))
    expect(info.mock.calls.some(([message]) => String(message).includes('"event":"trace.rendered"') && String(message).includes('"milestone":"animation-frame-after-commit"'))).toBe(true)
  })
})
