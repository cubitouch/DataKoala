import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues } = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { prometheus: { labelsForMetric, labelValues } } } }))
import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'

let sequence = 0
function arrange(metric = 'request_duration_seconds_bucket') {
  const id = `prom-builder-${++sequence}`
  resetTestStore({ profiles: [{ id, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }] })
  patchActiveTestSession({ connectionProfileId: id, queryMode: 'builder', sql: '', promqlBuilder: { metric, filters: [], groupBy: [], calculation: 'percentile', window: '5m', percentile: 0.95 } })
  setActiveTestMetadata([{ name: 'Prometheus', isSystem: false, relations: [{ schema: 'Prometheus', name: metric, qualifiedName: metric, kind: 'metric', columnsStatus: 'idle' }] }], 'loaded', null, id)
  return render(<PromqlBuilderPanel />)
}
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); labelsForMetric.mockResolvedValue(['environment', 'service', 'le', '__name__']); labelValues.mockResolvedValue(['production', 'staging']) })
afterEach(cleanup)

describe('PromQL Builder controls', () => {
  it('loads only metric labels on render and values only when a selected label value picker opens', async () => {
    arrange()
    await waitFor(() => expect(labelsForMetric).toHaveBeenCalledOnce())
    expect(labelValues).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('combobox', { name: /Filter by labels/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'environment' }))
    expect(labelValues).not.toHaveBeenCalled()
    const valuePicker = screen.getByRole('combobox', { name: /environment values/ })
    fireEvent.click(valuePicker)
    await waitFor(() => expect(labelValues).toHaveBeenCalledOnce())
    fireEvent.click(valuePicker)
    fireEvent.click(valuePicker)
    expect(labelValues).toHaveBeenCalledOnce()
  })

  it('shows contextual percentile and Rate window controls and keeps Generated PromQL collapsed', async () => {
    arrange()
    expect((screen.getByLabelText('Percentile') as HTMLSelectElement).value).toBe('0.95')
    expect(screen.getByLabelText('Rate window')).toBeTruthy()
    const help = screen.getByRole('button', { name: 'Rate window help' })
    expect(help.getAttribute('aria-describedby')).toBeTruthy()
    const tooltip = screen.getByText(/How much history each calculation/)
    expect(tooltip.hasAttribute('hidden')).toBe(true)
    fireEvent.focus(help)
    expect(tooltip.hasAttribute('hidden')).toBe(false)
    expect(screen.getByText('Generated PromQL').closest('details')?.open).toBe(false)
    expect(screen.queryByText('Format')).toBeNull()
  })

  it('opens the canonical generated query in PromQL mode without running', () => {
    arrange()
    fireEvent.click(screen.getByRole('button', { name: 'Open in PromQL' }))
    expect(activeTestSession().queryMode).toBe('sql')
    expect(activeTestSession().sql).toContain('histogram_quantile')
    expect(activeTestSession().running).toBe(false)
  })
})
