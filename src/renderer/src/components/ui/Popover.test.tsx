import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MultiSelect, Popover } from './Popover'

afterEach(cleanup)

const openWithPointer = (name: string | RegExp) => {
  const trigger = screen.getByRole('button', { name })
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger, { detail: 1 })
  return trigger
}

describe('Popover', () => {
  it('preserves consumer extension classes on the root and portalled content', () => {
    const view = render(<Popover ariaLabel="Open" trigger="Open" className="consumer-root" contentClassName="consumer-content"><span>Content</span></Popover>)
    expect(view.container.querySelector('.consumer-root')).toBeTruthy()
    openWithPointer('Open')
    expect(document.body.querySelector('.consumer-content')?.textContent).toBe('Content')
  })

  it('dismisses on outside pointer interaction but not inside interaction', () => {
    render(<><Popover ariaLabel="Open filters" trigger="Filters"><button>Inside</button></Popover><button>Outside</button></>)
    openWithPointer('Open filters')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }))
    expect(screen.getByRole('button', { name: 'Inside' })).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Open filters' }))
  })

  it('Escape dismisses and restores focus to its trigger', () => {
    render(<Popover ariaLabel="Open filters" trigger="Filters"><button>Inside</button></Popover>)
    const trigger = openWithPointer('Open filters')
    screen.getByRole('button', { name: 'Inside' }).focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('opening another popover closes the currently open popover', () => {
    render(<><Popover ariaLabel="First" trigger="First"><span>First content</span></Popover><Popover ariaLabel="Second" trigger="Second"><span>Second content</span></Popover></>)
    openWithPointer('First')
    openWithPointer('Second')
    expect(screen.queryByText('First content')).toBeNull()
    expect(screen.getByText('Second content')).toBeTruthy()
  })

  it('dismisses when disabled or invalidated and restores focus safely', () => {
    const View = ({ disabled = false, version = 1 }: { disabled?: boolean; version?: number }) => <><button>Before</button><Popover ariaLabel="Open" trigger="Open" disabled={disabled} invalidationKey={version}><button>Inside</button></Popover><button>After</button></>
    const view = render(<View />)
    const trigger = openWithPointer('Open')
    screen.getByRole('button', { name: 'Inside' }).focus()
    view.rerender(<View version={2} />)
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
    expect(document.activeElement).toBe(trigger)

    openWithPointer('Open')
    screen.getByRole('button', { name: 'Inside' }).focus()
    view.rerender(<View disabled version={2} />)
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
    expect(document.activeElement).not.toBe(trigger)
    expect(document.body.contains(document.activeElement)).toBe(true)
  })
})

const options = [
  { value: 'alpha', label: 'Alpha', detail: 'text' },
  { value: 'disabled', label: 'Disabled', disabled: true },
  { value: 'charlie', label: 'Charlie' },
  { value: 'delta-disabled', label: 'Delta', disabled: true },
  { value: 'echo', label: 'Echo' }
]

function StatefulMultiSelect({ initial = ['charlie'], choices = options }: { initial?: string[]; choices?: typeof options }) {
  const [values, setValues] = useState(initial)
  return <MultiSelect label="Series columns" options={choices} values={values} onChange={setValues} />
}

describe('MultiSelect', () => {
  it('uses compact semantic elements instead of heading-level option typography', () => {
    render(<StatefulMultiSelect />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }))
    const option = screen.getByRole('option', { name: /Alpha/ })
    expect(option.querySelector('[data-multi-select-option-name]')?.tagName).toBe('SPAN')
    expect(option.querySelector('strong')).toBeNull()
    expect(option.querySelector('small')?.textContent).toBe('text')
  })
  it('keyboard opening focuses the selected enabled option, then falls back to the first enabled option', () => {
    render(<StatefulMultiSelect />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }), { detail: 0 })
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /Charlie/ }))
    cleanup()

    render(<StatefulMultiSelect initial={['disabled']} />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }), { detail: 0 })
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /Alpha/ }))
  })

  it('uses roving tabindex and arrows skip disabled options', () => {
    render(<StatefulMultiSelect />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }), { detail: 0 })
    const alpha = screen.getByRole('option', { name: /Alpha/ })
    const charlie = screen.getByRole('option', { name: /Charlie/ })
    const echo = screen.getByRole('option', { name: /Echo/ })
    expect(charlie.tabIndex).toBe(0)
    expect(alpha.tabIndex).toBe(-1)
    fireEvent.keyDown(charlie, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(alpha)
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(charlie)
    fireEvent.keyDown(charlie, { key: 'End' })
    expect(document.activeElement).toBe(echo)
    fireEvent.keyDown(echo, { key: 'Home' })
    expect(document.activeElement).toBe(alpha)
    expect(screen.getAllByRole('option').filter((option) => option.tabIndex === 0)).toHaveLength(1)
  })

  it('Enter and Space update values without closing and keep focus stable', () => {
    render(<StatefulMultiSelect initial={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }), { detail: 0 })
    const alpha = screen.getByRole('option', { name: /Alpha/ })
    fireEvent.keyDown(alpha, { key: 'Enter' })
    expect(alpha.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(alpha)
    fireEvent.keyDown(alpha, { key: ' ' })
    expect(alpha.getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('typeahead searches enabled options from the active option and wraps', async () => {
    render(<StatefulMultiSelect initial={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }), { detail: 0 })
    const alpha = screen.getByRole('option', { name: /Alpha/ })
    fireEvent.keyDown(alpha, { key: 'd' })
    expect(document.activeElement).toBe(alpha)
    await new Promise((resolve) => setTimeout(resolve, 650))
    fireEvent.keyDown(alpha, { key: 'e' })
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /Echo/ }))
  })

  it('handles empty and all-disabled option sets without throwing or looping', () => {
    const view = render(<StatefulMultiSelect initial={[]} choices={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Series columns/ }), { detail: 0 })
    expect(screen.getByText('No available columns')).toBeTruthy()
    view.rerender(<StatefulMultiSelect initial={[]} choices={[{ value: 'disabled', label: 'Disabled', disabled: true }]} />)
    fireEvent.keyDown(screen.getByRole('option'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option'), { key: 'Home' })
    fireEvent.keyDown(screen.getByRole('option'), { key: 'x' })
    expect(document.activeElement).not.toBe(screen.getByRole('option'))
  })
})
