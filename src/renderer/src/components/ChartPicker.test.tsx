import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ChartPicker } from './ChartPicker'

const resultExplorerStyles = readFileSync('src/renderer/src/components/ResultExplorer.module.css', 'utf8')
const styles = readFileSync('src/renderer/src/components/ChartPicker.module.css', 'utf8')

describe('ChartPicker', () => {
  it('exposes every view by accessible name and reports the selected view', () => {
    const onChange = vi.fn()
    render(<ChartPicker value="treemap" onChange={onChange}/>)
    expect(screen.getByRole('button', { name: 'Treemap' }).getAttribute('aria-pressed')).toBe('true')
    for (const name of ['Table', 'Bar', 'Line', 'Area', 'Scatter', 'Treemap', 'Sunburst']) expect(screen.getByRole('button', { name })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sunburst' }))
    expect(onChange).toHaveBeenCalledWith('sunburst')
  })

  it('uses its result-pane container and wraps safely instead of the viewport width', () => {
    expect(resultExplorerStyles).toContain('container: result-pane / inline-size')
    expect(styles).toContain('@container result-pane (max-width: 760px)')
    expect(styles).toMatch(/\.root\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*hidden/s)
    expect(styles).not.toMatch(/@media\s*\(max-width:\s*900px\)/s)
  })

  it('provides readable hover, active, and keyboard-focus states', () => {
    expect(styles).toMatch(/\.label,\s*\.viewLabel\s*\{[^}]*margin-right:\s*5px[^}]*color:\s*var\(--text-mute\)[^}]*font-size:\s*11px/s)
    expect(styles).toMatch(/\.button \{[^}]*color:\s*var\(--text\)/s)
    expect(styles).toMatch(/\.button:hover \{[^}]*color:\s*#fff[^}]*background:/s)
    expect(styles).toMatch(/\.button\.active[^}]*\{[^}]*color:\s*#fff[^}]*border-color:\s*var\(--accent\)/s)
    expect(styles).toMatch(/\.button:focus-visible \{[^}]*outline:\s*2px solid var\(--accent\)/s)
  })
})
