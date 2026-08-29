import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Popover, usePopover } from './Popover'

afterEach(cleanup)

const openWithPointer = (name: string | RegExp) => {
  const trigger = screen.getByRole('button', { name })
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger, { detail: 1 })
  return trigger
}

function NestedOption() {
  const popover = usePopover()
  return <button onClick={() => popover?.close()}>Choose child option</button>
}

function NestedPopovers() {
  return <><Popover ariaLabel="Parent" trigger="Parent trigger"><div>
    <button>Parent content</button>
    <Popover ariaLabel="Child" trigger="Child trigger"><NestedOption /></Popover>
  </div></Popover><button>Outside both</button></>
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

  it('keeps ancestors open while nested overlays interact and closes Escape from the inside out', () => {
    render(<NestedPopovers />)
    openWithPointer('Parent')
    openWithPointer('Child')
    expect(screen.getByRole('button', { name: 'Parent content' })).toBeTruthy()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Choose child option' }))
    expect(screen.getByRole('button', { name: 'Parent content' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose child option' }))
    expect(screen.queryByRole('button', { name: 'Choose child option' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Parent content' })).toBeTruthy()

    openWithPointer('Child')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Choose child option' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Parent content' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Parent content' })).toBeNull()
  })

  it('closes the complete nested overlay tree when interaction moves outside it', () => {
    render(<NestedPopovers />)
    openWithPointer('Parent')
    openWithPointer('Child')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside both' }))
    expect(screen.queryByRole('button', { name: 'Parent content' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose child option' })).toBeNull()
  })

  it('still coordinates an unrelated peer against an open nested tree', () => {
    render(<><NestedPopovers /><Popover ariaLabel="Unrelated" trigger="Unrelated trigger"><span>Unrelated content</span></Popover></>)
    openWithPointer('Parent')
    openWithPointer('Child')
    openWithPointer('Unrelated')
    expect(screen.queryByRole('button', { name: 'Parent content' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose child option' })).toBeNull()
    expect(screen.getByText('Unrelated content')).toBeTruthy()
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
