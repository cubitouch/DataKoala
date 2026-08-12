import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChartPicker } from './ChartPicker'

describe('ChartPicker', () => {
  it('exposes every view by accessible name and reports the selected view', () => {
    const onChange = vi.fn()
    render(<ChartPicker value="treemap" onChange={onChange}/>)
    expect(screen.getByRole('button', { name: 'Treemap' }).getAttribute('aria-pressed')).toBe('true')
    for (const name of ['Table', 'Bar', 'Line', 'Area', 'Scatter', 'Treemap', 'Sunburst']) expect(screen.getByRole('button', { name })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sunburst' }))
    expect(onChange).toHaveBeenCalledWith('sunburst')
  })
})
