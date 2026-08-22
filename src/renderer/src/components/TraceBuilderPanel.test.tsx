import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { copyTextToClipboard } = vi.hoisted(() => ({ copyTextToClipboard: vi.fn() }))
vi.mock('../lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))
vi.mock('./ui/combobox', () => ({
  Combobox: ({ label, value }: { label: string; value: string }) => <button type="button" aria-label={`${label}: ${value}`}>{value}</button>
}))

import { EMPTY_TRACE_BUILDER } from '../lib/traceBuilder'
import { TraceBuilderPanel } from './TraceBuilderPanel'

describe('TraceBuilderPanel generated TraceQL', () => {
  beforeEach(() => copyTextToClipboard.mockReset())
  afterEach(cleanup)

  it('starts collapsed, expands the complete query, copies TraceQL, and opens plain mode', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    const onOpenTraceql = vi.fn()
    const traceql = '{ resource.service.name = "checkout" && duration > 300ms }'
    render(<TraceBuilderPanel
      value={{ ...EMPTY_TRACE_BUILDER, service: 'checkout', minDurationMs: '300' }}
      traceql={traceql}
      schemas={[]}
      metadataStatus="loaded"
      metadataError={null}
      messagingSystems={[]}
      messagingSystemsLoading={false}
      messagingSystemsError={null}
      onChange={vi.fn()}
      onOpenTraceql={onOpenTraceql}
    />)

    const disclosure = screen.getByText('Generated TraceQL').closest('details') as HTMLDetailsElement
    expect(disclosure).toBeTruthy()
    expect(disclosure.open).toBe(false)
    expect(screen.getByText('Generated TraceQL')).toBeTruthy()

    fireEvent.click(disclosure.querySelector('summary') as HTMLElement)
    expect(disclosure.open).toBe(true)
    expect((screen.getByLabelText('Generated TraceQL query') as HTMLTextAreaElement).value).toBe(traceql)

    fireEvent.click(screen.getByRole('button', { name: 'Copy TraceQL to clipboard' }))
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(traceql))

    fireEvent.click(screen.getByRole('button', { name: 'Open in TraceQL mode' }))
    expect(onOpenTraceql).toHaveBeenCalledOnce()
    expect(disclosure.open).toBe(true)
  })
})
