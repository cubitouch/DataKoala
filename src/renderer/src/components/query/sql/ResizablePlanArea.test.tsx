import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { ResizablePlanArea } from './ResizablePlanArea'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const value = (handle: HTMLElement) =>
  Number(handle.getAttribute('aria-valuenow'))
it('resizes the actual graph slot with keys, preserves it on rerender, and clamps after a window shrink', () => {
  const height = window.innerHeight
  const view = render(
    <ResizablePlanArea>
      <div>Graph</div>
    </ResizablePlanArea>,
  )
  const handle = screen.getByRole('separator', {
    name: 'Resize execution plan diagram',
  })
  const initial = value(handle)
  fireEvent.keyDown(handle, { key: 'ArrowUp' })
  expect(value(handle)).toBe(initial - 24)
  expect(
    (document.querySelector('[data-plan-height]') as HTMLElement).style.height,
  ).toBe(`${initial - 24}px`)
  view.rerender(
    <ResizablePlanArea>
      <div>Selected node inspector changed</div>
    </ResizablePlanArea>,
  )
  expect(value(handle)).toBe(initial - 24)
  fireEvent.keyDown(handle, { key: 'End' })
  expect(value(handle)).toBe(Number(handle.getAttribute('aria-valuemax')))
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 420,
  })
  act(() => window.dispatchEvent(new Event('resize')))
  expect(value(handle)).toBeLessThanOrEqual(360)
  fireEvent.keyDown(handle, { key: 'Home' })
  fireEvent.keyDown(handle, { key: 'ArrowUp' })
  expect(value(handle)).toBe(Number(handle.getAttribute('aria-valuemin')))
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })
})
it('captures pointer resizing in both directions, ignores other pointers, and cancels/cleans up without remounting the graph', () => {
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    },
  )
  const mounted = vi.fn()
  function Graph() {
    useEffect(() => {
      mounted()
    }, [])
    return <div>Graph</div>
  }
  const remove = vi.spyOn(window, 'removeEventListener')
  const view = render(
    <ResizablePlanArea>
      <Graph />
    </ResizablePlanArea>,
  )
  const handle = screen.getByRole('separator')
  const capture = vi.fn(),
    release = vi.fn()
  Object.assign(handle, {
    setPointerCapture: capture,
    hasPointerCapture: () => true,
    releasePointerCapture: release,
  })
  const initial = value(handle)
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 300 })
  fireEvent.pointerMove(handle, { pointerId: 2, clientY: 100 })
  expect(value(handle)).toBe(initial)
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 200 })
  expect(value(handle)).toBe(initial - 100)
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 350 })
  expect(value(handle)).toBe(initial + 50)
  fireEvent.pointerCancel(handle, { pointerId: 1 })
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: 200 })
  expect(value(handle)).toBe(initial + 50)
  expect(release).toHaveBeenCalledWith(1)
  expect(mounted).toHaveBeenCalledTimes(1)
  fireEvent.pointerDown(handle, { button: 0, pointerId: 3, clientY: 300 })
  view.unmount()
  expect(release).toHaveBeenCalledWith(3)
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
})
