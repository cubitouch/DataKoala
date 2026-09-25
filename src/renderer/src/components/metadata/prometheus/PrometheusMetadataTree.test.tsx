import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeDatabaseObjects } from '@lib/databaseObjects'

const mocks = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../../../lib/api', () => ({ api: { connections: { prometheus: mocks } } }))

import { PrometheusMetadataTree } from './PrometheusMetadataTree'

const schemas = normalizeDatabaseObjects([{
  schema: 'Metrics', name: 'http_requests_total', kind: 'metric',
  details: { kind: 'metric', type: 'counter', help: 'Total requests.', unit: 'requests' }
}])
const expanded = new Set(['relation:Metrics.http_requests_total'])
const callbacks = { onToggleMetric: vi.fn(), onActivateMetric: vi.fn() }

beforeEach(() => {
  callbacks.onToggleMetric.mockReset()
  callbacks.onActivateMetric.mockReset()
  mocks.labelsForMetric.mockReset().mockResolvedValue(['service'])
  mocks.labelValues.mockReset().mockResolvedValue(['old-profile-value'])
})
afterEach(cleanup)

describe('PrometheusMetadataTree lifecycle', () => {
  it('renders collapsed metrics directly at the Prometheus root', () => {
    render(<PrometheusMetadataTree connectionId="prom-1" schemas={schemas} expanded={new Set()} filter="" {...callbacks} />)

    expect(screen.getByRole('tree', { name: 'Prometheus metrics' })).toBeTruthy()
    expect(screen.queryByText('Metrics')).toBeNull()
    expect(screen.getByRole('button', { name: 'Select http_requests_total for Builder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand http_requests_total' })).toBeTruthy()
    expect(screen.queryByText('Labels')).toBeNull()
    expect(mocks.labelsForMetric).not.toHaveBeenCalled()
  })

  it('loads labels only when a collapsed metric is expanded', async () => {
    render(<PrometheusMetadataTree connectionId="prom-1" schemas={schemas} expanded={new Set()} filter="" {...callbacks} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand http_requests_total' }))

    await waitFor(() => expect(mocks.labelsForMetric).toHaveBeenCalledWith('prom-1', 'http_requests_total'))
    expect(callbacks.onToggleMetric).toHaveBeenCalledWith(schemas[0].relations[0])
  })

  it('filters metrics by metric name without matching the synthetic schema', () => {
    const { rerender } = render(<PrometheusMetadataTree connectionId="prom-1" schemas={schemas} expanded={new Set()} filter="http_requests" {...callbacks} />)
    expect(screen.getByRole('button', { name: 'Select http_requests_total for Builder' })).toBeTruthy()

    rerender(<PrometheusMetadataTree connectionId="prom-1" schemas={schemas} expanded={new Set()} filter="Metrics" {...callbacks} />)
    expect(screen.queryByRole('button', { name: 'Select http_requests_total for Builder' })).toBeNull()
  })

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
