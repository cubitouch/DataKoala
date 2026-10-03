import { expect, test, vi } from 'vitest'
import { ChartEventBridgeLifecycle } from './chartEventBridgeLifecycle'

test('global-out hover cleanup attaches once and detaches on chart replacement/unmount', () => {
  const clearHover = vi.fn()
  const zr = { on: vi.fn(), off: vi.fn() }
  const chart = { getZr: () => zr }
  const lifecycle = new ChartEventBridgeLifecycle(clearHover)
  lifecycle.attach(chart)
  lifecycle.attach(chart)
  expect(zr.on).toHaveBeenCalledOnce()
  expect(zr.on.mock.calls[0][0]).toBe('globalout')
  zr.on.mock.calls[0][1]()
  expect(clearHover).toHaveBeenCalledOnce()
  lifecycle.attach(null)
  expect(zr.off).toHaveBeenCalledWith('globalout', zr.on.mock.calls[0][1])
  lifecycle.detach()
  expect(zr.off).toHaveBeenCalledOnce()
})
