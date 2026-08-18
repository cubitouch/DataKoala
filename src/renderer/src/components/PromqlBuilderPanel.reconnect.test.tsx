import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues } = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { prometheus: { labelsForMetric, labelValues } } } }))

import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

const profileId = 'prom-reconnect'

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  labelsForMetric.mockReset()
    .mockResolvedValueOnce(['service', 'old_label', '__name__'])
    .mockResolvedValueOnce(['service', 'new_label', '__name__'])
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

it('reloads Group by options when a reconnect creates a new connection generation', async () => {
  render(<PromqlBuilderPanel />)

  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledTimes(1))
  let groupPicker = await screen.findByRole('combobox', { name: 'Group by: No grouping' })
  fireEvent.click(groupPicker)
  expect(await screen.findByRole('option', { name: 'old_label' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'new_label' })).toBeNull()
  fireEvent.keyDown(screen.getByLabelText('Search Group by'), { key: 'Escape' })

  useStore.setState({ connectionGeneration: 2 })
  await waitFor(() => expect(labelsForMetric).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Group by: No grouping' }).hasAttribute('disabled')).toBe(false))

  groupPicker = screen.getByRole('combobox', { name: 'Group by: No grouping' })
  fireEvent.click(groupPicker)
  expect(await screen.findByRole('option', { name: 'new_label' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'old_label' })).toBeNull()
})
