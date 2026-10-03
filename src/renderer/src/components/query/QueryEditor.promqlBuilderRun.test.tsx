// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues, promqlAsExtension, formatQuery, runQuery } = vi.hoisted(() => ({
  labelsForMetric: vi.fn(),
  labelValues: vi.fn(),
  promqlAsExtension: vi.fn(() => ({})),
  formatQuery: vi.fn(),
  runQuery: vi.fn()
}))
const copyTextToClipboard = vi.hoisted(() => vi.fn())
vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard }))

vi.mock('@lib/api', () => ({
  api: {
    connections: { prometheus: { formatQuery, labelsForMetric, labelValues } },
    query: { explain: vi.fn(), run: runQuery },
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
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify: vi.fn() }))

import { QueryEditor } from './QueryEditor'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '@test/sessionTestUtils'

function arrange(metric: string, metadataType: string | undefined, sql: string) {
  const id = 'prom-builder-run'
  resetTestStore({
    profiles: [{ id, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'prom-main' }, grafana: { baseUrl: 'https://grafana.example', datasourceType: 'prometheus' } }],
    activeProfileId: id,
    connected: true,
    connecting: false,
    connectionStatus: 'connected'
  })
  patchActiveTestSession({
    connectionProfileId: id,
    queryMode: 'builder',
    sql,
    promqlBuilder: {
      metric,
      filterBy: [],
      groupBy: [],
      labelValues: {},
      calculation: 'percentile',
      aggregation: 'sum',
      window: '5m',
      percentile: 0.95,
      histogramKindOverride: 'auto'
    }
  })
  setActiveTestMetadata([{ name: 'Prometheus', isSystem: false, relations: [{
    schema: 'Prometheus',
    name: metric,
    qualifiedName: metric,
    kind: 'metric' as const,
    columnsStatus: 'idle' as const,
    ...(metadataType ? { details: { kind: 'metric' as const, type: metadataType } } : {})
  }] }], 'loaded', null, id)
  return render(<QueryEditor builderMode />)
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  labelsForMetric.mockReset().mockResolvedValue([])
  labelValues.mockReset().mockResolvedValue([])
  formatQuery.mockReset()
  runQuery.mockReset().mockResolvedValue({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
  copyTextToClipboard.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); resetTestStore() })

describe('PromQL Builder Run availability', () => {
  it('enables Run for a classic _bucket metric even when metadata calls it a gauge', async () => {
    arrange(
      'http_server_request_duration_seconds_bucket',
      'gauge',
      'histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))'
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    const pane = JSON.parse(new URL(copyTextToClipboard.mock.calls.at(-1)![0]).searchParams.get('panes')!)
    expect(pane.datakoala.queries[0].expr).toContain('histogram_quantile')
    expect(pane.datakoala.queries[0].expr).not.toBe('histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))')
  })

  it('runs and keyboard-runs the generated query while preserving stale raw PromQL', async () => {
    const view = arrange('up', 'gauge', 'stale_manual_promql')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(1))
    expect(runQuery.mock.calls[0][1]).toBe('up')
    expect(activeTestSession().sql).toBe('stale_manual_promql')

    fireEvent.keyDown(view.container.querySelector('[data-query-editor]')!, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(runQuery).toHaveBeenCalledTimes(2))
    expect(runQuery.mock.calls[1][1]).toBe('up')
    expect(activeTestSession().sql).toBe('stale_manual_promql')
  })

  it('uses formatted Builder PromQL for Copy and Grafana without replacing raw PromQL', async () => {
    const formatted = 'sum(\n  up\n)'
    formatQuery.mockResolvedValue(formatted)
    arrange('up', 'gauge', 'stale_manual_promql')

    await waitFor(() => expect(formatQuery).toHaveBeenCalledWith('prom-builder-run', 'up'))
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    fireEvent.click(screen.getByRole('button', { name: 'Copy SQL to clipboard' }))
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(formatted))

    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    const pane = JSON.parse(new URL(copyTextToClipboard.mock.calls.at(-1)![0]).searchParams.get('panes')!)
    expect(pane.datakoala.queries[0].expr).toBe(formatted)
    expect(activeTestSession().sql).toBe('stale_manual_promql')
  })

  it('runs the histogram query reported by the Builder panel, not stale raw PromQL', async () => {
    arrange('http_server_request_duration_seconds_bucket', 'gauge', 'stale_manual_promql')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false))
    const generated = 'histogram_quantile(\n  0.95,\n  sum by (le) (\n    rate(http_server_request_duration_seconds_bucket[5m])\n  )\n)'
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    expect(runQuery.mock.calls[0][1]).toBe(generated)
    expect(activeTestSession().sql).toBe('stale_manual_promql')
  })

  it('enables Run for a metadata-known native histogram', async () => {
    arrange(
      'request_duration_seconds',
      'histogram',
      'histogram_quantile(0.95, sum(rate(request_duration_seconds[5m])))'
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false))
  })

  it('keeps Run disabled for an unresolved ambiguous histogram calculation', async () => {
    arrange('mystery_metric', undefined, '')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(true))
  })
})
