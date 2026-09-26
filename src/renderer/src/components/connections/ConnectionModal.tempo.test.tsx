import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ discover: vi.fn(), test: vi.fn(), upsert: vi.fn() }))
vi.mock('@lib/api', () => ({ api: { connections: { tempo: { discoverDatasources: mocks.discover }, test: mocks.test, upsert: mocks.upsert } } }))
import { TempoConnectionModal } from './TempoConnectionModal'

const props = { existing: null, onClose: vi.fn(), onSaved: vi.fn() }
beforeEach(() => { mocks.discover.mockReset(); mocks.test.mockReset().mockResolvedValue({ ok: true }); mocks.upsert.mockReset().mockImplementation(async (profile) => profile) })
afterEach(cleanup)

describe('Tempo datasource discovery', () => {
  it('reconciles the datasource when the gcx context is committed', async () => {
    mocks.discover
      .mockResolvedValueOnce([{ uid: 'tempo-a', name: 'Tempo A', type: 'tempo' }])
      .mockResolvedValueOnce([{ uid: 'tempo-b', name: 'Tempo B', type: 'tempo' }])
    render(<TempoConnectionModal {...props} />)
    expect(await screen.findByRole('combobox', { name: /Tempo datasource: Tempo A/ })).toBeTruthy()
    const context = screen.getByLabelText('gcx context')
    fireEvent.change(context, { target: { value: 'context-b' } })
    expect(mocks.discover).toHaveBeenCalledTimes(1)
    fireEvent.blur(context)
    await waitFor(() => expect(mocks.discover).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: /Tempo datasource: Tempo B/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ transport: expect.objectContaining({ context: 'context-b', datasourceUid: 'tempo-b' }) })))
  })
})