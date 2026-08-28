import React from 'react'
void React
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('./NotificationArea', () => ({ notify }))
vi.mock('../lib/api', () => ({ api: { tempoPerformanceEnabled: false, connections: { tempo: { attributes: vi.fn().mockResolvedValue([]), attributeValues: vi.fn().mockResolvedValue([]) } }, query: { run: vi.fn() } } }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: React.forwardRef(function MockCodeMirror({ value, onChange, ...props }: { value: string; onChange: (value: string) => void; 'aria-label'?: string }, _ref) {
    return <textarea aria-label={props['aria-label']} value={value} onChange={(event) => onChange(event.target.value)} />
  })
}))
vi.mock('./TraceBuilderPanel', () => ({ TraceBuilderPanel: ({ value, traceql, onOpenTraceql, onChange }: { value: { advancedFilters: Array<{ attribute: string; scope: 'resource' | 'span'; mode: 'include'; values: string[] }> }; traceql: string; onOpenTraceql: () => void; onChange: (patch: { advancedFilters: unknown[] }) => void }) => <div data-testid="trace-builder">Builder remains available<output>{traceql}</output><span data-testid="selected-facets">{value.advancedFilters.map((filter) => `${filter.attribute}:${filter.values.join(',')}`).join('|')}</span><button type="button" onClick={() => onChange({ advancedFilters: [{ attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1', 'eu-west-3'] }] })}>Add facet</button><button type="button" onClick={() => onChange({ advancedFilters: [{ attribute: 'resource.a', scope: 'resource', mode: 'include', values: [] }, { attribute: 'span.b', scope: 'span', mode: 'include', values: [] }] })}>Select A and B</button><button type="button" onClick={() => onChange({ advancedFilters: value.advancedFilters.map((filter) => filter.attribute === 'resource.a' ? { ...filter, values: ['one'] } : filter) })}>Set A</button><button type="button" onClick={() => onChange({ advancedFilters: value.advancedFilters.map((filter) => filter.attribute === 'span.b' ? { ...filter, values: ['two'] } : filter) })}>Set B</button><button type="button" onClick={onOpenTraceql}>Open in TraceQL mode</button></div> }))
vi.mock('./TraceScatterChart', () => ({ TraceScatterChart: () => null }))

import { TraceExplorer } from './TraceExplorer'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'
import { formatTraceql } from '../lib/formatTraceql'

describe('TraceExplorer TraceQL editor', () => {
  beforeEach(() => {
    resetTestStore()
    patchActiveTestSession({ connectionProfileId: 'tempo-1', queryMode: 'sql', sql: '{resource.service.name="checkout"}' })
    useStore.setState({ profiles: [{ id: 'tempo-1', name: 'Tempo', kind: 'tempo', version: 1, readonly: true, transport: { kind: 'gcx', context: 'test' } }] })
    notify.mockReset()
  })
  afterEach(cleanup)

  it('edits and locally formats Plain mode through CodeMirror', async () => {
    expect(formatTraceql('{duration>300ms}')).toEqual({ ok: true, query: '{ duration > 300ms }' })
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getAllByLabelText('Query mode')[0].textContent).toBe('TraceQLBuilder')
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('data-tempo-run-query')).toBe(true)
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

  it('stores automatically formatted TraceQL after Builder edits', async () => {
    patchActiveTestSession({ queryMode: 'builder', sql: '{ }' })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add facet' }))
    const expected = formatTraceql('{ (resource.cloud.region = "eu-west-1" || resource.cloud.region = "eu-west-3") }')
    expect(expected.ok).toBe(true)
    await waitFor(() => expect(activeTestSession().sql).toBe(expected.ok ? expected.query : ''))
    expect(screen.getByTestId('trace-builder').querySelector('output')?.textContent).toBe(expected.ok ? expected.query : '')
    expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Formatted' }))
  })

  it('preserves incomplete selected facets while other facet values change', async () => {
    patchActiveTestSession({ queryMode: 'builder', sql: '{ }' })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select A and B' }))
    expect(screen.getByTestId('selected-facets').textContent).toBe('resource.a:|span.b:')
    fireEvent.click(screen.getByRole('button', { name: 'Set A' }))
    await waitFor(() => expect(screen.getByTestId('selected-facets').textContent).toBe('resource.a:one|span.b:'))
    fireEvent.click(screen.getByRole('button', { name: 'Set B' }))
    await waitFor(() => expect(screen.getByTestId('selected-facets').textContent).toBe('resource.a:one|span.b:two'))
    expect(activeTestSession().sql).toContain('resource.a = "one"')
    expect(activeTestSession().sql).toContain('span.b = "two"')
  })

  it('keeps the primary action named Run for exhaustive searches', () => {
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getAllByText('Sample size')).toHaveLength(1)
    fireEvent.click(screen.getByRole('combobox', { name: /Sample size:/ }))
    fireEvent.click(screen.getByRole('option', { name: 'All traces' }))
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('data-tempo-run-query')).toBe(true)
  })

  it('opens the generated query in TraceQL mode without changing it', async () => {
    const generated = '{ resource.service.name = "checkout" && duration > 300ms }'
    patchActiveTestSession({ queryMode: 'builder', sql: generated })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open in TraceQL mode' }))
    await waitFor(() => expect(activeTestSession().queryMode).toBe('sql'))
    expect(activeTestSession().sql).toBe(generated)
    expect(screen.getByRole('button', { name: 'TraceQL' }).getAttribute('aria-pressed')).toBe('true')
  })
})
