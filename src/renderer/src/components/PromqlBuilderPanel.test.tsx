import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { labelsForMetric, labelValues } = vi.hoisted(() => ({ labelsForMetric: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { prometheus: { labelsForMetric, labelValues } } } }))
import { PromqlBuilderPanel } from './PromqlBuilderPanel'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

let sequence = 0
function arrange(metric = 'request_duration_seconds_bucket') {
  const id = `prom-builder-${++sequence}`
  resetTestStore({ profiles: [{ id, name: 'Metrics', kind: 'prometheus', version: 1, readonly: true, transport: { kind: 'gcx' } }] })
  patchActiveTestSession({ connectionProfileId: id, queryMode: 'builder', sql: '', promqlBuilder: { metric, filters: [], groupBy: [], calculation: 'percentile', aggregation: 'sum', window: '5m', percentile: 0.95 } })
  setActiveTestMetadata([{ name: 'Prometheus', isSystem: false, relations: [{ schema: 'Prometheus', name: metric, qualifiedName: metric, kind: 'metric', columnsStatus: 'idle' }] }], 'loaded', null, id)
  return render(<PromqlBuilderPanel />)
}
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); labelsForMetric.mockResolvedValue(['environment', 'service', 'le', '__name__']); labelValues.mockResolvedValue(['production', 'staging']) })
afterEach(cleanup)

describe('PromQL Builder controls', () => {
  it('shows label loading and loads only the values for a newly selected label', async () => {
    const labelsRequest = deferred<string[]>(); const valuesRequest = deferred<string[]>()
    labelsForMetric.mockReturnValueOnce(labelsRequest.promise); labelValues.mockReturnValueOnce(valuesRequest.promise)
    arrange()
    await waitFor(() => expect(labelsForMetric).toHaveBeenCalledOnce())
    expect(screen.getByRole('combobox', { name: /Filter by labels: Loading labels/ })).toBeTruthy()
    expect(labelValues).not.toHaveBeenCalled()
    labelsRequest.resolve(['environment', 'service', 'le', '__name__'])
    const labelPicker = await screen.findByRole('combobox', { name: 'Filter by labels: No label filters' })
    fireEvent.click(labelPicker)
    fireEvent.click(await screen.findByRole('option', { name: 'environment' }))
    await waitFor(() => expect(labelValues).toHaveBeenCalledOnce())
    expect(screen.getByRole('combobox', { name: /environment values: Loading values/ })).toBeTruthy()
    valuesRequest.resolve(['production', 'staging'])
    const valuePicker = await screen.findByRole('combobox', { name: /environment values: Select values/ })
    fireEvent.click(valuePicker)
    expect(await screen.findByRole('option', { name: 'production' })).toBeTruthy()
    fireEvent.click(valuePicker)
    fireEvent.click(valuePicker)
    expect(labelValues).toHaveBeenCalledOnce()
  })

  it('shows contextual percentile and Rate window controls and keeps Generated PromQL collapsed', async () => {
    arrange()
    expect(screen.getByRole('combobox', { name: /Percentile: P95/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Rate window: 5m/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Aggregation: Sum/ }).hasAttribute('disabled')).toBe(true)
    const help = screen.getByRole('button', { name: 'Rate window help' })
    expect(help.getAttribute('aria-describedby')).toBeTruthy()
    const tooltip = screen.getByText(/How much history each calculation/)
    expect(tooltip.hasAttribute('hidden')).toBe(true)
    fireEvent.focus(help)
    expect(tooltip.hasAttribute('hidden')).toBe(false)
    expect(screen.getByText('Generated PromQL').closest('details')?.open).toBe(false)
    expect(screen.queryByText('Format')).toBeNull()
    const layoutRow = screen.getByText('Filter by labels').closest('[data-promql-row="filters-and-grouping"]')
    expect(layoutRow?.textContent).toContain('Group by')
    expect(screen.getByRole('button', { name: 'Open in PromQL' }).classList.contains('open-promql-action')).toBe(true)
  })

  it('opens the canonical generated query in PromQL mode without running', () => {
    arrange()
    const details = screen.getByText('Generated PromQL').closest('details')!
    fireEvent.click(screen.getByRole('button', { name: 'Open in PromQL' }))
    expect(details.open).toBe(false)
    expect(activeTestSession().queryMode).toBe('sql')
    expect(activeTestSession().sql).toContain('histogram_quantile')
    expect(activeTestSession().running).toBe(false)
  })

  it('uses the shared single-select for Rate window and updates PromQL without executing', async () => {
    arrange()
    fireEvent.click(screen.getByRole('combobox', { name: 'Rate window: 5m' }))
    fireEvent.click(await screen.findByRole('option', { name: '10m' }))
    expect(activeTestSession().promqlBuilder.window).toBe('10m')
    expect(activeTestSession().sql).toContain('[10m]')
    expect(activeTestSession().running).toBe(false)
  })
})
