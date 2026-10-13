// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { run, api } = vi.hoisted(() => {
  const run = vi.fn()
  return { run, api: { tempoPerformanceEnabled: false, query: { run } } }
})
vi.mock('./api', () => ({ api }))

import { bindTabConnection } from './tabConnection'
import { tempoTraceLookupRequest } from './traceCohort'
import { useTempoTraceOpenController } from './useTempoTraceOpenController'
import { useStore } from '@store/useStore'

const traceId = '000000000000000000000000000000ab'
const searchRow = { traceId: 'ab', startTimeMs: 10_000, durationMs: 2_000 }
const spanResult = (
  rows: Record<string, unknown>[],
  requestId = 'request-1',
) => ({
  columns: [
    {
      name: 'spanId',
      dataTypeID: 0,
      dataTypeName: 'text',
      logicalType: 'string',
    },
  ],
  rows,
  rowCount: rows.length,
  durationMs: 1,
  execution: { requestId },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('useTempoTraceOpenController', () => {
  beforeEach(() => {
    run.mockReset()
    api.tempoPerformanceEnabled = false
    useStore.setState(useStore.getInitialState(), true)
    useStore.setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeTabId
          ? { ...tab, connectionProfileId: 'tempo-1' }
          : tab,
      ),
      connectionStateByProfileId: {
        'tempo-1': {
          status: 'connected',
          generation: 1,
          error: null,
          serverVersion: null,
        },
      },
    }))
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('rejects an invalid trace ID without executing or disturbing loaded state', async () => {
    const onError = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceOpenController({ connectionId: 'tempo-1', onError }),
    )
    await act(() =>
      hook.result.current.openTrace({
        candidate: 'not-a-trace',
        searchRows: [],
      }),
    )
    expect(run).not.toHaveBeenCalled()
    expect(hook.result.current.traceLoading).toBe(false)
    expect(hook.result.current.spans).toEqual([])
    expect(onError).toHaveBeenCalledWith(
      'Trace ID must be a hexadecimal identifier up to 32 characters.',
    )
  })

  it('canonicalizes an ID and uses search-result lookup context', async () => {
    run.mockResolvedValue(spanResult([{ spanId: 'root' }]))
    const onOpenStart = vi.fn()
    const onTraceOpened = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceOpenController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
        onOpenStart,
        onTraceOpened,
      }),
    )
    await act(() =>
      hook.result.current.openTrace({
        candidate: ' AB ',
        searchRows: [searchRow],
      }),
    )
    expect(run).toHaveBeenCalledWith(
      'tempo-1',
      traceId,
      [],
      tempoTraceLookupRequest(searchRow),
      undefined,
      true,
    )
    expect(onOpenStart).toHaveBeenCalledWith(traceId)
    expect(onTraceOpened).toHaveBeenCalledTimes(1)
    expect(hook.result.current.spans).toEqual([{ spanId: 'root' }])
    expect(hook.result.current.traceLoading).toBe(false)
  })

  it('uses no lookup request for a direct ID', async () => {
    run.mockResolvedValue(spanResult([{ spanId: 'root' }]))
    const hook = renderHook(() =>
      useTempoTraceOpenController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
      }),
    )
    await act(() =>
      hook.result.current.openTrace({
        candidate: 'cd',
        searchRows: [searchRow],
      }),
    )
    expect(run).toHaveBeenCalledWith(
      'tempo-1',
      '000000000000000000000000000000cd',
      [],
      undefined,
      undefined,
      true,
    )
  })

  it('propagates known opened status but not unknown status', async () => {
    const onTraceStatusResolved = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceOpenController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
        onTraceStatusResolved,
      }),
    )
    run.mockResolvedValueOnce(
      spanResult([{ spanId: 'root', status: 'ok', startTimeMs: 1 }]),
    )
    await act(() =>
      hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }),
    )
    expect(onTraceStatusResolved).toHaveBeenCalledWith(traceId, 'ok')

    onTraceStatusResolved.mockClear()
    run.mockResolvedValueOnce(
      spanResult([{ spanId: 'root', status: 'unknown', startTimeMs: 1 }]),
    )
    await act(() =>
      hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }),
    )
    expect(onTraceStatusResolved).not.toHaveBeenCalled()
  })

  it('rejects search-shaped responses and reports API failures without sticking loading', async () => {
    const onError = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceOpenController({ connectionId: 'tempo-1', onError }),
    )
    run.mockResolvedValueOnce({
      ...spanResult([]),
      columns: [{ name: 'traceId' }],
    })
    await act(() =>
      hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }),
    )
    expect(onError).toHaveBeenLastCalledWith(
      'Tempo returned search results instead of the requested trace.',
    )
    expect(hook.result.current.traceLoading).toBe(false)

    run.mockRejectedValueOnce(new Error('Tempo unavailable'))
    await act(() =>
      hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }),
    )
    expect(onError).toHaveBeenLastCalledWith('Tempo unavailable')
    expect(hook.result.current.traceLoading).toBe(false)
  })

  it('preserves loaded spans when a later open fails and resets them explicitly', async () => {
    const hook = renderHook(() =>
      useTempoTraceOpenController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
      }),
    )
    const loaded = [{ spanId: 'existing' }]
    run
      .mockResolvedValueOnce(spanResult(loaded))
      .mockRejectedValueOnce(new Error('missing'))
    await act(() =>
      hook.result.current.openTrace({ candidate: 'ab', searchRows: [] }),
    )
    await act(() =>
      hook.result.current.openTrace({ candidate: 'cd', searchRows: [] }),
    )
    expect(hook.result.current.spans).toEqual(loaded)
    act(() => hook.result.current.resetTrace())
    expect(hook.result.current.spans).toEqual([])
    expect(hook.result.current.traceLoading).toBe(false)
  })

  it.each(['success', 'failure'] as const)(
    'preserves newer detail and loading when an older %s completes',
    async (outcome) => {
      const old = deferred<ReturnType<typeof spanResult>>()
      const next = deferred<ReturnType<typeof spanResult>>()
      run.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
      const onError = vi.fn(),
        onTraceOpened = vi.fn()
      const hook = renderHook(() =>
        useTempoTraceOpenController({
          connectionId: 'tempo-1',
          onError,
          onTraceOpened,
        }),
      )
      let oldWork!: Promise<void>, nextWork!: Promise<void>
      act(() => {
        oldWork = hook.result.current.openTrace({
          candidate: 'ab',
          searchRows: [],
        })
      })
      act(() => {
        nextWork = hook.result.current.openTrace({
          candidate: 'cd',
          searchRows: [],
        })
      })
      await act(async () => {
        if (outcome === 'success') old.resolve(spanResult([{ spanId: 'old' }]))
        else old.reject(new Error('old detail'))
        await oldWork
      })
      expect(hook.result.current.traceLoading).toBe(true)
      expect(hook.result.current.spans).toEqual([])
      expect(onError).not.toHaveBeenCalled()
      expect(onTraceOpened).not.toHaveBeenCalled()
      await act(async () => {
        next.resolve(spanResult([{ spanId: 'new' }]))
        await nextWork
      })
      expect(hook.result.current.traceLoading).toBe(false)
      expect(hook.result.current.spans).toEqual([{ spanId: 'new' }])
      expect(onTraceOpened).toHaveBeenCalledTimes(1)
    },
  )

  // #365 Phase 3A: local detail work must end at reset/unmount, not just tab change.
  it.each(['success', 'failure'] as const)(
    'ignores detail %s after reset without a replacement request',
    async (outcome) => {
      const pending = deferred<ReturnType<typeof spanResult>>()
      run.mockReturnValueOnce(pending.promise)
      const onError = vi.fn(),
        onTraceOpened = vi.fn()
      const hook = renderHook(() =>
        useTempoTraceOpenController({
          connectionId: 'tempo-1',
          onError,
          onTraceOpened,
        }),
      )
      let work!: Promise<void>
      act(() => {
        work = hook.result.current.openTrace({
          candidate: 'ab',
          searchRows: [],
        })
      })
      act(() => hook.result.current.resetTrace())
      await act(async () => {
        if (outcome === 'success')
          pending.resolve(spanResult([{ spanId: 'obsolete' }]))
        else pending.reject(new Error('obsolete detail failure'))
        await work
      })
      expect(hook.result.current.spans).toEqual([])
      expect(onTraceOpened).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(hook.result.current.traceLoading).toBe(false)
    },
  )

  it('ignores detail callbacks after unmount while its originating tab remains active', async () => {
    const pending = deferred<ReturnType<typeof spanResult>>()
    run.mockReturnValueOnce(pending.promise)
    const onError = vi.fn(),
      onTraceOpened = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceOpenController({
        connectionId: 'tempo-1',
        onError,
        onTraceOpened,
      }),
    )
    let work!: Promise<void>
    act(() => {
      work = hook.result.current.openTrace({
        candidate: 'ab',
        searchRows: [],
      })
    })
    hook.unmount()
    await act(async () => {
      pending.resolve(spanResult([{ spanId: 'obsolete' }]))
      await work
    })
    expect(onTraceOpened).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'] as const)(
    'reset permits a new open while obsolete %s cannot clear its loading',
    async (outcome) => {
      const old = deferred<ReturnType<typeof spanResult>>()
      const next = deferred<ReturnType<typeof spanResult>>()
      run.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
      const onError = vi.fn(),
        onTraceOpened = vi.fn(),
        onTraceStatusResolved = vi.fn()
      const hook = renderHook(() =>
        useTempoTraceOpenController({
          connectionId: 'tempo-1',
          onError,
          onTraceOpened,
          onTraceStatusResolved,
        }),
      )
      let oldWork!: Promise<void>, nextWork!: Promise<void>
      act(() => {
        oldWork = hook.result.current.openTrace({
          candidate: 'ab',
          searchRows: [],
        })
      })
      act(() => hook.result.current.resetTrace())
      expect(hook.result.current.traceLoading).toBe(false)
      act(() => {
        nextWork = hook.result.current.openTrace({
          candidate: 'cd',
          searchRows: [],
        })
      })
      await act(async () => {
        if (outcome === 'success')
          old.resolve(spanResult([{ spanId: 'old', status: 'error' }]))
        else old.reject(new Error('obsolete failure'))
        await oldWork
      })
      expect(hook.result.current.traceLoading).toBe(true)
      expect(hook.result.current.spans).toEqual([])
      expect(onError).not.toHaveBeenCalled()
      expect(onTraceOpened).not.toHaveBeenCalled()
      expect(onTraceStatusResolved).not.toHaveBeenCalled()
      await act(async () => {
        next.resolve(spanResult([{ spanId: 'new', status: 'ok' }]))
        await nextWork
      })
      expect(hook.result.current.traceLoading).toBe(false)
      expect(hook.result.current.spans).toEqual([
        { spanId: 'new', status: 'ok' },
      ])
      expect(onTraceOpened).toHaveBeenCalledTimes(1)
      expect(onTraceStatusResolved).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['success', 'failure'] as const)(
    'same-tab remount owns fresh work independently of removed controller %s',
    async (outcome) => {
      const old = deferred<ReturnType<typeof spanResult>>()
      const next = deferred<ReturnType<typeof spanResult>>()
      run.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
      const onError = vi.fn(),
        onTraceOpened = vi.fn(),
        onOpenStart = vi.fn(),
        onTraceStatusResolved = vi.fn()
      const options = {
        connectionId: 'tempo-1',
        onError,
        onTraceOpened,
        onOpenStart,
        onTraceStatusResolved,
      }
      const hook = renderHook(() => useTempoTraceOpenController(options))
      const retained = hook.result.current.openTrace
      let oldWork!: Promise<void>, nextWork!: Promise<void>
      act(() => {
        oldWork = retained({ candidate: 'ab', searchRows: [] })
      })
      hook.unmount()
      onOpenStart.mockClear()
      await retained({ candidate: 'cd', searchRows: [] })
      await retained({ candidate: 'invalid', searchRows: [] })
      expect(run).toHaveBeenCalledTimes(1)
      expect(onOpenStart).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      const remount = renderHook(() => useTempoTraceOpenController(options))
      act(() => {
        nextWork = remount.result.current.openTrace({
          candidate: 'cd',
          searchRows: [],
        })
      })
      await act(async () => {
        if (outcome === 'success')
          old.resolve(spanResult([{ spanId: 'old', status: 'error' }]))
        else old.reject(new Error('removed controller'))
        await oldWork
      })
      expect(remount.result.current.traceLoading).toBe(true)
      expect(remount.result.current.spans).toEqual([])
      expect(onError).not.toHaveBeenCalled()
      expect(onTraceOpened).not.toHaveBeenCalled()
      expect(onTraceStatusResolved).not.toHaveBeenCalled()
      await act(async () => {
        next.resolve(spanResult([{ spanId: 'new' }]))
        await nextWork
      })
      expect(remount.result.current.traceLoading).toBe(false)
      expect(remount.result.current.spans).toEqual([{ spanId: 'new' }])
      expect(onTraceOpened).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['profile', 'generation', 'context', 'rebind-away/back'] as const)(
    'rejects pending details after %s replacement and allows explicit recovery',
    async (replacement) => {
      const pending = deferred<ReturnType<typeof spanResult>>()
      run.mockReturnValueOnce(pending.promise)
      const onError = vi.fn(),
        onTraceOpened = vi.fn()
      const hook = renderHook(() =>
        useTempoTraceOpenController({
          connectionId: 'tempo-1',
          onError,
          onTraceOpened,
        }),
      )
      let work!: Promise<void>
      act(() => {
        work = hook.result.current.openTrace({
          candidate: 'ab',
          searchRows: [],
        })
      })
      act(() => {
        useStore.setState((state) => ({
          tabs: state.tabs.map((tab) => ({
            ...tab,
            ...(replacement === 'profile'
              ? { connectionProfileId: 'tempo-2' }
              : {}),
            ...(replacement === 'context'
              ? { queryContextId: 'replacement' }
              : {}),
          })),
          connectionStateByProfileId: {
            ...state.connectionStateByProfileId,
            'tempo-1': {
              ...state.connectionStateByProfileId['tempo-1'],
              generation: replacement === 'generation' ? 2 : 1,
            },
          },
        }))
      })
      if (replacement === 'rebind-away/back') {
        act(() => {
          const tabId = useStore.getState().activeTabId
          bindTabConnection(tabId, 'tempo-2')
          bindTabConnection(tabId, 'tempo-1')
        })
      }
      await act(async () => {
        pending.resolve(spanResult([{ spanId: 'old' }]))
        await work
      })
      expect(onTraceOpened).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(hook.result.current.spans).toEqual([])
      act(() => hook.result.current.resetTrace())
      expect(hook.result.current.traceLoading).toBe(false)
      act(() =>
        useStore.setState((state) => ({
          tabs: state.tabs.map((tab) => ({
            ...tab,
            connectionProfileId: 'tempo-1',
          })),
        })),
      )
      run.mockResolvedValueOnce(spanResult([{ spanId: 'recovered' }]))
      await act(() =>
        hook.result.current.openTrace({ candidate: 'cd', searchRows: [] }),
      )
      expect(hook.result.current.spans).toEqual([{ spanId: 'recovered' }])
      expect(onTraceOpened).toHaveBeenCalledTimes(1)
    },
  )

  it('tracks loading while pending and preserves renderer/rendered instrumentation semantics', async () => {
    const pending = deferred<ReturnType<typeof spanResult>>()
    run.mockReturnValue(pending.promise)
    api.tempoPerformanceEnabled = true
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback)
        return frames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const hook = renderHook(() =>
      useTempoTraceOpenController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
      }),
    )

    let opening!: Promise<void>
    act(() => {
      opening = hook.result.current.openTrace({
        candidate: 'ab',
        searchRows: [searchRow],
      })
    })
    expect(hook.result.current.traceLoading).toBe(true)
    await act(async () => {
      pending.resolve(spanResult([{ spanId: 'root' }], 'perf-request'))
      await opening
    })
    expect(
      info.mock.calls.some(
        ([message]) =>
          String(message).includes('"event":"trace.result-renderer"') &&
          String(message).includes('"openSource":"search-result"'),
      ),
    ).toBe(true)
    expect(frames).toHaveLength(1)
    act(() => frames[0](performance.now()))
    expect(
      info.mock.calls.some(
        ([message]) =>
          String(message).includes('"event":"trace.rendered"') &&
          String(message).includes(
            '"milestone":"animation-frame-after-commit"',
          ),
      ),
    ).toBe(true)
  })
})

// #371: detail loading is local secondary work, unlike the stored search result.
it('does not deliver a background trace detail into another tab or keep that tab busy', async () => {
  useStore.setState(useStore.getInitialState(), true)
  useStore.setState((state) => ({
    tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: 'tempo-1' })),
    connectionStateByProfileId: {
      'tempo-1': {
        status: 'connected',
        generation: 1,
        error: null,
        serverVersion: null,
      },
    },
  }))
  const pending = deferred<ReturnType<typeof spanResult>>()
  run.mockReturnValueOnce(pending.promise)
  const opened = vi.fn(),
    error = vi.fn()
  const hook = renderHook(() =>
    useTempoTraceOpenController({
      connectionId: 'tempo-1',
      onError: error,
      onTraceOpened: opened,
    }),
  )
  let work!: Promise<void>
  act(() => {
    work = hook.result.current.openTrace({ candidate: traceId, searchRows: [] })
  })
  const owner = useStore.getState().activeTabId
  expect(
    useStore.getState().tabs.find((tab) => tab.id === owner)?.running,
  ).toBe(false)
  hook.unmount()
  act(() => useStore.getState().createTab())
  await act(async () => {
    pending.resolve(spanResult([{ spanId: 'a' }]))
    await work
  })
  expect(opened).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
  expect(
    useStore
      .getState()
      .tabs.every((tab) => !tab.running && tab.result === null),
  ).toBe(true)
  cleanup()
})
