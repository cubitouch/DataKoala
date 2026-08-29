// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './CollapsibleSection.module.css'

afterEach(cleanup)
describe('CollapsibleSection', () => {
  it('is closed by default and toggles with native summary interaction', () => {
    render(<CollapsibleSection title="Advanced"><p>Settings</p></CollapsibleSection>)
    const details = screen.getByText('Advanced').closest('details')!
    expect(details.open).toBe(false)
    fireEvent.click(screen.getByText('Advanced'))
    expect(details.open).toBe(true)
  })
  it('supports default and controlled open state', () => {
    const Controlled = () => { const [open, setOpen] = useState(false); return <CollapsibleSection title="Controlled" open={open} onOpenChange={setOpen}>Body</CollapsibleSection> }
    const { rerender } = render(<CollapsibleSection title="Default" defaultOpen>Body</CollapsibleSection>)
    expect(screen.getByText('Default').closest('details')?.open).toBe(true)
    rerender(<Controlled />); fireEvent.click(screen.getByText('Controlled')); expect(screen.getByText('Controlled').closest('details')?.open).toBe(true)
  })
  it('does not toggle when an action is activated', () => {
    const action = vi.fn()
    render(<CollapsibleSection title="Generated SQL" actions={<button onClick={action}>Copy</button>}>SQL</CollapsibleSection>)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(action).toHaveBeenCalled(); expect(screen.getByText('Generated SQL').closest('details')?.open).toBe(false)
  })
  it('owns normal body spacing and supports edge-to-edge content', () => {
    const { rerender } = render(<CollapsibleSection title="Form">Fields</CollapsibleSection>)
    expect(screen.getByText('Fields').classList.contains(styles.normalPadding)).toBe(true)
    rerender(<CollapsibleSection title="Preview" contentPadding="none">Code</CollapsibleSection>)
    expect(screen.getByText('Code').classList.contains(styles.nonePadding)).toBe(true)
  })
})
