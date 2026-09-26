import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GrafanaHandoffActions } from './GrafanaHandoffActions'
import type { PrometheusProfile } from '@shared/types'

const mocks = vi.hoisted(() => ({ copy: vi.fn(), notify: vi.fn(), open: vi.fn(), resolve: vi.fn() }))
vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard: mocks.copy }))
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify: mocks.notify }))
vi.mock('@lib/api', () => ({ api: { external: { openUrl: mocks.open }, connections: { grafana: { resolveHandoff: mocks.resolve } } } }))
const profile: PrometheusProfile = { kind: 'prometheus', version: 1, id: 'p', name: 'Metrics', readonly: true, transport: { kind: 'gcx', datasourceUid: 'prom' }, grafana: { baseUrl: 'https://example.com/grafana', orgId: 2, datasourceType: 'prometheus' } }

describe('GrafanaHandoffActions', () => {
  beforeEach(() => { cleanup(); mocks.copy.mockReset(); mocks.notify.mockReset(); mocks.open.mockReset(); mocks.resolve.mockReset() })

  it('copies and opens exactly the same configured effective-query URL', async () => {
    mocks.copy.mockResolvedValue(undefined)
    render(<GrafanaHandoffActions profile={profile} query={'rate(x{label=~"a|b"}[5m])'} range={{ kind: 'rolling', amount: 30, unit: 'minute' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open in Grafana/ }))
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith({ message: 'Grafana link copied' }))
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.open).toHaveBeenCalledWith(mocks.copy.mock.calls[0][0])
    const pane = JSON.parse(new URL(mocks.copy.mock.calls[0][0]).searchParams.get('panes')!)
    expect(pane.datakoala.queries[0].expr).toBe('rate(x{label=~"a|b"}[5m])')
  })

  it('shows an error notification when copying the Grafana link fails', async () => {
    mocks.copy.mockRejectedValue(new Error('denied'))
    render(<GrafanaHandoffActions profile={profile} query="up" range={{ kind: 'all' }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))

    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith({ message: 'Could not copy Grafana link: denied', tone: 'error' }))
    expect(mocks.notify).not.toHaveBeenCalledWith({ message: 'Grafana link copied' })
  })

  it('auto-resolves an existing gcx-backed connection without requiring a saved Grafana URL', async () => {
    mocks.resolve.mockResolvedValue({ baseUrl: 'https://auto.grafana.example', orgId: 4, datasourceUid: 'prom', datasourceType: 'prometheus' })
    render(<GrafanaHandoffActions profile={{ ...profile, grafana: undefined, transport: { kind: 'gcx', context: 'prod', datasourceUid: 'prom' } }} query="up" range={{ kind: 'all' }} />)
    const trigger = screen.getByRole('button', { name: 'Grafana handoff' })
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false))
    expect(mocks.resolve).toHaveBeenCalledWith({ signal: 'prometheus', context: 'prod', datasourceUid: 'prom' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    const copied = new URL(mocks.copy.mock.calls[0][0])
    expect(copied.origin).toBe('https://auto.grafana.example')
    expect(copied.searchParams.get('orgId')).toBe('4')
  })

  it('keeps the handoff disabled with the gcx resolution error as its hint', async () => {
    mocks.resolve.mockRejectedValue(new Error('Multiple Grafana prometheus datasources are available. Select one in the DataKoala connection.'))
    render(<GrafanaHandoffActions profile={{ ...profile, grafana: undefined, transport: { kind: 'gcx' } }} query="up" range={{ kind: 'all' }} />)
    const trigger = screen.getByRole('button', { name: 'Grafana handoff' })
    await waitFor(() => expect(trigger.getAttribute('title')).toMatch(/Multiple Grafana prometheus datasources/))
    expect(trigger.hasAttribute('disabled')).toBe(true)
  })
})
