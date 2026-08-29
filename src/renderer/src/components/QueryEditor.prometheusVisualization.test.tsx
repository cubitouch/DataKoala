import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { queryRun, promqlAsExtension } = vi.hoisted(() => ({
  queryRun: vi.fn(),
  promqlAsExtension: vi.fn(() => ({}))
}))

vi.mock('../lib/api', () => ({
  api: {
    connections: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      list: vi.fn(),
      listObjects: vi.fn(),
      prometheus: { formatQuery: vi.fn(), labelsForMetric: vi.fn(), labelValues: vi.fn() }
    },
    query: { explain: vi.fn(), run: queryRun },
    export: { saveText: vi.fn() }
  }
}))
vi.mock('@uiw/react-codemirror', () => ({ default: () => <textarea aria-label="PromQL editor" /> }))
vi.mock('@codemirror/lang-sql', () => {
  const dialect = { spec: {}, language: { data: { of: () => ({}) } } }
  return { sql: () => ({}), PostgreSQL: dialect, StandardSQL: dialect, SQLDialect: { define: () => dialect } }
})
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))
vi.mock('@prometheus-io/codemirror-promql', () => ({ PromQLExtension: class { asExtension() { return promqlAsExtension() } } }))
vi.mock('./ModeSwitch', () => ({ ModeSwitch: () => <div aria-label="Query mode" /> }))
vi.mock('./NotificationArea', () => ({ notify: vi.fn() }))

import { QueryEditor } from './QueryEditor'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

const profileId = 'prom-visualization'
const result = {
  columns: [
    { name: 'timestamp', dataTypeName: 'timestamp' },
    { name: 'value', dataTypeName: 'double precision' }
  ],
  rows: [{ timestamp: '2026-08-18T04:00:00.000Z', value: 1 }]
}

function arrange(lastSuccessfulResultRevision: number, view: 'table' | 'bar' | 'line') {
  resetTestStore({
    profiles: [{ id: profileId, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'prom-main' } }],
    activeProfileId: profileId,
    connected: true,
    connecting: false,
    connectionStatus: 'connected'
  })
  patchActiveTestSession({
    connectionProfileId: profileId,
    queryMode: 'sql',
    sql: 'up',
    lastSuccessfulResultRevision,
    sqlVisualization: {
      view,
      xColumn: 'timestamp',
      valueColumn: 'value',
      aggregation: 'sum',
      seriesColumn: null,
      seriesColumns: [],
      hierarchyDimensions: [],
      valueAxisScale: 'linear',
      anomalyDetectionEnabled: false
    }
  })
  render(<QueryEditor />)
}

beforeEach(() => {
  queryRun.mockReset().mockResolvedValue(result)
})

afterEach(() => { cleanup(); resetTestStore() })

describe('Prometheus visualization defaults', () => {
  it('preserves an explicit visualization when rerunning PromQL', async () => {
    arrange(1, 'bar')

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(queryRun).toHaveBeenCalledOnce())
    await waitFor(() => expect(activeTestSession().running).toBe(false))

    expect(activeTestSession().sqlVisualization.view).toBe('bar')
  })

  it('defaults the first successful PromQL result to a line chart', async () => {
    arrange(0, 'table')

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(queryRun).toHaveBeenCalledOnce())
    await waitFor(() => expect(activeTestSession().running).toBe(false))

    expect(activeTestSession().sqlVisualization.view).toBe('line')
  })
})
