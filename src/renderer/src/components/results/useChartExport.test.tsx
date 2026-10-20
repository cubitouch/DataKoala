// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  ChartReadinessController,
  createChartRevision,
} from '@lib/chartReadiness'
import { useChartExport } from './useChartExport'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  write: vi.fn(),
  save: vi.fn(),
  notify: vi.fn(),
  notifyExport: vi.fn(),
}))
vi.mock('@lib/chartImage', async (original) => ({
  ...(await original<typeof import('@lib/chartImage')>()),
  captureChartPng: mocks.capture,
}))
vi.mock('@lib/api', () => ({
  api: {
    clipboardImage: { writePng: mocks.write },
    export: { saveBinary: mocks.save },
  },
}))
vi.mock('@lib/chartCopyNotification', () => ({
  notifyChartCopyResult: mocks.notify,
  notifyChartExportResult: mocks.notifyExport,
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function input() {
  const readiness = new ChartReadinessController()
  const revision = createChartRevision()
  readiness.commitRevision(revision)
  return {
    context: {},
    ready: true,
    revision,
    readiness,
    getInstance: () => ({ dispatchAction: vi.fn(), getDataURL: () => '' }),
    legend: [],
    visibility: {},
  }
}
beforeEach(() => {
  mocks.capture.mockReset().mockResolvedValue('data:image/png;base64,AAAA')
  mocks.write.mockReset().mockResolvedValue({ ok: true })
  mocks.save.mockReset().mockResolvedValue('/chart.png')
  mocks.notify.mockReset()
  mocks.notifyExport.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('copies PNG and exports the existing filename/format with original capture inputs', async () => {
  const props = input()
  const { result } = renderHook(() => useChartExport(props))
  await act(async () => result.current.copyChart())
  expect(mocks.capture).toHaveBeenCalledWith(
    expect.any(Object),
    2,
    props.legend,
    props.visibility,
  )
  expect(mocks.write).toHaveBeenCalledWith('data:image/png;base64,AAAA')
  expect(mocks.notify).toHaveBeenCalledWith(true)
  await act(async () => result.current.exportPng())
  expect(mocks.save).toHaveBeenCalledWith({
    defaultName: 'datakoala_chart.png',
    base64: 'AAAA',
    extensions: ['png'],
  })
  expect(mocks.notifyExport).toHaveBeenCalledExactlyOnceWith(true)
  expect(result.current.capturing).toBeNull()
})
it('does not capture before readiness or after a retained action loses ownership', async () => {
  const props = input()
  const { result, rerender, unmount } = renderHook((p) => useChartExport(p), {
    initialProps: { ...props, ready: false },
  })
  await act(async () => result.current.copyChart())
  expect(mocks.capture).not.toHaveBeenCalled()
  const old = result.current.copyChart
  rerender({ ...props, context: {}, ready: true })
  await act(async () => old())
  const latest = result.current.copyChart
  unmount()
  await latest()
  expect(mocks.capture).not.toHaveBeenCalled()
})
it.each(['copy', 'export'] as const)(
  'handles %s capture failure and explicit retry',
  async (action) => {
    mocks.capture.mockRejectedValueOnce(new Error('canvas unavailable'))
    const { result } = renderHook(() => useChartExport(inputProps))
    async function run() {
      return action === 'copy'
        ? result.current.copyChart()
        : result.current.exportPng()
    }
    await act(run)
    expect(result.current.capturing).toBeNull()
    if (action === 'copy') expect(mocks.notify).toHaveBeenCalledWith(false)
    else expect(mocks.notifyExport).toHaveBeenCalledExactlyOnceWith(false)
    await act(run)
    expect(result.current.capturing).toBeNull()
  },
)
const inputProps = input()
it.each(['rejected', 'unsupported'] as const)(
  'cleans up %s clipboard failure',
  async (kind) => {
    if (kind === 'rejected')
      mocks.write.mockRejectedValueOnce(new Error('permission denied'))
    else mocks.write.mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => useChartExport(inputProps))
    await act(async () => result.current.copyChart())
    expect(mocks.notify).toHaveBeenCalledWith(false)
    expect(result.current.capturing).toBeNull()
    await act(async () => result.current.copyChart())
    expect(mocks.notify).toHaveBeenLastCalledWith(true)
  },
)
it('handles unavailable instance and save failure/cancellation', async () => {
  const props = input()
  const { result, rerender } = renderHook((p) => useChartExport(p), {
    initialProps: {
      ...props,
      getInstance: () => null as ReturnType<typeof props.getInstance> | null,
    },
  })
  await act(async () => result.current.copyChart())
  expect(mocks.notify).toHaveBeenCalledWith(false)
  expect(mocks.capture).not.toHaveBeenCalled()
  rerender(props)
  mocks.save.mockRejectedValueOnce(new Error('unavailable'))
  await act(async () => result.current.exportPng())
  expect(mocks.notifyExport).toHaveBeenCalledExactlyOnceWith(false)
  mocks.save.mockResolvedValueOnce(null)
  await act(async () => result.current.exportPng())
  expect(result.current.capturing).toBeNull()
  expect(mocks.notifyExport).toHaveBeenCalledTimes(1)
})
it('excludes same-turn repeated actions synchronously', async () => {
  const capture = deferred<string>()
  mocks.capture.mockReturnValueOnce(capture.promise)
  const { result } = renderHook(() => useChartExport(inputProps))
  let first!: Promise<void>
  act(() => {
    first = result.current.copyChart()
    void result.current.copyChart()
    void result.current.exportPng()
  })
  expect(result.current.capturing).toBe('copy')
  expect(mocks.capture).toHaveBeenCalledTimes(1)
  await act(async () => {
    capture.resolve('data:image/png;base64,AAAA')
    await first
  })
  expect(result.current.capturing).toBeNull()
})
it.each(['resolve', 'reject'] as const)(
  'invalidates pending capture on committed context and suppresses old %s/finally',
  async (outcome) => {
    const old = deferred<string>()
    const fresh = deferred<string>()
    mocks.capture
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise)
    const props = input()
    const { result, rerender } = renderHook((p) => useChartExport(p), {
      initialProps: props,
    })
    let a!: Promise<void>, b!: Promise<void>
    act(() => {
      a = result.current.copyChart()
    })
    rerender({ ...props, context: {} })
    expect(result.current.capturing).toBeNull()
    act(() => {
      b = result.current.exportPng()
    })
    await act(async () => {
      if (outcome === 'resolve') old.resolve('data:image/png;base64,OLD')
      else old.reject(new Error('late'))
      await a
    })
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.notifyExport).not.toHaveBeenCalled()
    expect(result.current.capturing).toBe('export')
    await act(async () => {
      fresh.resolve('data:image/png;base64,NEW')
      await b
    })
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ base64: 'NEW' }),
    )
  },
)
it.each(['copy', 'export'] as const)(
  'suppresses late %s platform feedback after revision or unmount',
  async (action) => {
    const platform = deferred<never>()
    if (action === 'copy') mocks.write.mockReturnValueOnce(platform.promise)
    else mocks.save.mockReturnValueOnce(platform.promise)
    const props = input()
    const { result, rerender, unmount } = renderHook((p) => useChartExport(p), {
      initialProps: props,
    })
    let pending!: Promise<void>
    await act(async () => {
      pending =
        action === 'copy'
          ? result.current.copyChart()
          : result.current.exportPng()
      await Promise.resolve()
    })
    props.readiness.commitRevision(createChartRevision())
    rerender({ ...props, context: {} })
    unmount()
    await act(async () => {
      platform.reject(new Error('late failure'))
      await pending
    })
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.notifyExport).not.toHaveBeenCalled()
  },
)
it('rejects obsolete readiness after PNG generation even without context replacement', async () => {
  const capture = deferred<string>()
  mocks.capture.mockReturnValueOnce(capture.promise)
  const props = input()
  const { result } = renderHook(() => useChartExport(props))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.copyChart()
  })
  props.readiness.commitRevision(createChartRevision())
  await act(async () => {
    capture.resolve('data:image/png;base64,OLD')
    await pending
  })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(result.current.capturing).toBeNull()
})

it.each(['copy', 'export'] as const)(
  'suppresses successful %s completion on owner replacement',
  async (action) => {
    const write = deferred<{ ok: boolean }>()
    const save = deferred<string | null>()
    mocks.write.mockReturnValueOnce(write.promise)
    mocks.save.mockReturnValueOnce(save.promise)
    const props = input()
    const { result, rerender } = renderHook((p) => useChartExport(p), {
      initialProps: props,
    })
    let pending!: Promise<void>
    await act(async () => {
      pending =
        action === 'copy'
          ? result.current.copyChart()
          : result.current.exportPng()
      await Promise.resolve()
    })
    rerender({ ...props, context: {} })
    await act(async () => {
      write.resolve({ ok: true })
      save.resolve('/old.png')
      await pending
    })
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.notifyExport).not.toHaveBeenCalled()
    expect(mocks.notifyExport).not.toHaveBeenCalled()
    expect(result.current.capturing).toBeNull()
  },
)
it('discards pending image on unmount', async () => {
  const capture = deferred<string>()
  const { result, unmount } = renderHook(() => useChartExport(inputProps))
  mocks.capture.mockReturnValueOnce(capture.promise)
  let pending!: Promise<void>
  act(() => {
    pending = result.current.copyChart()
  })
  unmount()
  await act(async () => {
    capture.resolve('data:image/png;base64,OLD')
    await pending
  })
  expect(mocks.write).not.toHaveBeenCalled()
  expect(mocks.notify).not.toHaveBeenCalled()
  expect(mocks.notifyExport).not.toHaveBeenCalled()
})

it('treats native Save cancellation as silent and allows a fresh retry', async () => {
  mocks.save.mockResolvedValueOnce(null)
  const props = input()
  const { result } = renderHook(() => useChartExport(props))
  await act(async () => result.current.exportPng())
  expect(mocks.notifyExport).not.toHaveBeenCalled()
  expect(mocks.notify).not.toHaveBeenCalled()
  await act(async () => result.current.exportPng())
  expect(mocks.notifyExport).toHaveBeenCalledExactlyOnceWith(true)
  expect(mocks.save).toHaveBeenCalledTimes(2)
})
