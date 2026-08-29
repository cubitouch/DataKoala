import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues } = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { prometheus: { labelsForMetric, labelValues } } } }))
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, ...props }: { value: string; 'aria-label'?: string }) => <textarea aria-label={props['aria-label']} value={value} readOnly />
}))

import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'

const profileId = 'prom-same-metric'

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  labelsForMetric.mockReset().mockResolvedValue(['environment', 'service', '__name__'])
  labelValues.mockReset().mockResolvedValue(['api'])

  resetTestStore({
    profiles: [{ id: profileId, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }],
    activeProfileId: profileId,
    connected: true,
    connecting: false,
    connectionStatus: 'connected',
    connectionGeneration: 1
  })
  patchActiveTestSession({
    connectionProfileId: profileId,
    queryMode: 'builder',
    sql: 'sum(rate(requests_total[5m]))',
    promqlBuilder: {
      metric: 'requests_total',
      filterBy: [],
      groupBy: [],
      labelValues: {},
      calculation: 'rate',
      aggregation: 'sum',
      window: '5m',
      percentile: 0.95,
      histogramKindOverride: 'auto'
    }
  })
  setActiveTestMetadata([{ name: 'Prometheus', isSystem: false, relations: [{
    schema: 'Prometheus',
    name: 'requests_total',
    qualifiedName: 'requests_total',
    kind: 'metric',
    columnsStatus: 'idle',
    details: { kind: 'metric', type: 'counter' }
  }] }], 'loaded', null, profileId)
})

afterEach(() => { cleanup(); resetTestStore() })

it('keeps loaded labels when the selected metric is selected again', async () => {
  render(<PromqlBuilderPanel />)

  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledOnce())
  let groupPicker = await screen.findByRole('combobox', { name: 'Group by: No grouping' })
  fireEvent.click(groupPicker)
  expect(await screen.findByRole('option', { name: 'environment' })).toBeTruthy()
  fireEvent.keyDown(screen.getByLabelText('Search Group by'), { key: 'Escape' })

  const metricPicker = screen.getByRole('combobox', { name: /Metric: requests_total/ })
  fireEvent.click(metricPicker)
  fireEvent.click(await screen.findByRole('option', { name: 'requests_total, counter' }))

  expect(labelsForMetric).toHaveBeenCalledOnce()
  groupPicker = screen.getByRole('combobox', { name: 'Group by: No grouping' })
  fireEvent.click(groupPicker)
  expect(await screen.findByRole('option', { name: 'environment' })).toBeTruthy()
  expect(screen.getByRole('option', { name: 'service' })).toBeTruthy()
})
