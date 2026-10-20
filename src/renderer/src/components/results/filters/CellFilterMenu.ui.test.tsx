import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CellFilterMenu } from './CellFilterMenu'

afterEach(cleanup)
it.each([
  [null, 'Show only NULL', 'isNull'],
  ['ready', 'Filter to this value', 'equals'],
] as const)(
  'restores the summary on Escape for %s without applying a filter',
  (value, action, operator) => {
    const onAdd = vi.fn()
    render(<CellFilterMenu column="status" value={value} onAdd={onAdd} />)
    const summary = screen.getByLabelText('Filter actions for status')
    const details = summary.closest('details')!
    details.open = true
    const button = screen.getByRole('button', { name: action })
    button.focus()
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(details.open).toBe(false)
    expect(document.activeElement).toBe(summary)
    expect(onAdd).not.toHaveBeenCalled()
    details.open = true
    fireEvent.click(button)
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ column: 'status', operator }),
    )
  },
)
