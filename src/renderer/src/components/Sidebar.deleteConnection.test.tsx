import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { profile, remove } = vi.hoisted(() => ({
  profile: { kind: 'postgres' as const, version: 1 as const, id: 'pg', name: 'Production Database', host: 'localhost', port: 5432, database: 'app', user: 'reader', password: '', ssl: false, readonly: true as const },
  remove: vi.fn()
}))
vi.mock('../lib/api', () => ({ api: { connections: {
  list: vi.fn(async () => [profile]), listObjects: vi.fn(async () => []), describeTable: vi.fn(async () => []),
  connect: vi.fn(), disconnect: vi.fn(), remove
} } }))

import { Sidebar } from './Sidebar'
import { resetTestStore } from '../test/sessionTestUtils'

beforeEach(() => { remove.mockReset(); remove.mockResolvedValue(undefined) })
afterEach(() => { cleanup(); resetTestStore() })

it('requires explicit confirmation and names the connection', async () => {
  render(<Sidebar />)
  const origin = await screen.findByRole('button', { name: 'Delete connection Production Database' })
  fireEvent.click(origin)
  expect(remove).not.toHaveBeenCalled()
  const dialog = screen.getByRole('dialog', { name: 'Delete connection?' })
  expect(dialog.textContent).toContain('Production Database')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(remove).not.toHaveBeenCalled()
})

it('cancels with Escape and only removes after destructive confirmation', async () => {
  render(<Sidebar />)
  const origin = await screen.findByRole('button', { name: 'Delete connection Production Database' })
  fireEvent.click(origin)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(origin)
  fireEvent.click(screen.getByRole('button', { name: 'Delete connection' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('pg'))
})
