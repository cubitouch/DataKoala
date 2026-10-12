// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraceRow } from './traceViewer'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./api', () => ({
  api: { tempoPerformanceEnabled: false, query: { run } },
}))

import { useTraceCohortAnalysis } from './useTraceCohortAnalysis'
import { aggregateTraceCohort, summarizeTraceForCohort } from './traceCohort'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
} from '@test/sessionTestUtils'
import { useStore } from '@store/useStore'

const traceRow = (index: number): TraceRow => ({
  traceId: String(index).padStart(32, '0'),
  startTimeMs: 1000 + index * 100,
  durationMs: index * 100,
  rootService: 'api',
  status: index === 2 ? 'error' : 'ok',
})
function spans(row: TraceRow): TraceRow[] {
  return [
    {
      traceId: row.traceId,
      spanId: 'root',
      parentSpanId: '',
      service: 'api',
      kind: 'SERVER',
      startTimeMs: row.startTimeMs,
      durationMs: row.durationMs,
      status: row.status === 'error' ? 'ERROR' : 'OK',
    },
    // Keep every span of a matching trace, even when a span starts outside the interval.
    {
      traceId: row.traceId,
      spanId: 'child',
      parentSpanId: 'root',
      service: `db-${row.traceId}`,
      kind: 'CLIENT',
      startTimeMs: Number(row.startTimeMs) + 10000,
      durationMs: Number(row.durationMs) / 2,
      status: row.status === 'error' ? 'ERROR' : 'OK',
    },
  ]
}
const resultFor = (row: TraceRow) => ({
  columns: [{ name: 'spanId', dataTypeID: 0, dataTypeName: 'text' }],
  rows: spans(row),
  rowCount: 2,
  durationMs: 1,
})
function deferred() {
  let resolve!: (result: ReturnType<typeof resultFor>) => void
  const promise = new Promise<ReturnType<typeof resultFor>>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const rows = [traceRow(1), traceRow(2)]
function mount(initialRows = rows) {
  return renderHook(
    ({ matching, generation }) =>
      useTraceCohortAnalysis(
        'tempo-1',
        matching,
        activeTestSession().id,
        generation,
      ),
    { initialProps: { matching: initialRows, generation: 1 } },
  )
}
async function analyze(hook: ReturnType<typeof mount>) {
  act(() => hook.result.current.ensureStarted())
  await waitFor(() => expect(hook.result.current.progress.status).toBe('ready'))
}
beforeEach(() => {
  resetTestStore()
  patchActiveTestSession({ connectionProfileId: 'tempo-1' })
  run
    .mockReset()
    .mockImplementation(async (_connection, id) =>
      resultFor(rows.find((row) => row.traceId === id)!),
    )
})
afterEach(cleanup)

describe('filtered Tempo cohort analysis', () => {
  it('reaggregates cached matching traces including full-span relationships and statistics', async () => {
    const hook = mount()
    await analyze(hook)
    expect(hook.result.current.aggregate.traceCount).toBe(2)
    hook.rerender({ matching: [rows[0]], generation: 1 })
    expect(hook.result.current.aggregate).toEqual(
      aggregateTraceCohort([summarizeTraceForCohort(spans(rows[0]), rows[0])]),
    )
    expect(
      hook.result.current.aggregate.nodes.map((node) => node.label),
    ).toContain(`db-${rows[0].traceId}`)
    expect(
      hook.result.current.aggregate.nodes.map((node) => node.label),
    ).not.toContain(`db-${rows[1].traceId}`)
    expect(hook.result.current.aggregate.edges[0]).toMatchObject({
      errorRate: 0,
      rank: 1,
      p95Ms: 50,
    })
    expect(hook.result.current.aggregate.p50DurationMs).toBe(100)
    hook.rerender({ matching: rows, generation: 1 })
    expect(hook.result.current.aggregate.traceCount).toBe(2)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('loads only the first filtered cohort and fills missing summaries explicitly after clear', async () => {
    const hook = mount([rows[1]])
    await analyze(hook)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][1]).toBe(rows[1].traceId)
    hook.rerender({ matching: rows, generation: 1 })
    expect(hook.result.current.progress).toMatchObject({
      status: 'partial',
      completed: 1,
      total: 2,
    })
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => hook.result.current.retry())
    expect(hook.result.current.aggregate.traceCount).toBe(2)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1][1]).toBe(rows[0].traceId)
    expect(run.mock.calls.every((call) => call[5] === true)).toBe(true)
  })

  it('keeps the analysis cap and selects a relevant sample when entering a new interval', async () => {
    const many = Array.from({ length: 120 }, (_, index) => traceRow(index + 1))
    run.mockImplementation(async (_connection, id) =>
      resultFor(many.find((row) => row.traceId === id)!),
    )
    const hook = mount(many)
    await analyze(hook)
    expect(hook.result.current.aggregate.traceCount).toBe(100)
    expect(hook.result.current.progress.total).toBe(100)
    hook.rerender({ matching: many.slice(110), generation: 1 })
    expect(hook.result.current.aggregate.traceCount).toBeLessThanOrEqual(10)
    expect(run).toHaveBeenCalledTimes(100)
    await analyze(hook)
    expect(
      hook.result.current.traces.map((trace) => trace.traceId).sort(),
    ).toEqual(
      many
        .slice(110)
        .map((row) => row.traceId)
        .sort(),
    )
    expect(
      run.mock.calls
        .slice(100)
        .every((call) =>
          many.slice(110).some((row) => row.traceId === call[1]),
        ),
    ).toBe(true)
  })

  it('shows no stale graph and rejects delayed work after changing then clearing an interval', async () => {
    const pending = [deferred(), deferred()]
    run
      .mockImplementationOnce(() => pending[0].promise)
      .mockImplementationOnce(() => pending[1].promise)
    const hook = mount()
    act(() => hook.result.current.ensureStarted())
    expect(hook.result.current.progress.status).toBe('loading')
    hook.rerender({ matching: [], generation: 1 })
    expect(hook.result.current.aggregate).toMatchObject({
      traceCount: 0,
      nodes: [],
      edges: [],
    })
    expect(hook.result.current.progress.status).toBe('idle')
    hook.rerender({ matching: rows, generation: 1 })
    expect(hook.result.current.progress.status).toBe('idle')
    await act(async () => {
      pending.forEach((item, index) => item.resolve(resultFor(rows[index])))
    })
    expect(hook.result.current.aggregate.traceCount).toBe(0)
    expect(run).toHaveBeenCalledTimes(2)
    await analyze(hook)
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('retains successes on partial failure and retries only missing selected traces', async () => {
    run.mockRejectedValueOnce(new Error('unavailable'))
    const hook = mount()
    act(() => hook.result.current.ensureStarted())
    await waitFor(() =>
      expect(hook.result.current.progress.status).toBe('partial'),
    )
    expect(hook.result.current.progress.failed).toBe(1)
    await act(async () => hook.result.current.retry())
    expect(hook.result.current.aggregate.traceCount).toBe(2)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('preserves completed summaries on Stop and ignores later replies', async () => {
    const pending = deferred()
    run
      .mockImplementationOnce(async () => resultFor(rows[0]))
      .mockImplementationOnce(() => pending.promise)
    const hook = mount()
    await act(async () => hook.result.current.ensureStarted())
    act(() => hook.result.current.stop())
    expect(hook.result.current.progress).toMatchObject({
      status: 'partial',
      completed: 1,
      total: 2,
    })
    expect(hook.result.current.aggregate.traceCount).toBe(1)
    await act(async () => pending.resolve(resultFor(rows[1])))
    expect(hook.result.current.aggregate.traceCount).toBe(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("never reuses another tab's cached summaries", async () => {
    const hook = mount()
    await analyze(hook)
    act(() => useStore.getState().createTab())
    hook.rerender({ matching: rows, generation: 1 })
    expect(hook.result.current.aggregate.traceCount).toBe(0)
    await analyze(hook)
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('discards summaries on reset and connection generation change', async () => {
    const hook = mount()
    await analyze(hook)
    act(() => hook.result.current.reset())
    expect(hook.result.current.aggregate.traceCount).toBe(0)
    await analyze(hook)
    act(() =>
      useStore.setState((state) => ({
        connectionStateByProfileId: {
          ...state.connectionStateByProfileId,
          'tempo-1': {
            ...state.connectionStateByProfileId['tempo-1'],
            generation: 2,
          },
        },
      })),
    )
    hook.rerender({ matching: rows, generation: 2 })
    expect(hook.result.current.aggregate.traceCount).toBe(0)
    await analyze(hook)
    expect(run).toHaveBeenCalledTimes(6)
  })
})
