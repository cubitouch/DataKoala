import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GrafanaHandoffActions } from './GrafanaHandoffActions'
import type { PrometheusProfile } from '@shared/types'

const mocks = vi.hoisted(() => ({ copy: vi.fn(), open: vi.fn() }))
vi.mock('../lib/clipboardText', () => ({ copyTextToClipboard: mocks.copy }))
vi.mock('../lib/api', () => ({ api: { external: { openUrl: mocks.open } } }))
const profile: PrometheusProfile = { kind: 'prometheus', version: 1, id: 'p', name: 'Metrics', readonly: true, transport: { kind: 'gcx', datasourceUid: 'prom' }, grafana: { baseUrl: 'https://example.com/grafana', orgId: 2, datasourceType: 'prometheus' } }

describe('GrafanaHandoffActions', () => {
  beforeEach(() => { cleanup(); mocks.copy.mockReset(); mocks.open.mockReset() })
  it('copies and opens exactly the same effective-query URL', async () => {
    render(<GrafanaHandoffActions profile={profile} query={'rate(x{label=~"a|b"}[5m])'} range={{ kind: 'rolling', amount: 30, unit: 'minute' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Grafana link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grafana handoff' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Open in Grafana/ }))
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce())
    expect(mocks.open).toHaveBeenCalledWith(mocks.copy.mock.calls[0][0])
    const pane = JSON.parse(new URL(mocks.copy.mock.calls[0][0]).searchParams.get('panes')!)
    expect(pane.datakoala.queries[0].expr).toBe('rate(x{label=~"a|b"}[5m])')
  })
  it('disables both actions when configuration is missing', () => {
    render(<GrafanaHandoffActions profile={{ ...profile, grafana: undefined }} query="up" range={{ kind: 'all' }} />)
    const trigger = screen.getByRole('button', { name: 'Grafana handoff' })
    expect(trigger.hasAttribute('disabled')).toBe(true)
    expect(trigger.getAttribute('title')).toMatch(/Configure the Grafana URL/)
  })
})
