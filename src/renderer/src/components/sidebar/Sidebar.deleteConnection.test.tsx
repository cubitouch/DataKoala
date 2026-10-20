// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const { profile, remove, list } = vi.hoisted(() => ({
  profile: {
    kind: 'postgres' as const,
    version: 2 as const,
    id: 'pg',
    name: 'Production Database',
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'reader',
    password: '',
    tlsMode: 'disable' as const,
    readonly: true as const,
  },
  remove: vi.fn(),
  list: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    ai: {
      settings: {
        get: vi.fn(async () => ({
          ok: true,
          value: { model: '', hasApiKey: false },
        })),
      },
      listModels: vi.fn(async () => ({ ok: true, value: [] })),
      cancel: vi.fn(),
    },
    connections: {
      list,
      listObjects: vi.fn(async () => []),
      describeTable: vi.fn(async () => []),
      connect: vi.fn(),
      disconnect: vi.fn(),
      remove,
    },
  },
}))

import { Sidebar } from './Sidebar'
import { patchActiveTestSession, resetTestStore } from '@test/sessionTestUtils'

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue([profile])
  remove.mockReset()
  remove.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  resetTestStore()
})

it('requires explicit confirmation and names the connection', async () => {
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  expect(remove).not.toHaveBeenCalled()
  const dialog = screen.getByRole('dialog', { name: 'Delete connection?' })
  expect(dialog.textContent).toContain('Production Database')
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Cancel' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(remove).not.toHaveBeenCalled()
})

it('cancels with Escape and only removes after destructive confirmation', async () => {
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Delete connection' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('pg'))
})

it.each(['Escape', 'Cancel'])(
  'restores the exact origin after %s and preserves multiple profiles',
  async (dismiss) => {
    list.mockResolvedValue([
      profile,
      { ...profile, id: 'other', name: 'Other Database' },
    ])
    render(<Sidebar />)
    const origin = await screen.findByRole('button', {
      name: 'Delete connection Production Database',
    })
    origin.focus()
    fireEvent.click(origin)
    if (dismiss === 'Escape') fireEvent.keyDown(window, { key: 'Escape' })
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(document.activeElement).toBe(origin))
    expect(remove).not.toHaveBeenCalled()
    expect(origin.isConnected).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Delete connection Other Database' }),
    ).toBeTruthy()
  },
)

it('does not restore a stale origin over a newly opened dialog', async () => {
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  await waitFor(() => expect(document.activeElement).not.toBe(document.body))
  expect(document.activeElement).not.toBe(origin)
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  expect(remove).not.toHaveBeenCalled()
})

it('focuses a surviving control after exactly one confirmed removal', async () => {
  const { useStore } = await import('@store/useStore')
  remove.mockImplementation(async () => {
    list.mockResolvedValue([])
  })
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Delete connection' }))
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('pg'))
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '+ new connection' }),
    ),
  )
  expect(origin.isConnected).toBe(false)
  expect(
    useStore.getState().tabs.every((tab) => tab.connectionProfileId !== 'pg'),
  ).toBe(true)
})

it('does not restore focus to a removed profile during the pending animation frame', async () => {
  const { useStore } = await import('@store/useStore')
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => useStore.getState().setProfiles([]))
  await new Promise((resolve) => requestAnimationFrame(resolve))
  expect(origin.isConnected).toBe(false)
  expect(document.activeElement).not.toBe(origin)
  expect(remove).not.toHaveBeenCalled()
})

it('cancels a queued focus return when the active profile changes on the same tab', async () => {
  list.mockResolvedValue([
    profile,
    { ...profile, id: 'other', name: 'Other Database' },
  ])
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => patchActiveTestSession({ connectionProfileId: 'other' }))
  await new Promise((resolve) => requestAnimationFrame(resolve))
  expect(origin.isConnected).toBe(true)
  expect(document.activeElement).not.toBe(origin)
  expect(remove).not.toHaveBeenCalled()
})

it('still restores the same live control when the sidebar profiles rerender', async () => {
  const { useStore } = await import('@store/useStore')
  render(<Sidebar />)
  const origin = await screen.findByRole('button', {
    name: 'Delete connection Production Database',
  })
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  act(() => useStore.getState().setProfiles([{ ...profile }]))
  await waitFor(() => expect(document.activeElement).toBe(origin))
  expect(remove).not.toHaveBeenCalled()
})

it('keeps the captured deletion recoverable on failure, then removes exactly once on retry', async () => {
  remove.mockRejectedValueOnce(new Error('Synthetic removal denied'))
  render(<Sidebar />)
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Delete connection Production Database',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete connection' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('Synthetic removal denied'),
  )
  expect(screen.getByRole('dialog').textContent).toContain(
    'Production Database',
  )
  expect(
    screen.getByRole('button', {
      name: 'Delete connection Production Database',
    }),
  ).toBeTruthy()
  list.mockResolvedValue([])
  fireEvent.click(screen.getByRole('button', { name: 'Delete connection' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(remove.mock.calls).toEqual([['pg'], ['pg']])
})

it.each(['success', 'failure'] as const)(
  'does not deliver an obsolete deletion %s into a replacement target',
  async (outcome) => {
    list.mockResolvedValue([
      profile,
      { ...profile, id: 'other', name: 'Other Database' },
    ])
    let finish!: () => void
    let fail!: (error: Error) => void
    remove.mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = resolve
          fail = reject
        }),
    )
    render(<Sidebar />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete connection Production Database',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete connection' }),
    )
    await waitFor(() => expect(remove).toHaveBeenCalledWith('pg'))
    // Model an external target replacement while storage delivery is pending.
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete connection Other Database' }),
    )
    await act(async () => {
      if (outcome === 'success') finish()
      else fail(new Error('Obsolete removal error'))
    })
    expect(screen.getByRole('dialog').textContent).toContain('Other Database')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(remove).toHaveBeenCalledTimes(1)
  },
)
