import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LokiExplorer } from './LokiExplorer'
const mocks = vi.hoisted(() => ({ labels: vi.fn(), labelValues: vi.fn(), formatQuery: vi.fn(), runLoki: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { loki: { labels: mocks.labels, labelValues: mocks.labelValues, formatQuery: mocks.formatQuery } }, query: { runLoki: mocks.runLoki } } }))
import { createQuerySession, useStore } from '../store/useStore'
import { clearLokiLabelsResources } from '../lib/useLokiLabelsResource'
void React

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <textarea aria-label="LogQL editor" value={value} readOnly /> }))
vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="loki-echarts" /> }))

const metric = { resultKind: 'metrics' as const, columns: [{ name: 'timestamp', dataTypeID: 0, dataTypeName: 'timestamp' }, { name: 'value', dataTypeID: 0, dataTypeName: 'number' }], rows: [{ timestamp: '2026-01-01T00:00:00Z', value: 2 }], rowCount: 1, durationMs: 1, execution: { provider: 'loki' as const, durationMs: 1 } }
const logs = { resultKind: 'logs' as const, logRows: [], columns: [], rows: [], rowCount: 0, durationMs: 1, execution: { provider: 'loki' as const, durationMs: 1 } }

afterEach(() => { cleanup(); clearLokiLabelsResources() })
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  const tab = createQuerySession(1, { id: 'loki-tab', connectionProfileId: 'loki', queryMode: 'sql', sql: '{app="x"}' })
  useStore.setState({ tabs: [tab], activeTabId: tab.id, activeProfileId: 'loki', connected: true, connectionStatus: 'connected', connectionGeneration: 1, profiles: [{ id: 'loki', name: 'Production logs', kind: 'loki', version: 1, readonly: true, transport: { kind: 'gcx', context: 'test' } }] })
  mocks.labels.mockReset().mockResolvedValue(['app', 'service'])
  mocks.labelValues.mockReset().mockResolvedValue(['x'])
  mocks.runLoki.mockReset()
})

describe('LokiExplorer execution', () => {
  it('keeps saved Builder metadata controls unavailable without requests while disconnected', () => {
    const tab = createQuerySession(1, { id: 'disconnected-builder', connectionProfileId: 'loki', queryMode: 'builder' })
    tab.lokiBuilder = { labelMatchers: [{ label: 'app', operator: '=', value: 'saved', values: ['saved'] }], lineFilters: [{ operator: '|=', value: 'timeout' }], parsers: [], fieldFilters: [] }
    tab.lokiGroupBy = ['app']
    useStore.setState({ tabs: [tab], activeTabId: tab.id, connected: false, connectionStatus: 'reconnecting', connectionGeneration: 2 })
    render(<LokiExplorer connectionId="loki" />)
    expect(mocks.labels).not.toHaveBeenCalled()
    expect(mocks.labelValues).not.toHaveBeenCalled()
    expect(screen.queryByText(/This profile is not connected/)).toBeNull()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.getByRole('combobox', { name: /Filter by/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: /Group by/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: /app values/ }).hasAttribute('disabled')).toBe(true)
    expect(useStore.getState().tabs[0].lokiBuilder).toEqual(tab.lokiBuilder)
    expect(useStore.getState().tabs[0].lokiGroupBy).toEqual(['app'])
  })

  it('ignores a Builder value failure after disconnect and reloads metadata on reconnect', async () => {
    let rejectValue!: (reason: unknown) => void
    const pendingValue = new Promise<string[]>((_, reject) => { rejectValue = reject })
    mocks.labelValues.mockReturnValueOnce(pendingValue).mockResolvedValueOnce(['fresh'])
    const tab = createQuerySession(1, { id: 'value-race', connectionProfileId: 'loki', queryMode: 'builder' })
    tab.lokiBuilder = { labelMatchers: [{ label: 'app', operator: '=', value: 'saved', values: ['saved'] }], lineFilters: [], parsers: [], fieldFilters: [] }
    tab.lokiGroupBy = ['app']
    useStore.setState({ tabs: [tab], activeTabId: tab.id })
    render(<LokiExplorer connectionId="loki" />)
    await waitFor(() => expect(mocks.labelValues).toHaveBeenCalledTimes(1))
    act(() => useStore.setState({ connected: false, connectionStatus: 'reconnecting', connectionGeneration: 2 }))
    await act(async () => { rejectValue(new Error('This profile is not connected')); await pendingValue.catch(() => undefined) })
    expect(screen.queryByText(/This profile is not connected/)).toBeNull()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.getByRole('combobox', { name: /app values/ }).hasAttribute('disabled')).toBe(true)

    act(() => useStore.setState({ connected: true, connectionStatus: 'connected', connectionGeneration: 3 }))
    await waitFor(() => expect(mocks.labels).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.labelValues).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('combobox', { name: /app values/ }).hasAttribute('disabled')).toBe(false)
    expect(useStore.getState().tabs[0].lokiBuilder).toEqual(tab.lokiBuilder)
    expect(useStore.getState().tabs[0].lokiGroupBy).toEqual(['app'])
  })

  it('uses the standard toolbar and a collapsed themed Builder query disclosure', async () => {
    const tab = createQuerySession(1, { id: 'builder-tab', connectionProfileId: 'loki', queryMode: 'builder' })
    tab.lokiBuilder = { labelMatchers: [{ label: 'app', operator: '=', value: 'x' }], lineFilters: [{ operator: '|=', value: 'timeout' }], parsers: [], fieldFilters: [] }
    useStore.setState({ tabs: [tab], activeTabId: tab.id })
    const { container } = render(<LokiExplorer connectionId="loki" />)
    await waitFor(() => expect(mocks.labels).toHaveBeenCalled())
    expect(container.querySelector('[data-query-toolbar]')).toBeTruthy()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toContain('LogQL')
    expect(screen.getByRole('button', { name: 'Run' }).closest('.execution-group')).toBeTruthy()
    expect(screen.getByText('Generated LogQL').closest('details')?.hasAttribute('open')).toBe(false)
    expect(screen.queryByText('Stream filters')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh metadata' })).toBeNull()
    expect(screen.queryByText('Advanced match operators')).toBeNull()
    const labelPicker = screen.getByRole('combobox', { name: /Filter by/ })
    expect(labelPicker).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /app values/ })).toBeTruthy()
    fireEvent.click(labelPicker)
    fireEvent.click(await screen.findByRole('option', { name: 'service' }))
    const serviceValues = screen.getByRole('combobox', { name: /service values/ })
    fireEvent.click(serviceValues)
    fireEvent.click(await screen.findByRole('option', { name: 'x' }))
    fireEvent.change(screen.getByLabelText('Line contains'), { target: { value: 'timeout' } })
    fireEvent.click(screen.getByRole('combobox', { name: /Filter by/ }))
    const groupBy = screen.getByRole('combobox', { name: /Group by/ })
    fireEvent.click(groupBy)
    fireEvent.click(await screen.findByRole('option', { name: 'app' }))
    fireEvent.click(await screen.findByRole('option', { name: 'service' }))
    expect(useStore.getState().tabs[0].lokiGroupBy).toEqual(['app', 'service'])
    fireEvent.click(screen.getByText('Generated LogQL'))
    const generated = (screen.getByLabelText('LogQL editor') as HTMLTextAreaElement).value
    expect(generated).toContain('app="x"')
    expect(generated).toContain('service="x"')
    expect(generated).toContain('|= "timeout"')
  })

  it('renders Limit as a complete numeric field without squeezing its input', () => {
    render(<LokiExplorer connectionId="loki" />)
    const input = screen.getByLabelText('Limit') as HTMLInputElement
    expect(input.type).toBe('number')
    expect(input.min).toBe('1')
    expect(input.max).toBe('5000')
    expect(input.closest('[data-field]')?.className).toContain('inline')
  })

  it('does not request or render a synthetic trend for metric LogQL', async () => {
    useStore.getState().setSql('sum(count_over_time({app="x"}[1m]))')
    const run = mocks.runLoki.mockResolvedValue(metric)
    render(<LokiExplorer connectionId="loki" />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Log volume trend')).toBeNull()
  })

  it('loads and renders log volume only when Chart is selected', async () => {
    const run = mocks.runLoki.mockResolvedValueOnce(logs).mockResolvedValueOnce(metric)
    render(<LokiExplorer connectionId="loki" />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const picker = screen.getByRole('toolbar', { name: 'Result view' })
    for (const view of ['List', 'Table', 'Bar', 'Line', 'Area', 'Scatter', 'Treemap', 'Sunburst']) expect(screen.getByRole('button', { name: view })).toBeTruthy()
    expect(screen.getAllByRole('toolbar', { name: 'Result view' })).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Search loaded logs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('toolbar', { name: 'Result view' })).toBe(picker)
    expect(screen.queryByRole('textbox', { name: 'Search loaded logs' })).toBeNull()
    expect(document.querySelector('[data-result-explorer]')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('loki-echarts')).toBeTruthy())
  })

  it('does not deliver a deferred tab A query into tab B', async () => {
    let resolveQuery!: (value: typeof metric) => void
    const deferred = new Promise<typeof metric>((resolve) => { resolveQuery = resolve })
    const tabA = createQuerySession(1, { id: 'tab-a', connectionProfileId: 'loki', queryMode: 'sql', sql: 'sum(count_over_time({app="a"}[1m]))' })
    const tabB = createQuerySession(2, { id: 'tab-b', connectionProfileId: 'loki', queryMode: 'sql', sql: '{app="b"}' })
    const sentinel = { columns: [], rows: [{ tab: 'b' }], rowCount: 1, durationMs: 0 }
    tabB.result = sentinel
    useStore.setState({ tabs: [tabA, tabB], activeTabId: tabA.id })
    mocks.runLoki.mockReturnValue(deferred)
    render(<LokiExplorer connectionId="loki" />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(mocks.runLoki).toHaveBeenCalledTimes(1))
    act(() => useStore.setState({ activeTabId: tabB.id }))
    await act(async () => { resolveQuery(metric); await deferred })
    expect(useStore.getState().tabs.find(({ id }) => id === tabB.id)?.result).toBe(sentinel)
    expect(screen.queryByLabelText('Log volume trend')).toBeNull()
  })
})
