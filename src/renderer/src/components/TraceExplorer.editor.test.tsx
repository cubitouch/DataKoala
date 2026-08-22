import React from 'react'
void React
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('./NotificationArea', () => ({ notify }))
vi.mock('../lib/api', () => ({ api: { tempoPerformanceEnabled: false, query: { run: vi.fn() } } }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: React.forwardRef(function MockCodeMirror({ value, onChange, ...props }: { value: string; onChange: (value: string) => void; 'aria-label'?: string }, _ref) {
    return <textarea aria-label={props['aria-label']} value={value} onChange={(event) => onChange(event.target.value)} />
  })
}))
vi.mock('./TraceBuilderPanel', () => ({ TraceBuilderPanel: () => <div data-testid="trace-builder">Builder remains available</div> }))
vi.mock('./TraceScatterChart', () => ({ TraceScatterChart: () => null }))

import { TraceExplorer } from './TraceExplorer'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'
import { formatTraceql } from '../lib/formatTraceql'

describe('TraceExplorer TraceQL editor', () => {
  beforeEach(() => {
    resetTestStore()
    patchActiveTestSession({ connectionProfileId: 'tempo-1', queryMode: 'sql', sql: '{resource.service.name="checkout"}' })
    notify.mockReset()
  })
  afterEach(cleanup)

  it('edits and locally formats Plain mode through CodeMirror', async () => {
    expect(formatTraceql('{duration>300ms}')).toEqual({ ok: true, query: '{ duration > 300ms }' })
    render(<TraceExplorer connectionId="tempo-1" />)
    const editor = screen.getByLabelText('TraceQL editor')
    expect(editor.tagName).toBe('TEXTAREA') // CodeMirror is represented by the focused test double.
    expect((editor as HTMLTextAreaElement).value).toBe('{resource.service.name="checkout"}')
    expect(document.querySelector('#traceql-query')).toBeNull()
    fireEvent.change(editor, { target: { value: '{duration>300ms}' } })
    await waitFor(() => expect(activeTestSession().sql).toBe('{duration>300ms}'))
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    await waitFor(() => expect(activeTestSession().sql).toBe('{ duration > 300ms }'))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Formatted' }))
  })

  it('keeps Builder mode free of the Format action', () => {
    patchActiveTestSession({ queryMode: 'builder' })
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getByTestId('trace-builder')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Format' })).toBeNull()
    expect(screen.queryByLabelText('TraceQL editor')).toBeNull()
  })
})
