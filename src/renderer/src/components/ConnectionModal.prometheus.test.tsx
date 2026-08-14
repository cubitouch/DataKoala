import React from 'react'
void React
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionModal } from './ConnectionModal'

const { discover, upsert } = vi.hoisted(() => ({ discover: vi.fn(), upsert: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { discover: vi.fn(), upsert, prometheus: { discover } } } }))

const renderPrometheus = () => {
  render(<ConnectionModal existing={null} onClose={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.click(screen.getByRole('radio', { name: /Prometheus/ }))
}

describe('Prometheus gcx connection wizard', () => {
  afterEach(cleanup)
  beforeEach(() => { vi.clearAllMocks(); discover.mockResolvedValue({ metricNames: ['up'], metadata: [{ name: 'up', type: 'gauge' }], metadataAvailable: true, gcx: { installed: true, version: '1.2.3' } }); upsert.mockImplementation(async (profile) => ({ ...profile, id: 'p1' })) })

  it('uses gcx without rendering alternative methods or credential inputs and shows detected version', async () => {
    renderPrometheus()
    expect(screen.getByText('Grafana Cloud via gcx')).toBeTruthy()
    expect(screen.queryByText('Direct Prometheus')).toBeNull()
    expect(screen.queryByLabelText(/token|password/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Test & discover metrics' }))
    await screen.findByText(/discovered 1 metrics with metadata/i)
    expect(screen.getByText(/gcx 1.2.3/i)).toBeTruthy()
    expect(discover).toHaveBeenCalledWith({ kind: 'gcx' })
  })

  it('persists only gcx configuration', async () => {
    renderPrometheus()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(upsert).toHaveBeenCalled())
    const profile = upsert.mock.calls[0][0]
    expect(profile.transport).toEqual({ kind: 'gcx' })
    expect(JSON.stringify(profile)).not.toMatch(/token|password|oauth|credential|secret/i)
  })
})
