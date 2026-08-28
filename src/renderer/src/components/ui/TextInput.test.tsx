import React, { createRef } from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TextInput } from './TextInput'
import fieldStyles from './FieldChrome.module.css'

afterEach(cleanup)

describe('TextInput', () => {
  it('is controlled, reports string values, and forwards its input ref', () => {
    const change = vi.fn(); const ref = createRef<HTMLInputElement>()
    render(<TextInput ref={ref} label="Name" value="old" onValueChange={change} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'new' } })
    expect(change).toHaveBeenCalledWith('new'); expect(ref.current).toBe(screen.getByLabelText('Name'))
  })
  it.each(['text', 'search', 'password', 'number', 'time'] as const)('passes through the %s type', (type) => {
    render(<TextInput label={type} type={type} value="" onValueChange={() => {}} />)
    expect(screen.getByLabelText(type).getAttribute('type')).toBe(type)
  })
  it('supports normal, inline, and disabled presentation', () => {
    const view = render(<><TextInput label="Normal" disabled /><TextInput label="Inline" mode="inline" /></>)
    expect((screen.getByLabelText('Normal') as HTMLInputElement).disabled).toBe(true); expect(view.container.querySelectorAll('span')[0].className).toContain('normal'); expect(screen.getByLabelText('Inline').closest(`.${fieldStyles.inline}`)).toBeTruthy()
  })
  it('sizes compact controls without changing inline label placement', () => {
    render(<TextInput label="Limit" mode="inline" controlSize="compact" type="number" value="1000" onValueChange={() => {}} />)
    const field = screen.getByLabelText('Limit').closest('[data-field]')!
    expect(field.classList.contains(fieldStyles.inline)).toBe(true)
    expect(field.classList.contains(fieldStyles.compact)).toBe(true)
  })
  it('renders an associated visible label and only visually hides genuine embedded labels', () => {
    render(<><TextInput label="Start time" type="time" /><TextInput label="Tab name" labelVisibility="sr-only" mode="inline" /></>)
    expect(screen.getByLabelText('Start time')).toBeTruthy()
    expect(screen.getByText('Start time').classList.contains(fieldStyles.label)).toBe(true)
    expect(screen.getByLabelText('Tab name')).toBeTruthy()
    expect(screen.getByText('Tab name').parentElement?.classList.contains(fieldStyles.srOnly)).toBe(true)
  })
  it('prioritizes error, describes feedback, and merges caller descriptions', () => {
    render(<><span id="existing">Existing</span><TextInput label="Field" hint="Hint" warning="Warning" error="Error" aria-describedby="existing" /></>)
    const input = screen.getByLabelText('Field'); expect(input.getAttribute('aria-invalid')).toBe('true'); expect(input.getAttribute('aria-describedby')).toContain('existing'); expect(input.getAttribute('aria-describedby')).toContain('feedback'); expect(screen.getByRole('alert').textContent).toBe('Error'); expect(screen.queryByText('Warning')).toBeNull()
  })
  it.each([['hint', 'Helpful', 'Field help'], ['warning', 'Careful', 'Field warning']] as const)('renders keyboard-accessible %s feedback beside the label', (prop, message, accessibleName) => {
    render(<TextInput label="Field" {...{ [prop]: message }} />)
    const button = screen.getByRole('button', { name: accessibleName })
    expect(button.parentElement?.parentElement?.classList.contains(fieldStyles.labelRow)).toBe(true)
    const description = document.getElementById(screen.getByLabelText('Field').getAttribute('aria-describedby')!)!
    expect(description.classList.contains(fieldStyles.srOnly)).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip').hasAttribute('hidden')).toBe(false)
    expect(screen.getByRole('tooltip').textContent).toBe(message)
  })
  it('keeps placeholder copy separate from entered values', () => {
    const { rerender } = render(<TextInput label="Search" placeholder="Filter values" value="" onValueChange={() => {}} />)
    expect(screen.getByLabelText('Search')).toHaveProperty('placeholder', 'Filter values')
    expect(screen.getByLabelText('Search')).toHaveProperty('value', '')
    rerender(<TextInput label="Search" placeholder="Filter values" value="orders" onValueChange={() => {}} />)
    expect(screen.getByLabelText('Search')).toHaveProperty('value', 'orders')
  })
})
