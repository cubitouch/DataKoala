import React, { useState } from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DateRangeCalendar } from './DateRangeCalendar'
import type { CustomTimeRangeValue } from '../../lib/customTimeRange'

afterEach(cleanup)
function CalendarView({ initial }: { initial: CustomTimeRangeValue }) {
  const [value, setValue] = useState(initial)
  return <DateRangeCalendar value={value} onChange={setValue} />
}

describe('DateRangeCalendar keyboard navigation', () => {
  it('moves actual focus with arrow keys', async () => {
    render(<CalendarView initial={{ startDate: '2026-08-03', startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }} />)
    const start = screen.getByRole('gridcell', { name: '2026-08-03' })
    start.focus()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: '2026-08-04' })))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: '2026-08-11' })))
  })

  it('moves actual focus across a month boundary', async () => {
    render(<CalendarView initial={{ startDate: '2026-08-31', startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }} />)
    const start = screen.getByRole('gridcell', { name: '2026-08-31' })
    start.focus()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: '2026-09-01' })))
  })
})

describe('DateRangeCalendar visual exclusive end dates', () => {
  it('highlights Today as one day only', () => {
    render(<CalendarView initial={{ startDate: '2026-07-15', startTime: '00:00', endDate: '2026-07-16', endTime: '00:00', recurringWindows: [] }} />)
    expect(screen.getByRole('gridcell', { name: '2026-07-15' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('gridcell', { name: '2026-07-16' }).getAttribute('aria-selected')).toBe('false')
  })

  it('highlights Yesterday as one day only', () => {
    render(<CalendarView initial={{ startDate: '2026-07-14', startTime: '00:00', endDate: '2026-07-15', endTime: '00:00', recurringWindows: [] }} />)
    expect(screen.getByRole('gridcell', { name: '2026-07-14' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('gridcell', { name: '2026-07-15' }).getAttribute('aria-selected')).toBe('false')
  })

  it('does not highlight the next month first day for all-day month ranges', () => {
    render(<CalendarView initial={{ startDate: '2026-07-01', startTime: '00:00', endDate: '2026-08-01', endTime: '00:00', recurringWindows: [] }} />)
    expect(screen.getByRole('gridcell', { name: '2026-07-31' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('gridcell', { name: '2026-08-01' }).getAttribute('aria-selected')).toBe('false')
  })

  it('visually ends midnight-exclusive ranges on the prior date', () => {
    render(<CalendarView initial={{ startDate: '2026-07-01', startTime: '00:00', endDate: '2026-08-01', endTime: '00:00', recurringWindows: [] }} />)
    expect(screen.getByRole('gridcell', { name: '2026-07-31' }).hasAttribute('data-range-boundary')).toBe(true)
    expect(screen.getByRole('gridcell', { name: '2026-08-01' }).hasAttribute('data-range-boundary')).toBe(false)
  })

  it('visually ends explicit non-midnight ranges on the selected end date', () => {
    render(<CalendarView initial={{ startDate: '2026-07-01', startTime: '00:00', endDate: '2026-07-31', endTime: '14:00', recurringWindows: [] }} />)
    expect(screen.getByRole('gridcell', { name: '2026-07-31' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('gridcell', { name: '2026-07-31' }).hasAttribute('data-range-boundary')).toBe(true)
  })

  it('converts selected visual midnight end dates back to exclusive boundaries', () => {
    function View() { const [value, setValue] = useState<CustomTimeRangeValue>({ startDate: '2026-07-01', startTime: '00:00', endDate: null, endTime: '00:00', recurringWindows: [] }); return <><DateRangeCalendar value={value} onChange={setValue}/><output aria-label="value">{JSON.stringify(value)}</output></> }
    render(<View />)
    fireEvent.click(screen.getByRole('gridcell', { name: '2026-07-31' }))
    expect(screen.getByLabelText('value').textContent).toContain('\"endDate\":\"2026-08-01\"')
  })
})
