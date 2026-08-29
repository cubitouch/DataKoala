import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues, formatQuery } = vi.hoisted(() => ({
  labelsForMetric: vi.fn(),
  labelValues: vi.fn(),
  formatQuery: vi.fn()
}))
vi.mock('../lib/api', () => ({
  api: { connections: { prometheus: { labelsForMetric, labelValues, formatQuery } } }
}))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))

import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'

const profileId = 'prom-formatting'

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  labelsForMetric.mockReset().mockResolvedValue(['service', 'le', '__name__'])
  labelValues.mockReset().mockResolvedValue(['api'])
  formatQuery.mockReset()

  resetTestStore({
    activeProfileId: profileId, connected: true, connectionStatus: 'connected',
    profiles: [{ id: profileId, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }]
  })
  patchActiveTestSession({
    connectionProfileId: profileId,
    queryMode: 'builder',
    sql: '',
    promqlBuilder: {
      metric: 'request_duration_seconds_bucket',
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
    name: 'request_duration_seconds_bucket',
    qualifiedName: 'request_duration_seconds_bucket',
    kind: 'metric',
    columnsStatus: 'idle'
  }] }], 'loaded', null, profileId)
})

afterEach(() => { cleanup(); resetTestStore() })

it('previews and opens the official formatted generated PromQL', async () => {
  const formatted = 'histogram_quantile(\n  0.95,\n  sum by (le) (rate(request_duration_seconds_bucket[5m]))\n)'
  formatQuery.mockResolvedValue(formatted)

  render(<PromqlBuilderPanel />)

  await waitFor(() => expect(formatQuery).toHaveBeenCalledWith(profileId, expect.stringContaining('histogram_quantile')))
  await waitFor(() => expect((screen.getByLabelText('Generated PromQL query') as HTMLTextAreaElement).value).toBe(formatted))

  fireEvent.click(screen.getByRole('button', { name: 'Open in PromQL mode' }))
  expect(activeTestSession().queryMode).toBe('sql')
  expect(activeTestSession().sql).toBe(formatted)
  expect(activeTestSession().running).toBe(false)
})
