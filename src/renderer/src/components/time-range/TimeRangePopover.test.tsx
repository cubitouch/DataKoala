import { useState } from 'react'
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TimeRangePopover } from './TimeRangePopover'
import type { BuilderTimeRange } from '../../lib/builderTimeRange'

afterEach(cleanup)

const draft: BuilderTimeRange = { kind: 'rolling', amount: 7, unit: 'day' }

function Harness({ initial = draft }: { initial?: BuilderTimeRange }) {
  const [value, setValue] = useState(initial)
  return <><TimeRangePopover draft={value} setDraft={setValue} onCancel={vi.fn()} onConfirm={vi.fn()} /><output aria-label="draft value">{JSON.stringify(value)}</output></>
}

const readDraft = () => JSON.parse(screen.getByLabelText('draft value').textContent ?? '{}') as BuilderTimeRange

describe('TimeRangePopover layout structure', () => {
  it('keeps presets, calendar editor, and recurring-window editor in one body region with actions outside it', () => {
    const { container } = render(<TimeRangePopover draft={draft} setDraft={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const body = container.querySelector('[data-time-range-region="body"]')
    const presetPane = container.querySelector('[data-time-range-region="presets"]')
    const editorPane = container.querySelector('[data-time-range-region="editor"]')
    const actions = container.querySelector('[data-time-range-region="actions"]')
    expect(body).not.toBeNull()
    expect(presetPane?.contains(screen.getByRole('button', { name: 'Last hour' }))).toBe(true)
    expect(editorPane?.contains(screen.getByRole('grid', { name: 'Date range calendar' }))).toBe(true)
    expect(editorPane?.contains(screen.getByLabelText('Start time'))).toBe(true)
    expect(editorPane?.contains(screen.getByText('Advanced: recurring daily windows'))).toBe(true)
    expect(body?.contains(actions)).toBe(false)
  })

  it('keeps the action buttons rendered and keyboard reachable alongside overflowing presets', () => {
    render(<TimeRangePopover draft={draft} setDraft={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clear' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Cancel' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Confirm' }).tabIndex).toBe(0)
  })

  it('adds recurring windows without clearing a rolling range and preserves them when switching to Last day', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Advanced: recurring daily windows'))
    fireEvent.click(screen.getByRole('button', { name: '+ Add window' }))
    fireEvent.change(screen.getByLabelText('From time 1'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To time 1'), { target: { value: '17:00' } })
    expect(readDraft()).toMatchObject({ kind: 'rolling', amount: 7, unit: 'day', recurringWindows: [{ from: '09:00', to: '17:00' }] })

    fireEvent.click(screen.getByRole('button', { name: 'Last day' }))
    expect(readDraft()).toMatchObject({ kind: 'rolling', amount: 24, unit: 'hour', recurringWindows: [{ from: '09:00', to: '17:00' }] })
    expect(screen.getByRole('button', { name: 'Last day' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('preserves recurring windows when editing the visible calendar/date-time controls from a rolling range', () => {
    const recurringWindows = [{ id: 'business', from: '09:00', to: '17:00' }]
    render(<Harness initial={{ kind: 'rolling', amount: 24, unit: 'hour', recurringWindows }} />)
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '08:30' } })
    expect(readDraft()).toMatchObject({ kind: 'custom', startTime: '08:30', recurringWindows })
  })
})
