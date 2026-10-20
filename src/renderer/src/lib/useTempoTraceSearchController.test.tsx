// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./api', () => ({
  api: { tempoPerformanceEnabled: false, query: { run } },
}))

import { useTempoTraceSearchController } from './useTempoTraceSearchController'
import {
  createQuerySession,
  selectActiveSession,
  useStore,
} from '@store/useStore'
import { bindTabConnection } from './tabConnection'

const range = { kind: 'rolling', amount: 1, unit: 'hour' } as const
const progress = (rows: Record<string, unknown>[]) => ({
  provider: 'tempo' as const,
  coveredMs: 1,
  totalMs: 2,
  completedChunks: 1,
  pendingChunks: 1,
  queriesCompleted: 1,
  tracesFound: rows.length,
  rows,
})
const result = (rows: Record<string, unknown>[], notice?: string) => ({
  columns: [
    {
      name: 'traceId',
      dataTypeID: 0,
      dataTypeName: 'text',
      logicalType: 'string' as const,
    },
  ],
  rows,
  rowCount: rows.length,
  durationMs: 1,
  notice,
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

describe('useTempoTraceSearchController', () => {
  beforeEach(() => {
    run.mockReset()
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
  afterEach(cleanup)

  it('owns start, progressive merge/order, and successful final state', async () => {
    const pending = deferred<ReturnType<typeof result>>()
    run.mockReturnValue(pending.promise)
    const onSearchStart = vi.fn()
    const onError = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceSearchController({
        connectionId: 'tempo-1',
        onSearchStart,
        onError,
      }),
    )

    let search!: Promise<void>
    act(() => {
      search = hook.result.current.runSearch({
        query: '{ }',
        sampleSize: '250',
        range,
      })
    })
    expect(hook.result.current.searching).toBe(true)
    expect(hook.result.current.searchRows).toEqual([])
    expect(hook.result.current.searchProgress).toBeNull()
    expect(hook.result.current.searchNotice).toBe(
      'Fetching a quick sample of up to 250 traces across the selected period…',
    )
    expect(onSearchStart).toHaveBeenCalledTimes(1)

    const emit = run.mock.calls[0][4]
    act(() =>
      emit(
        progress([
          { traceId: 'b', startTimeMs: 20, status: 'error' },
          { traceId: 'a', startTimeMs: 20, status: 'ok' },
          { traceId: 'c', startTimeMs: 30 },
        ]),
        'request-1',
      ),
    )
    act(() =>
      emit(
        progress([{ traceId: 'b', startTimeMs: 40, status: 'unknown' }]),
        'request-1',
      ),
    )
    expect(hook.result.current.searchRows.map((row) => row.traceId)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(hook.result.current.searchRows[0]?.status).toBe('error')
    expect(hook.result.current.searchProgress?.tracesFound).toBe(1)

    const finalRows = [{ traceId: 'final', startTimeMs: 1 }]
    await act(async () => {
      pending.resolve(result(finalRows, 'Finished'))
      await search
    })
    expect(hook.result.current.searchRows).toEqual(finalRows)
    expect(hook.result.current.searchNotice).toBe('Finished')
    expect(hook.result.current.searchProgress).toBeNull()
    expect(hook.result.current.searching).toBe(false)
    expect(selectActiveSession(useStore.getState()).result?.rows).toEqual(
      finalRows,
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it('restores a completed search result after the workspace remounts', () => {
    const stored = result(
      [{ traceId: 'stored', startTimeMs: 42 }],
      'Stored result',
    )
    const tabId = useStore.getState().activeTabId
    useStore.getState().completeQuery(stored, null, tabId)

    const first = renderHook(() =>
      useTempoTraceSearchController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
      }),
    )
    expect(first.result.current.searchRows).toEqual(stored.rows)
    expect(first.result.current.searchNotice).toBe('Stored result')
    first.unmount()

    const second = renderHook(() =>
      useTempoTraceSearchController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
      }),
    )
    expect(second.result.current.searchRows).toEqual(stored.rows)
    expect(second.result.current.searchNotice).toBe('Stored result')
  })

  it.each([
    [
      '250' as const,
      'Search stopped before completion; incomplete results have been cleared.',
    ],
    [
      'all' as const,
      'Search stopped before completion; incomplete results have been cleared.',
    ],
  ])(
    'clears incomplete rows after a %s search failure',
    async (sampleSize, notice) => {
      const pending = deferred<ReturnType<typeof result>>()
      run.mockReturnValue(pending.promise)
      const onError = vi.fn()
      const hook = renderHook(() =>
        useTempoTraceSearchController({ connectionId: 'tempo-1', onError }),
      )
      let search!: Promise<void>
      act(() => {
        search = hook.result.current.runSearch({
          query: '{ }',
          sampleSize,
          range,
        })
      })
      act(() =>
        run.mock.calls[0][4](
          progress([{ traceId: 'partial', startTimeMs: 1 }]),
          'request-1',
        ),
      )
      await act(async () => {
        pending.resolve({
          ...result([]),
          columns: [
            {
              name: 'spanId',
              dataTypeID: 0,
              dataTypeName: 'text',
              logicalType: 'string',
            },
          ],
        })
        await search
      })
      expect(hook.result.current.searchRows).toEqual([])
      expect(hook.result.current.searchNotice).toBe(notice)
      expect(hook.result.current.searchProgress).toBeNull()
      expect(hook.result.current.searching).toBe(false)
      expect(onError).toHaveBeenCalledWith(
        'TraceQL search returned a trace instead of search results.',
      )
    },
  )

  it('#486 retains failure coverage after replacing an earlier success and remounting', async () => {
    useStore.getState().completeQuery(result([{ traceId: 'previous' }]), null)
    const pending = deferred<ReturnType<typeof result>>()
    run.mockReturnValueOnce(pending.promise)
    const options = { connectionId: 'tempo-1', onError: vi.fn() }
    const hook = renderHook(() => useTempoTraceSearchController(options))
    let search!: Promise<void>
    act(() => {
      search = hook.result.current.runSearch({
        query: '{}',
        sampleSize: 'all',
        range,
      })
    })
    act(() => run.mock.calls[0][4](progress([{ traceId: 'incomplete' }]), 'B'))
    await act(async () => {
      pending.reject(new Error('B failed'))
      await search
    })
    expect(hook.result.current.searchRows).toEqual([])
    expect(hook.result.current.searchNotice).toBe(
      'Search stopped before completion; incomplete results have been cleared.',
    )
    expect(hook.result.current.searchError).toBe('B failed')
    hook.unmount()
    const restored = renderHook(() => useTempoTraceSearchController(options))
    expect(restored.result.current.searchRows).toEqual([])
    expect(restored.result.current.searchNotice).toBe(
      'Search stopped before completion; incomplete results have been cleared.',
    )
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('rejects recurring windows before starting an execution', async () => {
    const onError = vi.fn()
    const onSearchStart = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceSearchController({
        connectionId: 'tempo-1',
        onError,
        onSearchStart,
      }),
    )
    await act(() =>
      hook.result.current.runSearch({
        query: '{ }',
        sampleSize: '100',
        range: {
          ...range,
          recurringWindows: [{ id: 'window-1', from: '09:00', to: '10:00' }],
        },
      }),
    )
    expect(run).not.toHaveBeenCalled()
    expect(onSearchStart).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      'Recurring daily windows are not supported for Tempo trace searches yet. Choose a continuous range.',
    )
  })

  it('reports failed range conversion without executing', async () => {
    const onError = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceSearchController({ connectionId: 'tempo-1', onError }),
    )
    await act(() =>
      hook.result.current.runSearch({
        query: '{ }',
        sampleSize: 'all',
        range: {
          kind: 'custom',
          startDate: null,
          startTime: '00:00',
          endDate: null,
          endTime: '00:00',
        },
      }),
    )
    expect(run).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('rejects a span-shaped response as a search result', async () => {
    run.mockResolvedValue({ ...result([]), columns: [{ name: 'spanId' }] })
    const onError = vi.fn()
    const hook = renderHook(() =>
      useTempoTraceSearchController({ connectionId: 'tempo-1', onError }),
    )
    await act(() =>
      hook.result.current.runSearch({ query: '{ }', sampleSize: '100', range }),
    )
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'TraceQL search returned a trace instead of search results.',
      ),
    )
  })
})

// #371: requests must survive the same unmount that App's keyed shell performs.
describe('#371 Tempo search lifecycle', () => {
  beforeEach(() => {
    run.mockReset()
    useStore.setState(useStore.getInitialState(), true)
    useStore.setState({
      tabs: ['A', 'B'].map((id, i) =>
        createQuerySession(i + 1, { id, connectionProfileId: 'tempo-1' }),
      ),
      activeTabId: 'A',
      connectionStateByProfileId: {
        'tempo-1': {
          status: 'connected',
          generation: 1,
          error: null,
          serverVersion: null,
        },
      },
    })
  })
  afterEach(cleanup)
  const session = (id: string) =>
    useStore.getState().tabs.find((tab) => tab.id === id)
  function mount() {
    return renderHook(() =>
      useTempoTraceSearchController({
        connectionId: 'tempo-1',
        onError: vi.fn(),
      }),
    )
  }
  function start(
    hook: ReturnType<typeof mount>,
    pending: ReturnType<typeof deferred<ReturnType<typeof result>>>,
  ) {
    run.mockReturnValueOnce(pending.promise)
    let work!: Promise<void>
    act(() => {
      work = hook.result.current.runSearch({
        query: '{}',
        sampleSize: 'all',
        range,
      })
    })
    return work
  }

  it.each(['resolve', 'reject'] as const)(
    'delivers %s to background A after unmount',
    async (outcome) => {
      const hook = mount(),
        pending = deferred<ReturnType<typeof result>>()
      const work = start(hook, pending)
      hook.unmount()
      act(() => useStore.setState({ activeTabId: 'B' }))
      expect(session('A')?.running).toBe(true)
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(result([{ traceId: 'a' }]))
        else pending.reject(new Error('A failed'))
        await work
      })
      expect(session('A')?.running).toBe(false)
      expect(
        outcome === 'resolve'
          ? session('A')?.result?.rows
          : session('A')?.queryError,
      ).toEqual(outcome === 'resolve' ? [{ traceId: 'a' }] : 'A failed')
      expect(session('B')?.result).toBeNull()
      expect(session('B')?.queryError).toBeNull()
    },
  )

  it('finishes independently in reverse order after remounting B', async () => {
    const a = mount(),
      first = deferred<ReturnType<typeof result>>()
    const workA = start(a, first)
    a.unmount()
    act(() => useStore.setState({ activeTabId: 'B' }))
    const b = mount(),
      second = deferred<ReturnType<typeof result>>()
    const workB = start(b, second)
    await act(async () => {
      second.resolve(result([{ traceId: 'b' }]))
      await workB
    })
    expect(session('A')?.running).toBe(true)
    expect(session('B')?.running).toBe(false)
    await act(async () => {
      first.resolve(result([{ traceId: 'a' }]))
      await workA
    })
    expect(session('A')?.result?.rows).toEqual([{ traceId: 'a' }])
    expect(session('B')?.result?.rows).toEqual([{ traceId: 'b' }])
  })

  it.each(['close', 'rebind', 'generation'] as const)(
    'rejects obsolete completion after %s',
    async (change) => {
      const hook = mount(),
        pending = deferred<ReturnType<typeof result>>()
      const work = start(hook, pending)
      act(() => {
        if (change === 'close') useStore.getState().closeTab('A')
        else if (change === 'rebind') bindTabConnection('A', null)
        else
          useStore.setState({
            connectionStateByProfileId: {
              'tempo-1': {
                status: 'connected',
                generation: 2,
                error: null,
                serverVersion: null,
              },
            },
          })
      })
      await act(async () => {
        pending.resolve(result([{ traceId: 'obsolete' }]))
        await work
      })
      expect(session('A')?.result ?? null).toBeNull()
      expect(session('B')?.result).toBeNull()
      if (change === 'close') expect(session('A')).toBeUndefined()
    },
  )

  // Session-owned operation identity must survive controller replacement.
  it.each(['resolve', 'reject'] as const)(
    'rejects obsolete %s across same-tab remount',
    async (outcome) => {
      const a = mount(),
        old = deferred<ReturnType<typeof result>>()
      const oldWork = start(a, old)
      a.unmount()
      const newerHook = mount(),
        newer = deferred<ReturnType<typeof result>>()
      const newWork = start(newerHook, newer)
      await act(async () => {
        if (outcome === 'resolve')
          old.resolve(result([{ traceId: 'obsolete' }]))
        else old.reject(new Error('obsolete failure'))
        await oldWork
      })
      const afterOld = session('A')
      await act(async () => {
        newer.resolve(result([{ traceId: 'newer' }]))
        await newWork
      })
      expect(afterOld?.running).toBe(true)
      expect(afterOld?.result).toBeNull()
      expect(afterOld?.queryError).toBeNull()
    },
  )

  it('abandons pending state after generation replacement', async () => {
    const hook = mount(),
      pending = deferred<ReturnType<typeof result>>()
    const work = start(hook, pending)
    act(() =>
      useStore.setState({
        connectionStateByProfileId: {
          'tempo-1': {
            status: 'connected',
            generation: 2,
            error: null,
            serverVersion: null,
          },
        },
      }),
    )
    await act(async () => {
      pending.resolve(result([]))
      await work
    })
    expect(session('A')?.running).toBe(false)
  })
  it('shows pending state on return and adopts the background final result', async () => {
    const original = mount(),
      pending = deferred<ReturnType<typeof result>>()
    const work = start(original, pending)
    original.unmount()
    act(() => useStore.setState({ activeTabId: 'B' }))
    act(() => useStore.setState({ activeTabId: 'A' }))
    const returned = mount()
    expect(returned.result.current.searching).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => {
      pending.resolve(result([{ traceId: 'final' }]))
      await work
    })
    expect(returned.result.current.searching).toBe(false)
    expect(returned.result.current.searchRows).toEqual([{ traceId: 'final' }])
  })

  it('rejects stale progress after remount and same-hook supersession', async () => {
    const original = mount(),
      old = deferred<ReturnType<typeof result>>()
    const oldWork = start(original, old)
    const oldProgress = run.mock.calls[0][4]
    original.unmount()
    const current = mount(),
      next = deferred<ReturnType<typeof result>>()
    const nextWork = start(current, next)
    const nextProgress = run.mock.calls[1][4]
    act(() => oldProgress(progress([{ traceId: 'old' }]), 'old'))
    expect(current.result.current.searchRows).toEqual([])
    act(() => nextProgress(progress([{ traceId: 'partial' }]), 'next'))
    expect(current.result.current.searchRows).toEqual([{ traceId: 'partial' }])
    const newest = deferred<ReturnType<typeof result>>()
    const newestWork = start(current, newest)
    act(() => nextProgress(progress([{ traceId: 'stale' }]), 'next'))
    expect(current.result.current.searchRows).toEqual([])
    expect(current.result.current.searchProgress).toBeNull()
    await act(async () => {
      old.resolve(result([]))
      next.reject(new Error('obsolete'))
      await Promise.all([oldWork, nextWork])
    })
    expect(current.result.current.searching).toBe(true)
    await act(async () => {
      newest.resolve(result([{ traceId: 'newest' }]))
      await newestWork
    })
    expect(current.result.current.searchRows).toEqual([{ traceId: 'newest' }])
  })
  it('presents the originating failure after a pending search remounts', async () => {
    const original = mount(),
      pending = deferred<ReturnType<typeof result>>()
    const work = start(original, pending)
    original.unmount()
    const returned = mount()
    await act(async () => {
      pending.reject(new Error('provider failed'))
      await work
    })
    expect(returned.result.current.searching).toBe(false)
    expect(returned.result.current.searchError).toBe('provider failed')
    expect(session('B')?.queryError).toBeNull()
  })
})
