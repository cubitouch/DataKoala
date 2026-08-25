import React, { createRef } from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TextInput } from './TextInput'

afterEach(cleanup)

describe('TextInput', () => {
  it('is controlled, reports string values, and forwards its input ref', () => {
    const change = vi.fn(); const ref = createRef<HTMLInputElement>()
    render(<TextInput ref={ref} aria-label="Name" value="old" onValueChange={change} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new' } })
    expect(change).toHaveBeenCalledWith('new'); expect(ref.current).toBe(screen.getByLabelText('Name'))
  })
  it.each(['text', 'search', 'password', 'number', 'time'] as const)('passes through the %s type', (type) => {
    render(<TextInput aria-label={type} type={type} value="" onValueChange={() => {}} />)
    expect(screen.getByLabelText(type).getAttribute('type')).toBe(type)
  })
  it('supports normal, inline, and disabled presentation', () => {
    const view = render(<><TextInput aria-label="Normal" disabled /><TextInput aria-label="Inline" mode="inline" /></>)
    expect((screen.getByLabelText('Normal') as HTMLInputElement).disabled).toBe(true); expect(view.container.querySelectorAll('span')[0].className).toContain('normal'); expect(screen.getByLabelText('Inline').parentElement?.className).toContain('inline')
  })
  it('prioritizes error, describes feedback, and merges caller descriptions', () => {
    render(<><span id="existing">Existing</span><TextInput aria-label="Field" hint="Hint" warning="Warning" error="Error" aria-describedby="existing" /></>)
    const input = screen.getByLabelText('Field'); expect(input.getAttribute('aria-invalid')).toBe('true'); expect(input.getAttribute('aria-describedby')).toContain('existing'); expect(input.getAttribute('aria-describedby')).toContain('feedback'); expect(screen.getAllByText('Error').length).toBeGreaterThan(0); expect(screen.queryByText('Warning')).toBeNull()
  })
  it.each([['hint', 'Helpful'], ['warning', 'Careful']] as const)('renders keyboard-accessible %s feedback', (prop, message) => {
    render(<TextInput aria-label="Field" {...{ [prop]: message }} />)
    const button = screen.getByRole('button'); fireEvent.focus(button)
    expect(screen.getByRole('tooltip').hasAttribute('hidden')).toBe(false); expect(screen.getAllByText(message).length).toBeGreaterThan(0)
  })
})
