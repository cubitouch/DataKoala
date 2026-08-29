import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues, promqlAsExtension } = vi.hoisted(() => ({
  labelsForMetric: vi.fn(),
  labelValues: vi.fn(),
  promqlAsExtension: vi.fn(() => ({}))
}))

vi.mock('../lib/api', () => ({
  api: {
    connections: { prometheus: { formatQuery: vi.fn(), labelsForMetric, labelValues } },
    query: { explain: vi.fn(), run: vi.fn() },
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
import { patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'

function arrange(metric: string, metadataType: string | undefined, sql: string) {
  const id = 'prom-builder-run'
  resetTestStore({
    profiles: [{ id, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx', datasourceUid: 'prom-main' } }],
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
  render(<QueryEditor builderMode />)
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  labelsForMetric.mockReset().mockResolvedValue([])
  labelValues.mockReset().mockResolvedValue([])
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
