import React from 'react'
void React
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LokiProfile } from '@shared/types'

const mocks = vi.hoisted(() => ({ discover: vi.fn(), test: vi.fn(), upsert: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { loki: { discover: mocks.discover }, test: mocks.test, upsert: mocks.upsert } } }))
import { LokiConnectionModal } from './ConnectionModal'

const alpha = { uid: 'loki-alpha', name: 'Production logs', type: 'loki' }
const beta = { uid: 'loki-beta', name: 'Audit logs', type: 'loki' }
const existing: LokiProfile = { kind: 'loki', version: 1, id: 'saved-loki', name: 'Saved logs', readonly: true, transport: { kind: 'gcx', context: 'production', datasourceUid: beta.uid } }
const props = { onClose: vi.fn(), onSaved: vi.fn() }

beforeEach(() => {
  mocks.discover.mockReset().mockResolvedValue([alpha])
  mocks.test.mockReset().mockResolvedValue({ ok: true })
  mocks.upsert.mockReset().mockImplementation(async (profile) => profile)
  props.onClose.mockReset(); props.onSaved.mockReset()
})
afterEach(cleanup)

const renderModal = (profile: LokiProfile | null = null) => render(<LokiConnectionModal {...props} existing={profile} />)

describe('Loki authenticated datasource discovery', () => {
  it('automatically selects one discovered datasource and names it when tested', async () => {
    renderModal()
    expect(await screen.findByText(/One Loki datasource found.*selected automatically/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Loki datasource: Production logs/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test datasource' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Test datasource' }))
    expect(await screen.findByText(/Production logs is available/)).toBeTruthy()
  })

  it('explains multiple results, requires selection, and enables actions after choosing by name', async () => {
    mocks.discover.mockResolvedValue([alpha, beta])
    renderModal()
    expect(await screen.findByText(/2 Loki datasources found.*Choose the one/)).toBeTruthy()
    expect(screen.getByText(/Selection required/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('combobox', { name: /Loki datasource: Choose/ }))
    fireEvent.click(await screen.findByRole('option', { name: /Audit logs/ }))
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: 'Test datasource' }).hasAttribute('disabled')).toBe(false)
  })

  it('reveals the advanced manual fallback for no results and accepts deliberate entry', async () => {
    mocks.discover.mockResolvedValue([])
    renderModal()
    expect(await screen.findByText(/No Loki datasource found/)).toBeTruthy()
    const disclosure = screen.getByText(/Advanced — enter a datasource UID manually/).closest('details')!
    expect(disclosure.hasAttribute('open')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('Datasource UID'), { target: { value: 'manual-loki' } })
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ transport: expect.objectContaining({ datasourceUid: 'manual-loki' }) })))
  })

  it('shows actionable gcx authentication guidance when discovery fails', async () => {
    mocks.discover.mockRejectedValue(new Error('gcx authentication expired for context production'))
    renderModal()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Datasource discovery failed')
    expect(alert.textContent).toContain('gcx login')
    expect(alert.textContent).toContain('re-authenticate')
    const disclosure = screen.getByText(/Advanced — enter a datasource UID manually/).closest('details')!
    expect(disclosure.hasAttribute('open')).toBe(true)
    mocks.discover.mockResolvedValue([alpha])
    fireEvent.click(screen.getByRole('button', { name: 'Discover again' }))
    await waitFor(() => expect(disclosure.hasAttribute('open')).toBe(false))
  })

  it('preserves an existing saved datasource when it remains discoverable', async () => {
    mocks.discover.mockResolvedValue([alpha, beta])
    renderModal(existing)
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Loki datasource: Audit logs/ })).toBeTruthy())
    expect(screen.queryByText(/Selection required/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })

  it('keeps a missing saved datasource instead of silently selecting one alternative', async () => {
    mocks.discover.mockResolvedValue([alpha])
    renderModal(existing)
    expect(await screen.findByText(/saved Loki datasource was not found/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Loki datasource: No datasource selected/ })).toBeTruthy()
    expect((screen.getByLabelText('Datasource UID') as HTMLInputElement).value).toBe(beta.uid)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })

  it('keeps a missing saved datasource when several alternatives are discovered', async () => {
    mocks.discover.mockResolvedValue([alpha, { uid: 'loki-third', name: 'Platform logs', type: 'loki' }])
    renderModal(existing)
    expect(await screen.findByText(/saved Loki datasource was not found/)).toBeTruthy()
    expect((screen.getByLabelText('Datasource UID') as HTMLInputElement).value).toBe(beta.uid)
    expect(screen.queryByText(/Selection required/)).toBeNull()
  })

  it('preserves the saved datasource fallback when discovery fails while editing', async () => {
    mocks.discover.mockRejectedValue(new Error('authentication expired'))
    renderModal(existing)
    await screen.findByText(/Datasource discovery failed/)
    expect((screen.getByLabelText('Datasource UID') as HTMLInputElement).value).toBe(beta.uid)
    expect(screen.getByText(/saved Loki datasource was not found/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })

  it.each([
    ['multiple datasources', [alpha, beta], false, false],
    ['one datasource', [alpha], true, false],
    ['no datasources', [], false, true]
  ] as const)('clears context A manual state when context B returns %s', async (_label, contextBResults, saveEnabled, manualOpen) => {
    mocks.discover.mockResolvedValueOnce([]).mockResolvedValueOnce([...contextBResults])
    renderModal()
    await screen.findByText(/No Loki datasource found/)
    fireEvent.change(screen.getByLabelText('Datasource UID'), { target: { value: 'context-a-manual' } })
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
    const context = screen.getByLabelText(/gcx context/)
    fireEvent.change(context, { target: { value: 'context-b' } })
    fireEvent.blur(context)
    await waitFor(() => expect(mocks.discover).toHaveBeenCalledTimes(2))
    await waitFor(() => expect((screen.getByLabelText('Datasource UID') as HTMLInputElement).value).toBe(''))
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(!saveEnabled)
    expect(screen.getByText(/Advanced — enter a datasource UID manually/).closest('details')?.hasAttribute('open')).toBe(manualOpen)
    if (contextBResults.length > 1) expect(screen.getByText(/Selection required/)).toBeTruthy()
    if (contextBResults.length === 0) {
      fireEvent.change(screen.getByLabelText('Datasource UID'), { target: { value: 'context-b-manual' } })
      expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
    }
  })

  it('does not discover on context keystrokes and ignores stale context results', async () => {
    let resolveFirst!: (value: typeof alpha[]) => void
    mocks.discover.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve })).mockResolvedValueOnce([beta])
    renderModal()
    const context = screen.getByLabelText(/gcx context/)
    fireEvent.change(context, { target: { value: 'prod' } })
    fireEvent.change(context, { target: { value: 'production' } })
    expect(mocks.discover).toHaveBeenCalledTimes(1)
    fireEvent.blur(context)
    await waitFor(() => expect(mocks.discover).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: /Loki datasource: Audit logs/ })).toBeTruthy()
    resolveFirst([alpha])
    await Promise.resolve()
    expect(screen.getByRole('combobox', { name: /Loki datasource: Audit logs/ })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Loki datasource: Production logs/ })).toBeNull()
  })
})
