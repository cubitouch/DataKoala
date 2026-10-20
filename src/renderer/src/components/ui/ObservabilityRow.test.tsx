import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { focusedRowRange, ObservabilityRow } from './ObservabilityRow'
afterEach(cleanup)
it('composes a native opener with separate action controls and shared selected state', () => {
  const open = vi.fn(),
    copy = vi.fn()
  render(
    <ObservabilityRow
      leading="INFO"
      trailing="12ms"
      selected
      onOpen={open}
      actions={<button onClick={copy}>Copy</button>}
    >
      Message
    </ObservabilityRow>,
  )
  const row = screen.getByRole('button', { name: /INFO Message 12ms/ })
  expect(row.getAttribute('aria-selected')).toBe('true')
  expect(row.querySelector('button')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(copy).toHaveBeenCalledOnce()
  expect(open).not.toHaveBeenCalled()
  fireEvent.click(row)
  expect(open).toHaveBeenCalledOnce()
  expect(row.querySelector('[data-row-chevron]')).toBeTruthy()
})
it('does not advertise or activate a non-openable row', () => {
  render(<ObservabilityRow>Unlinked message</ObservabilityRow>)
  expect(screen.queryByRole('button')).toBeNull()
  expect(document.querySelector('[data-row-chevron]')).toBeNull()
})
it('retains the focused identity outside a large recycled viewport', () => {
  const range = { startIndex: 500, endIndex: 510, overscan: 2, count: 5000 }
  expect(focusedRowRange(range, 3)).toEqual([
    3,
    ...Array.from({ length: 15 }, (_, i) => 498 + i),
  ])
  expect(focusedRowRange(range, -1)).toHaveLength(15)
})
