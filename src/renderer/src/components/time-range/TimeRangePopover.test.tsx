import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TimeRangePopover } from './TimeRangePopover'
import type { BuilderTimeRange } from '../../lib/builderTimeRange'

afterEach(cleanup)

const draft: BuilderTimeRange = { kind: 'rolling', amount: 7, unit: 'day' }

describe('TimeRangePopover layout structure', () => {
  it('keeps presets and editor in one body region with actions outside it', () => {
    const { container } = render(<TimeRangePopover draft={draft} setDraft={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const body = container.querySelector('[data-time-range-region="body"]')
    const presetPane = container.querySelector('[data-time-range-region="presets"]')
    const editorPane = container.querySelector('[data-time-range-region="editor"]')
    const actions = container.querySelector('[data-time-range-region="actions"]')
    expect(body).not.toBeNull()
    expect(presetPane?.contains(screen.getByRole('button', { name: 'Last hour' }))).toBe(true)
    expect(editorPane?.contains(screen.getByLabelText('Start time'))).toBe(true)
    expect(body?.contains(actions)).toBe(false)
  })

  it('keeps the action buttons rendered and keyboard reachable alongside overflowing presets', () => {
    render(<TimeRangePopover draft={draft} setDraft={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clear' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Cancel' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Confirm' }).tabIndex).toBe(0)
  })
})
