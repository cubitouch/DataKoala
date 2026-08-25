import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { copyTextToClipboard } = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }))
vi.mock('../../lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))

import { GeneratedQueryPanel } from './GeneratedQueryPanel'

describe('GeneratedQueryPanel', () => {
  beforeEach(() => copyTextToClipboard.mockReset())
  afterEach(cleanup)

  it('owns disclosure, preview, copy, supplementary content and open-in-editor behavior', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    const onOpenInEditor = vi.fn()
    const query = '{ resource.service.name = "checkout" }'

    render(<GeneratedQueryPanel
      language="TraceQL"
      value={query}
      onOpenInEditor={onOpenInEditor}
      supplementary={<span>Additional generated-query context</span>}
    />)

    const details = screen.getByText('Generated TraceQL').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)

    fireEvent.click(details.querySelector('summary') as HTMLElement)
    expect(details.open).toBe(true)
    expect((screen.getByLabelText('Generated TraceQL query') as HTMLTextAreaElement).value).toBe(query)
    expect(screen.getByText('Additional generated-query context')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy TraceQL to clipboard' }))
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(query))

    fireEvent.click(screen.getByRole('button', { name: 'Open in TraceQL mode' }))
    expect(onOpenInEditor).toHaveBeenCalledOnce()
    expect(details.open).toBe(true)
  })

  it('renders validation and empty states and disables open without a query', () => {
    const { rerender } = render(<GeneratedQueryPanel language="PromQL" value="" validation="Choose a histogram representation." onOpenInEditor={vi.fn()} openActionLabel="Open in PromQL" />)
    expect(screen.getByRole('status').textContent).toContain('Choose a histogram representation.')
    expect(screen.getByRole('button', { name: 'Open in PromQL' }).hasAttribute('disabled')).toBe(true)

    rerender(<GeneratedQueryPanel language="SQL" value="" emptyState="Select a table and X axis to preview SQL." />)
    expect(screen.getByText('Select a table and X axis to preview SQL.')).toBeTruthy()
  })
})