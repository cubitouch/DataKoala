import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Checkbox } from './Checkbox'
afterEach(cleanup)
describe('Checkbox', () => {
  it('has an accessible label and reports checked changes', () => { const change=vi.fn(); render(<Checkbox label="Use SSL" checked={false} onCheckedChange={change} />); fireEvent.click(screen.getByRole('checkbox', { name: 'Use SSL' })); expect(change).toHaveBeenCalledWith(true) })
  it('preserves checked and disabled states', () => { render(<Checkbox label="Locked" checked disabled onCheckedChange={() => {}} />); const input = screen.getByRole('checkbox', { name: 'Locked' }) as HTMLInputElement; expect(input.checked).toBe(true); expect(input.disabled).toBe(true) })
})
