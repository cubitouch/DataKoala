import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Popover } from './Popover'

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
