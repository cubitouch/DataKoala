import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { explain, runQuery, formatQuery, labelsForMetric, labelValues, promqlAsExtension, notify } = vi.hoisted(() => ({ explain: vi.fn(), runQuery: vi.fn(), formatQuery: vi.fn(), labelsForMetric: vi.fn(), labelValues: vi.fn(), promqlAsExtension: vi.fn(() => ({})), notify: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { prometheus: { formatQuery, labelsForMetric, labelValues } }, query: { explain, run: runQuery }, export: { saveText: vi.fn() } } }))
vi.mock('./NotificationArea', () => ({ notify }))
vi.mock('@uiw/react-codemirror', () => ({ default: ({ value, onChange, editable = true, ...props }: { value: string, onChange: (value: string) => void, editable?: boolean, 'aria-label'?: string }) => <textarea aria-label={props['aria-label'] ?? 'SQL editor'} value={value} disabled={!editable} onChange={(event) => onChange(event.target.value)} /> }))
vi.mock('@codemirror/lang-sql', () => {
  const dialect = { spec: {}, language: { data: { of: () => ({}) } } }
  return { sql: () => ({}), PostgreSQL: dialect, StandardSQL: dialect, SQLDialect: { define: () => dialect } }
})
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@prometheus-io/codemirror-promql', () => ({ PromQLExtension: class { asExtension() { return promqlAsExtension() } } }))
vi.mock('./ModeSwitch', () => ({ ModeSwitch: () => <div aria-label="Query mode" /> }))

import { QueryEditor } from './QueryEditor'
import { ExplainPane } from './ExplainPane'
import { patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function renderExplainUi() {
  resetTestStore({ activeProfileId: 'profile-1', connected: true, connecting: false, connectionStatus: 'connected' })
  patchActiveTestSession({ connectionProfileId: 'profile-1', sql: 'select 1;', explainText: 'previous plan', showExplain: true, activeExplainRequest: null })
  render(<><QueryEditor /><ExplainPane /></>)
}

beforeEach(() => {
  explain.mockReset()
  explain.mockResolvedValue({ text: 'new plan' })
  runQuery.mockReset()
  formatQuery.mockReset()
  labelsForMetric.mockReset(); labelsForMetric.mockResolvedValue([])
  labelValues.mockReset(); labelValues.mockResolvedValue([])
  promqlAsExtension.mockClear()
  notify.mockReset()
})

describe('PromQL execution', () => {
  function renderPromql(query = 'up') {
    resetTestStore({ profiles: [{ id: 'prom-1', name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'prom-main' } }], activeProfileId: 'prom-1', connected: true, connecting: false, connectionStatus: 'connected' })
    patchActiveTestSession({ connectionProfileId: 'prom-1', queryMode: 'sql', sql: query })
    render(<QueryEditor />)
  }

  it('uses the PromQL editor and delivers normalized rows with timeseries defaults', async () => {
    const result = { columns: [
      { name: 'timestamp', dataTypeID: 1184, dataTypeName: 'timestamptz' },
      { name: 'value', dataTypeID: 701, dataTypeName: 'double precision' },
      { name: 'instance', dataTypeID: 25, dataTypeName: 'text' }
    ], rows: [{ timestamp: '2026-08-14T10:00:00.000Z', value: 1, instance: 'a' }], rowCount: 1, durationMs: 10 }
    runQuery.mockResolvedValue(result)
    resetTestStore({ profiles: [{ id: 'prom-1', name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }], activeProfileId: 'prom-1', connected: true, connecting: false, connectionStatus: 'connected' })
    patchActiveTestSession({ connectionProfileId: 'prom-1', queryMode: 'sql', sql: 'up' })
    render(<QueryEditor />)

    expect(screen.getByLabelText('PromQL editor')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    const call = runQuery.mock.calls[0]
    expect(call[0]).toBe('prom-1')
    expect(call[1]).toBe('up')
    expect(call[3]).toMatchObject({ step: '15s' })
    await waitFor(() => expect(useStore.getState().tabs[0].result?.rows).toEqual(result.rows))
    expect(useStore.getState().tabs[0].sqlVisualization).toMatchObject({ view: 'line', xColumn: 'timestamp', valueColumn: 'value', seriesColumn: null, seriesColumns: [] })
  })

  it('activates the local PromQL language extension independently of remote formatting', () => {
    renderPromql('bad(')
    expect(promqlAsExtension).toHaveBeenCalledOnce()
    expect(formatQuery).not.toHaveBeenCalled()
  })

  it('groups the shared date-range picker and Resolution while hiding SQL-only actions', () => {
    renderPromql()
    expect(screen.getByRole('button', { name: /Time range: Last hour/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Resolution:/ })).toBeTruthy()
    expect(screen.getAllByText('Resolution')).toHaveLength(1)
    const help = screen.getByRole('button', { name: 'Resolution help' })
    expect(help.tabIndex).toBe(0)
    expect(help.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.queryByLabelText('PromQL range start')).toBeNull()
    expect(screen.queryByText('From')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain Analyze' })).toBeNull()
    expect(screen.queryByText('⌘↵ run')).toBeNull()
    expect(screen.getByRole('button', { name: 'Run' }).title).toContain('Ctrl/Command+Enter')
  })

  it('persists each Resolution selection in the existing prometheusStep state', async () => {
    renderPromql()
    expect(useStore.getState().tabs[0].prometheusStep).toBe('auto')
    expect(screen.getByRole('combobox', { name: /Resolution: Auto \(15s\)/ })).toBeTruthy()
    for (const step of ['30s', '1m', '5m'] as const) {
      fireEvent.click(screen.getByRole('combobox', { name: /Resolution:/ }))
      fireEvent.click(await screen.findByRole('option', { name: step }))
      expect(useStore.getState().tabs[0].prometheusStep).toBe(step)
    }
  })

  it('uses a coarser Auto server-side step as the range grows', async () => {
    renderPromql()
    useStore.getState().setPrometheusQueryOptions({ prometheusTimeRange: { kind: 'custom', startDate: '2026-05-01', startTime: '00:00', endDate: '2026-07-30', endTime: '00:00', recurringWindows: [] }, prometheusStep: 'auto' })
    runQuery.mockResolvedValue({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    expect(runQuery.mock.calls[0][3].step).toBe('2h')
  })

  it('blocks an unsafe manual resolution without calling the backend', async () => {
    renderPromql()
    useStore.getState().setPrometheusQueryOptions({ prometheusTimeRange: { kind: 'rolling', amount: 30, unit: 'day' }, prometheusStep: '15s' })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(useStore.getState().tabs[0].queryError).toMatch(/Too many data points for this Resolution/))
    expect(runQuery).not.toHaveBeenCalled()
    expect(useStore.getState().tabs[0].running).toBe(false)
    expect(useStore.getState().connected).toBe(true)
  })

  it('can rerun successfully after an oversized provider error without reconnecting', async () => {
    renderPromql()
    runQuery.mockRejectedValueOnce(new Error('Too many data points — use Auto, increase the Resolution, or reduce the time range.'))
      .mockResolvedValueOnce({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(useStore.getState().tabs[0].queryError).toMatch(/Too many data points/))
    expect(screen.getByLabelText('PromQL editor').hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(useStore.getState().tabs[0].queryError).toBeNull())
    expect(useStore.getState().connected).toBe(true)
  })

  it('defaults Prometheus Builder chart Series from all Group by labels', async () => {
    labelsForMetric.mockResolvedValue(['continent', 'service'])
    runQuery.mockResolvedValue({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
    resetTestStore({ profiles: [{ id: 'prom-1', name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }], activeProfileId: 'prom-1', connected: true, connecting: false, connectionStatus: 'connected' })
    patchActiveTestSession({ connectionProfileId: 'prom-1', queryMode: 'builder', sql: 'sum by (continent, service) (up)', promqlBuilder: { metric: 'up', filterBy: [], groupBy: ['continent', 'service'], labelValues: {}, calculation: 'raw', aggregation: 'sum', window: '5m', percentile: 0.95 } })
    render(<QueryEditor builderMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    await waitFor(() => expect(useStore.getState().tabs[0].sqlVisualization).toMatchObject({ xColumn: 'timestamp', valueColumn: 'value', seriesColumn: null, seriesColumns: ['continent', 'service'] }))
  })

  it('formats PromQL through the Prometheus API without executing it', async () => {
    formatQuery.mockResolvedValue('sum by (status) (rate(http_requests_total{service="api"}[5m]))')
    renderPromql('sum by(status)(rate(http_requests_total{service="api"}[5m]))')
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    await waitFor(() => expect(useStore.getState().tabs[0].sql).toBe('sum by (status) (rate(http_requests_total{service="api"}[5m]))'))
    expect(formatQuery).toHaveBeenCalledWith('prom-1', 'sum by(status)(rate(http_requests_total{service="api"}[5m]))')
    expect(runQuery).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith({ message: 'Formatted', duration: 2600 })
  })

  it('preserves PromQL when formatting fails and ignores duplicate clicks', async () => {
    const request = deferred<string>()
    formatQuery.mockReturnValue(request.promise)
    renderPromql('sum(')
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(screen.getByRole('button', { name: 'Formatting…' }))
    expect(formatQuery).toHaveBeenCalledTimes(1)
    request.reject(new Error('bad_data: parse error'))
    await waitFor(() => expect(notify).toHaveBeenCalledWith({ message: 'bad_data: parse error', duration: 3200 }))
    expect(useStore.getState().tabs[0].sql).toBe('sum(')
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('disables Format for whitespace and runs the selected range and Resolution from keyboard', async () => {
    renderPromql('   ')
    expect(screen.getByRole('button', { name: 'Format' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('PromQL editor'), { target: { value: 'up' } })
    useStore.getState().setPrometheusQueryOptions({ prometheusTimeRange: { kind: 'custom', startDate: '2026-08-10', startTime: '12:00', endDate: '2026-08-11', endTime: '13:30', recurringWindows: [] }, prometheusStep: '5m' })
    runQuery.mockResolvedValue({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
    fireEvent.keyDown(screen.getByLabelText('PromQL editor'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    expect(runQuery.mock.calls[0][3]).toEqual({ start: '2026-08-10T12:00:00.000Z', end: '2026-08-11T13:30:00.000Z', step: '5m' })
  })
})
afterEach(() => { cleanup(); resetTestStore() })

describe('QueryEditor Explain loading states', () => {
  it('follows datasource capabilities when the active tab changes', () => {
    resetTestStore({ profiles: [
      { kind: 'postgres', version: 1, id: 'pg', name: 'PG', host: 'localhost', port: 5432, database: 'db', user: 'user', password: '', ssl: false, readonly: true },
      { kind: 'bigquery', version: 1, id: 'bq', name: 'BQ', billingProject: 'billing', maximumBytesBilled: '', readonly: true }
    ], activeProfileId: 'bq', connected: true, connecting: false, connectionStatus: 'connected' })
    patchActiveTestSession({ connectionProfileId: 'bq', sql: 'select 1' })
    const view = render(<QueryEditor />)
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explain Analyze' })).toBeNull()
    useStore.setState((state) => ({ tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: 'pg' })), activeProfileId: 'pg' }))
    view.rerender(<QueryEditor />)
    expect(screen.getByRole('button', { name: 'Explain' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explain Analyze' })).toBeTruthy()
    expect(explain).not.toHaveBeenCalled()
  })
  it('keeps SQL formatting local', async () => {
    renderExplainUi()
    fireEvent.change(screen.getByLabelText('SQL editor'), { target: { value: 'select 1 from users' } })
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    await waitFor(() => expect(useStore.getState().tabs[0].sql).toContain('SELECT'))
    expect(formatQuery).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith({ message: 'Formatted', duration: 2600 })
  })
  it('keeps SQL Explain actions and does not expose Prometheus Resolution', () => {
    renderExplainUi()
    expect(screen.getByRole('button', { name: 'Explain' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explain Analyze' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Resolution:/ })).toBeNull()
  })
  it('shows Explaining, disables both buttons, preserves the previous plan, and ends after success', async () => {
    const request = deferred<{ text: string }>()
    explain.mockReturnValueOnce(request.promise)
    renderExplainUi()

    fireEvent.click(screen.getByRole('button', { name: 'Explain' }))

    expect(screen.getByRole('button', { name: 'Explaining…' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Explain Analyze' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Generating query plan…').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText('previous plan')).toBeTruthy()
    expect(screen.getByLabelText('SQL editor')).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Explaining…' }))
    await waitFor(() => expect(explain).toHaveBeenCalledTimes(1))
    expect(explain).toHaveBeenCalledWith('profile-1', 'select 1;', false)

    request.resolve({ text: 'new plan' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Explain' }).hasAttribute('disabled')).toBe(false))
    expect(screen.getByText('new plan')).toBeTruthy()
    expect(screen.queryByText('Generating query plan…')).toBeNull()
  })

  it('shows Analyzing, sends analyze=true, and ends after failure through existing error text', async () => {
    const request = deferred<{ text: string }>()
    explain.mockReturnValueOnce(request.promise)
    renderExplainUi()

    fireEvent.click(screen.getByRole('button', { name: 'Explain Analyze' }))

    expect(screen.getByRole('button', { name: 'Analyzing…' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Explain' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Running EXPLAIN ANALYZE…').getAttribute('aria-live')).toBe('polite')
    await waitFor(() => expect(explain).toHaveBeenCalledWith('profile-1', 'select 1;', true))

    request.reject(new Error('explain failed'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Explain Analyze' }).hasAttribute('disabled')).toBe(false))
    expect(screen.getByText('explain failed')).toBeTruthy()
    expect(screen.queryByText('Running EXPLAIN ANALYZE…')).toBeNull()
  })

  it('keeps toolbar button widths stable with explicit minimum widths', () => {
    renderExplainUi()
    expect(screen.getByRole('button', { name: 'Explain' }).className).toContain('explain-action')
    expect(screen.getByRole('button', { name: 'Explain Analyze' }).className).toContain('analyze')
  })
})
