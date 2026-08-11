import React, { useState } from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Combobox, MultiCombobox } from '.'

Element.prototype.scrollIntoView = vi.fn()
afterEach(cleanup)

const options = [
  { value: 'public', label: 'public', subtitle: 'schema' },
  { value: 'orders', label: 'orders', subtitle: 'table · demo_shop', keywords: ['sales_fact'] },
  { value: 'disabled', label: 'Disabled', disabled: true },
  { value: 'analytics', label: 'monthly_sales', subtitle: 'view · analytics' }
]
function Single({ searchable = false }: { searchable?: boolean }) {
  const [value, setValue] = useState('')
  return <Combobox label="Table or view" value={value} onChange={setValue} options={options} placeholder="Select a table or view…" searchable={searchable} />
}

describe('Combobox', () => {
  it('opens by mouse and selects with mouse, then returns focus to the trigger', async () => {
    render(<Single />)
    const trigger = screen.getByRole('combobox', { name: /Select a table/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /orders, table/ }))
    expect(screen.queryByRole('listbox')).toBeNull()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(document.activeElement).toBe(trigger)
    expect(screen.getByRole('combobox', { name: /orders/ })).toBeTruthy()
  })

  it('returns focus to the combobox instance that committed selection', async () => {
    render(<><Combobox label="First" value="" onChange={() => {}} options={[{ value: 'one', label: 'One' }]} /><Single /></>)
    const [first, second] = screen.getAllByRole('combobox')
    fireEvent.click(second)
    fireEvent.click(screen.getByRole('option', { name: /orders, table/ }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(document.activeElement).toBe(second)
    expect(document.activeElement).not.toBe(first)
  })

  it('opens with Enter, Space, ArrowDown, and ArrowUp', () => {
    for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) {
      const view = render(<Single />)
      const trigger = screen.getByRole('combobox')
      fireEvent.keyDown(trigger, { key })
      expect(screen.getByRole('listbox')).toBeTruthy()
      view.unmount()
    }
  })

  it('selects with Enter, closes, shows selected state, and skips disabled options', () => {
    render(<Single />)
    const trigger = screen.getByRole('combobox')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /monthly_sales/ }).getAttribute('data-active')).toBe('true')
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' })
    fireEvent.click(trigger)
    expect(screen.getByRole('option', { name: /monthly_sales/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('filters by label, subtitle, and keywords case-insensitively, shows empty state, and clears search after close', () => {
    render(<Single searchable />)
    const trigger = screen.getByRole('combobox')
    fireEvent.keyDown(trigger, { key: 'o' })
    const input = screen.getByRole('textbox', { name: /Search Table or view/ })
    expect(input).toHaveProperty('value', 'o')
    fireEvent.change(input, { target: { value: 'ANALYTICS' } })
    expect(screen.getByRole('option', { name: /monthly_sales/ })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'sales_fact' } })
    expect(screen.getByRole('option', { name: /orders/ })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'nope' } })
    expect(screen.getByText('No matching options')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.click(trigger)
    expect(screen.getByRole('textbox')).toHaveProperty('value', '')
  })

  it('supports Home, End, Escape, typeahead, disabled, loading, error, empty and scrolling states', () => {
    const { rerender } = render(<Single />)
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' })
    expect(screen.getByRole('option', { name: /monthly_sales/ }).getAttribute('data-active')).toBe('true')
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' })
    expect(screen.getByRole('option', { name: /public/ }).getAttribute('data-active')).toBe('true')
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'm' })
    expect(screen.getByRole('option', { name: /monthly_sales/ }).getAttribute('data-active')).toBe('true')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    rerender(<Combobox label="State" value="" options={[]} onChange={() => {}} loading />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('status').textContent).toContain('Loading')
    rerender(<Combobox label="State" value="" options={[]} onChange={() => {}} error="Broken" />)
    expect(screen.getByRole('alert').textContent).toContain('Broken')
    rerender(<Combobox label="State" value="" options={[]} onChange={() => {}} disabled />)
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('MultiCombobox', () => {
  it('selects multiple values, keeps open, renders/removes chips, avoids duplicates, and exposes multi-select semantics', () => {
    function View() { const [values, setValues] = useState<string[]>([]); return <MultiCombobox label="Columns" values={values} onChange={setValues} options={options} showChips /> }
    render(<View />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: /public/ }))
    fireEvent.click(screen.getByRole('option', { name: /orders/ }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /public/ }))
    expect(screen.getByRole('option', { name: /public/ }).getAttribute('aria-selected')).toBe('false')
    fireEvent.click(screen.getByRole('option', { name: /orders/ }))
    expect(screen.getByRole('option', { name: /orders/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('does not nest focusable chip controls inside the combobox trigger', () => {
    function View() { const [values, setValues] = useState<string[]>(['public', 'orders']); return <MultiCombobox label="Columns" values={values} onChange={setValues} options={options} showChips /> }
    render(<View />)
    const trigger = screen.getByRole('combobox')
    expect(trigger.querySelector('[role="button"]')).toBeNull()
    expect(trigger.querySelector('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')).toBeNull()
  })

  it('keeps selected chips in value order and ArrowUp opens on the last enabled option', () => {
    function View() { const [values, setValues] = useState<string[]>(['analytics', 'public']); return <MultiCombobox label="Columns" values={values} onChange={setValues} options={options} showChips /> }
    const view = render(<View />)
    expect(Array.from(view.container.querySelectorAll('.combobox-chip')).map((chip) => chip.textContent?.replace('×', ''))).toEqual(['monthly_sales', 'public'])
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowUp' })
    expect(screen.getByRole('option', { name: /monthly_sales/ }).getAttribute('data-active')).toBe('true')
  })

  it('removes the last value with Backspace when search is empty', () => {
    function View() { const [values, setValues] = useState<string[]>(['public', 'orders']); return <MultiCombobox label="Columns" values={values} onChange={setValues} options={options} showChips /> }
    render(<View />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' })
    expect(screen.getByRole('option', { name: /orders/ }).getAttribute('aria-selected')).toBe('false')
  })
})

// Chip removal is pointer-only because chips live inside the trigger button.
it('removes exactly one chip on click without toggling the menu', () => {
  function View() { const [values, setValues] = useState<string[]>(['public', 'orders', 'analytics']); return <MultiCombobox label="Columns" values={values} onChange={setValues} options={options} showChips /> }
  const view = render(<View />)
  const trigger = screen.getByRole('combobox')
  fireEvent.click(view.container.querySelectorAll('.combobox-chip')[1])
  expect(Array.from(view.container.querySelectorAll('.combobox-chip')).map((chip) => chip.textContent?.replace('×', ''))).toEqual(['public', 'monthly_sales'])
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})
