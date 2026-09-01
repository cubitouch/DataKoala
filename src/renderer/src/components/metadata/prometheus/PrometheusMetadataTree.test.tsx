import React from 'react'
void React
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeDatabaseObjects } from '../../../lib/databaseObjects'

const mocks = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../../../lib/api', () => ({ api: { connections: { prometheus: mocks } } }))

import { PrometheusMetadataTree } from './PrometheusMetadataTree'

const schemas = normalizeDatabaseObjects([{
  schema: 'Metrics', name: 'http_requests_total', kind: 'metric',
  details: { kind: 'metric', type: 'counter', help: 'Total requests.', unit: 'requests' }
}])
const expanded = new Set(['schema:Metrics', 'relation:Metrics.http_requests_total'])
const callbacks = { onToggleSchema: vi.fn(), onToggleMetric: vi.fn(), onActivateMetric: vi.fn() }

beforeEach(() => {
  mocks.labelsForMetric.mockReset().mockResolvedValue(['service'])
  mocks.labelValues.mockReset().mockResolvedValue(['old-profile-value'])
})
afterEach(cleanup)

describe('PrometheusMetadataTree lifecycle', () => {
  it('loads labels when it mounts with a metric already expanded', async () => {
    render(<PrometheusMetadataTree connectionId="prom-1" schemas={schemas} expanded={expanded} filter="" {...callbacks} />)

    expect(screen.getByText('Loading labels…')).toBeTruthy()
    await waitFor(() => expect(mocks.labelsForMetric).toHaveBeenCalledWith('prom-1', 'http_requests_total'))
    expect(await screen.findByText('service')).toBeTruthy()
    expect(mocks.labelsForMetric).toHaveBeenCalledTimes(1)
  })

  it('scopes loaded labels and values to the connection', async () => {
    const { rerender } = render(<PrometheusMetadataTree connectionId="prom-1" schemas={schemas} expanded={expanded} filter="" {...callbacks} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Expand service' }))
    expect(await screen.findByText('old-profile-value')).toBeTruthy()

    mocks.labelsForMetric.mockResolvedValueOnce(['instance'])
    rerender(<PrometheusMetadataTree connectionId="prom-2" schemas={schemas} expanded={expanded} filter="" {...callbacks} />)

    expect(screen.queryByText('service')).toBeNull()
    expect(screen.queryByText('old-profile-value')).toBeNull()
    expect(screen.getByText('Loading labels…')).toBeTruthy()
    await waitFor(() => expect(mocks.labelsForMetric).toHaveBeenCalledWith('prom-2', 'http_requests_total'))
    expect(await screen.findByText('instance')).toBeTruthy()
    expect(mocks.labelsForMetric).toHaveBeenCalledTimes(2)
  })
})
