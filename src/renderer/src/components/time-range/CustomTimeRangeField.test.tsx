import React, { useState } from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CustomTimeRangeField } from './CustomTimeRangeField'
import type { CustomTimeRangeValue } from '../../lib/customTimeRange'

afterEach(cleanup)
const initial: CustomTimeRangeValue = { startDate: '2026-06-15', startTime: '00:00', endDate: '2026-06-21', endTime: '00:00', recurringWindows: [] }
function View() { const [value, setValue] = useState(initial); return <><CustomTimeRangeField value={value} onChange={setValue}/><output aria-label="value">{JSON.stringify(value)}</output></> }
const open = () => { const b = screen.getByRole('button', { name: /Custom range/ }); fireEvent.pointerDown(b); fireEvent.click(b, { detail: 1 }); return b }

describe('CustomTimeRangeField', () => {
  it('opens with committed draft and cancel does not update state', () => {
    render(<View />); open(); fireEvent.click(screen.getByRole('gridcell', { name: '2026-06-22' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('value').textContent).toContain('2026-06-21')
  })
  it('clear resets draft and disables confirm until dates are selected', () => {
    render(<View />); open(); fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(true)
  })
  it('quick range confirms once and time window add/delete controls work', () => {
    render(<View />); open(); fireEvent.click(screen.getByRole('button', { name: 'This week' })); fireEvent.click(screen.getByRole('button', { name: '+ Add window' })); fireEvent.change(screen.getByLabelText('From time 1'), { target: { value: '09:00' } }); fireEvent.change(screen.getByLabelText('To time 1'), { target: { value: '14:00' } }); fireEvent.click(screen.getByRole('button', { name: '+ Add window' })); fireEvent.click(screen.getByRole('button', { name: 'Delete time window 2' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByLabelText('value').textContent).toContain('09:00')
  })
  it('keeps the time-range parent open while selecting a month from its nested combobox', () => {
    render(<View />)
    open()
    const month = screen.getByRole('combobox', { name: /Month: Jun/ })
    fireEvent.pointerDown(month)
    fireEvent.click(month, { detail: 1 })
    fireEvent.click(screen.getByRole('option', { name: 'Jul' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('July 2026')).toBeTruthy()
    expect(screen.queryByRole('listbox', { name: 'Month' })).toBeNull()
  })
})
