import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { explain, runQuery } = vi.hoisted(() => ({ explain: vi.fn(), runQuery: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { query: { explain, run: runQuery }, export: { saveText: vi.fn() } } }))
vi.mock('@uiw/react-codemirror', () => ({ default: ({ value, onChange, editable = true, ...props }: { value: string, onChange: (value: string) => void, editable?: boolean, 'aria-label'?: string }) => <textarea aria-label={props['aria-label'] ?? 'SQL editor'} value={value} disabled={!editable} onChange={(event) => onChange(event.target.value)} /> }))
vi.mock('@codemirror/lang-sql', () => {
  const dialect = { spec: {}, language: { data: { of: () => ({}) } } }
  return { sql: () => ({}), PostgreSQL: dialect, StandardSQL: dialect, SQLDialect: { define: () => dialect } }
})
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
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
})

describe('PromQL execution', () => {
  it('uses the PromQL editor and delivers normalized rows with timeseries defaults', async () => {
    const result = { columns: [
      { name: 'timestamp', dataTypeID: 1184, dataTypeName: 'timestamptz' },
      { name: 'value', dataTypeID: 701, dataTypeName: 'double precision' },
      { name: 'series', dataTypeID: 25, dataTypeName: 'text' }
    ], rows: [{ timestamp: '2026-08-14T10:00:00.000Z', value: 1, series: '{instance="a"}' }], rowCount: 1, durationMs: 10 }
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
    expect(call[3]).toMatchObject({ step: '30s' })
    await waitFor(() => expect(useStore.getState().tabs[0].result?.rows).toEqual(result.rows))
    expect(useStore.getState().tabs[0].sqlVisualization).toMatchObject({ view: 'line', xColumn: 'timestamp', valueColumn: 'value', seriesColumn: 'series' })
  })
})
afterEach(() => { cleanup(); resetTestStore() })

describe('QueryEditor Explain loading states', () => {
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
