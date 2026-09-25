// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
const copyTextToClipboard = vi.hoisted(() => vi.fn())
vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('./NotificationArea', () => ({ notify }))
vi.mock('@lib/api', () => ({ api: { tempoPerformanceEnabled: false, connections: { tempo: { attributes: vi.fn().mockResolvedValue([]), attributeValues: vi.fn().mockResolvedValue([]) } }, query: { run: vi.fn() } } }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@uiw/react-codemirror', () => ({
  default: React.forwardRef(function MockCodeMirror({ value, onChange, ...props }: { value: string; onChange: (value: string) => void; 'aria-label'?: string }, _ref) {
    return <textarea aria-label={props['aria-label']} value={value} onChange={(event) => onChange(event.target.value)} />
  })
}))
vi.mock('./TraceBuilderPanel', () => ({ TraceBuilderPanel: ({ value, traceql, onOpenTraceql, onChange }: { value: { advancedFilters: Array<{ attribute: string; scope: 'resource' | 'span'; mode: 'include'; values: string[] }> }; traceql: string; onOpenTraceql: () => void; onChange: (patch: { advancedFilters: unknown[] }) => void }) => <div data-testid="trace-builder">Builder remains available<output>{traceql}</output><span data-testid="selected-facets">{value.advancedFilters.map((filter) => `${filter.attribute}:${filter.values.join(',')}`).join('|')}</span><button type="button" onClick={() => onChange({ advancedFilters: [{ attribute: 'resource.cloud.region', scope: 'resource', mode: 'include', values: ['eu-west-1', 'eu-west-3'] }] })}>Add facet</button><button type="button" onClick={() => onChange({ advancedFilters: [{ attribute: 'resource.a', scope: 'resource', mode: 'include', values: [] }, { attribute: 'span.b', scope: 'span', mode: 'include', values: [] }] })}>Select A and B</button><button type="button" onClick={() => onChange({ advancedFilters: value.advancedFilters.map((filter) => filter.attribute === 'resource.a' ? { ...filter, values: ['one'] } : filter) })}>Set A</button><button type="button" onClick={() => onChange({ advancedFilters: value.advancedFilters.map((filter) => filter.attribute === 'span.b' ? { ...filter, values: ['two'] } : filter) })}>Set B</button><button type="button" onClick={onOpenTraceql}>Open in TraceQL mode</button></div> }))
vi.mock('./results/traces/TraceScatterChart', () => ({
  TraceScatterChart: ({ onSelectRange }: { onSelectRange: (range: { kind: 'custom'; startDate: string; startTime: string; endDate: string; endTime: string; recurringWindows: [] }) => void }) => <button type="button" onClick={() => onSelectRange({ kind: 'custom', startDate: '2026-08-30', startTime: '10:00', endDate: '2026-08-30', endTime: '10:30', recurringWindows: [] })}>Refine scatter range</button>
}))

import { TraceExplorer } from './TraceExplorer'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '@test/sessionTestUtils'
import { useStore } from '@store/useStore'
import { formatTraceql } from '@lib/formatTraceql'
import { buildTraceql, traceBuilderFromTraceql } from '@lib/traceBuilder'
import { api } from '@lib/api'

describe('TraceExplorer TraceQL editor', () => {
  beforeEach(() => {
    resetTestStore()
    patchActiveTestSession({ connectionProfileId: 'tempo-1', queryMode: 'sql', sql: '{resource.service.name="checkout"}' })
    useStore.setState({ profiles: [{ id: 'tempo-1', name: 'Tempo', kind: 'tempo', version: 1, readonly: true, transport: { kind: 'gcx', context: 'test', datasourceUid: 'tempo-main' }, grafana: { baseUrl: 'https://grafana.example', datasourceType: 'tempo' } }] })
    notify.mockReset()
    vi.mocked(api.query.run).mockReset()
  })
  afterEach(cleanup)

  it('edits and locally formats Plain mode through CodeMirror', async () => {
    expect(formatTraceql('{duration>300ms}')).toEqual({ ok: true, query: '{ duration > 300ms }' })
    render(<TraceExplorer connectionId="tempo-1" />)
    expect(screen.getAllByText('Trace ID')).toHaveLength(1)
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

  it('disables and guards Tempo execution while metadata refreshes', () => {
    useStore.setState({ metadataByProfileId: { 'tempo-1': { schemas: [], status: 'loaded', error: null, isStale: false, refreshing: true } } })
    render(<TraceExplorer connectionId="tempo-1" />)
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    fireEvent.submit(run.closest('form')!)
    expect(api.query.run).not.toHaveBeenCalled()
  })

  it('executes and opens the Builder-generated TraceQL instead of stale manual SQL', async () => {
    patchActiveTestSession({ queryMode: 'builder', sql: 'select now();' })
    vi.mocked(api.query.run).mockResolvedValue({
      columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' }],
      rows: [], rowCount: 0, durationMs: 1
    })
    render(<TraceExplorer connectionId="tempo-1" />)

    expect(screen.getByTestId('trace-builder').querySelector('output')?.textContent).toBe('{ span:duration > 300ms }')
    expect((screen.getByRole('button', { name: 'Copy TraceQL to clipboard' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(api.query.run).toHaveBeenCalled())
    expect(vi.mocked(api.query.run).mock.calls[0]?.[1]).toBe('{ span:duration > 300ms }')
    expect(vi.mocked(api.query.run).mock.calls[0]?.[1]).not.toContain('select now()')
    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    const pane = JSON.parse(new URL(copyTextToClipboard.mock.calls.at(-1)![0]).searchParams.get('panes')!)
    expect(pane.datakoala.queries[0].query).toBe('{ span:duration > 300ms }')

    fireEvent.click(screen.getByRole('button', { name: 'Open in TraceQL mode' }))
    await waitFor(() => expect(activeTestSession().queryMode).toBe('sql'))
    expect(activeTestSession().sql).toBe('{ span:duration > 300ms }')
  })

  it('stores automatically formatted TraceQL after Builder edits', async () => {
    patchActiveTestSession({ queryMode: 'builder', sql: '{ }' })
    render(<TraceExplorer connectionId="tempo-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add facet' }))
    const generated = '{ (resource.cloud.region = "eu-west-1" || resource.cloud.region = "eu-west-3") && span:duration > 300ms }'
    const expected = formatTraceql(generated)
    expect(expected.ok).toBe(true)
    await waitFor(() => expect(activeTestSession().sql).toBe(expected.ok ? expected.query : ''))
    expect(screen.getByTestId('trace-builder').querySelector('output')?.textContent).toBe(generated)
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
    expect(activeTestSession().sql).toBe(buildTraceql(traceBuilderFromTraceql(generated)))
    expect(screen.getByRole('button', { name: 'TraceQL' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps Scatter selected when a range refinement reruns the search', async () => {
    const result = {
      columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' as const }],
      rows: [{ traceId: '00000000000000000000000000000001', rootService: 'service-01', rootOperation: 'GET /example', startTimeMs: Date.now() - 60_000, durationMs: 120, matchedSpans: 3, status: 'ok' }],
      rowCount: 1,
      durationMs: 1,
      notice: 'Synthetic search'
    }
    vi.mocked(api.query.run).mockResolvedValue(result)
    render(<TraceExplorer connectionId="tempo-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(screen.getByText('1 traces')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Scatter' }))
    expect(screen.getByRole('button', { name: 'Scatter' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Refine scatter range' }))
    await waitFor(() => expect(vi.mocked(api.query.run)).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scatter' }).getAttribute('aria-pressed')).toBe('true'))
    expect(screen.getByRole('button', { name: 'Refine scatter range' })).toBeTruthy()
  })

  it('opens search and direct-ID traces and returns to the retained search results', async () => {
    const searchedTraceId = '00000000000000000000000000000001'
    const directTraceId = '00000000000000000000000000000002'
    const searchResult = {
      columns: [{ name: 'traceId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' as const }],
      rows: [{ traceId: searchedTraceId, rootService: 'checkout', rootOperation: 'GET /cart', startTimeMs: 1_000, durationMs: 20, matchedSpans: 1 }],
      rowCount: 1,
      durationMs: 1
    }
    const openedResult = (id: string) => ({
      columns: [{ name: 'spanId', dataTypeID: 0, dataTypeName: 'text', logicalType: 'string' as const }],
      rows: [{ traceId: id, spanId: `span-${id}`, parentSpanId: '', service: 'checkout', name: 'GET /cart', startTimeMs: 1_000, durationMs: 20, kind: 'SERVER' }],
      rowCount: 1,
      durationMs: 1
    })
    vi.mocked(api.query.run)
      .mockResolvedValueOnce(searchResult)
      .mockResolvedValueOnce(openedResult(searchedTraceId))
      .mockResolvedValueOnce(openedResult(directTraceId))
    render(<TraceExplorer connectionId="tempo-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(screen.getByText('checkout')).toBeTruthy())
    fireEvent.click(screen.getByText('checkout'))
    await waitFor(() => expect(screen.getByText(`${searchedTraceId}`)).toBeTruthy())
    expect(vi.mocked(api.query.run).mock.calls[1]?.[1]).toBe(searchedTraceId)

    fireEvent.click(screen.getByRole('button', { name: '← Search results' }))
    expect(screen.getByText('checkout')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Trace ID'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open trace' }))
    await waitFor(() => expect(vi.mocked(api.query.run)).toHaveBeenCalledTimes(3))
    expect(vi.mocked(api.query.run).mock.calls[2]).toEqual(['tempo-1', directTraceId, [], undefined, undefined, true])
    await waitFor(() => expect(screen.getByText(directTraceId)).toBeTruthy())
  })
})