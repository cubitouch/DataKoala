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
  it('wraps the preset list in its own scroll container and keeps actions outside the body', () => {
    const { container } = render(<TimeRangePopover draft={draft} setDraft={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const body = container.querySelector('.custom-range-body')
    const presetScroll = container.querySelector('.time-range-presets-scroll')
    const editorScroll = container.querySelector('.time-range-editor-scroll')
    const actions = container.querySelector('.picker-actions')
    expect(body).not.toBeNull()
    expect(presetScroll?.contains(screen.getByRole('button', { name: 'Last hour' }))).toBe(true)
    expect(editorScroll?.contains(screen.getByLabelText('Start time'))).toBe(true)
    expect(body?.contains(actions)).toBe(false)
  })

  it('keeps the action buttons rendered and keyboard reachable alongside overflowing presets', () => {
    render(<TimeRangePopover draft={draft} setDraft={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clear' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Cancel' }).tabIndex).toBe(0)
    expect(screen.getByRole('button', { name: 'Confirm' }).tabIndex).toBe(0)
  })
})
