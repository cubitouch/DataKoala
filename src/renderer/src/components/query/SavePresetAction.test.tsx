// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'
import { createQuerySession, useStore } from '@store/useStore'
import { ExplorationPresetRepository, type PresetStorage, type SavedExplorationPreset } from '@lib/explorationPresets'
import { resetTestStore } from '@test/sessionTestUtils'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify }))

import { SavePresetAction } from './SavePresetAction'

const sqlProfile: DataSourceProfile = { id: 'sql-b', name: 'Warehouse B', kind: 'postgres', version: 1, readonly: false, host: 'localhost', port: 5432, database: 'app', user: 'user', password: '', ssl: false }

class MemoryStorage implements PresetStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }))
  return screen.getByRole('dialog', { name: 'Save preset' })
}

describe('SavePresetAction', () => {
  beforeEach(() => { notify.mockReset(); resetTestStore() })
  afterEach(() => { cleanup(); resetTestStore() })

  it('is enabled only for a session with a valid attached profile and opens the naming dialog', () => {
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id })
    resetTestStore({ profiles: [sqlProfile], tabs: [session], activeTabId: session.id })
    render(<SavePresetAction repository={{ create: vi.fn() }} />)
    expect((screen.getByRole('button', { name: 'Save preset' }) as HTMLButtonElement).disabled).toBe(false)
    expect(openDialog()).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Preset name' }))
  })

  it('rejects blank names, trims names, creates once, and reports success', () => {
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, sql: 'select * from checkout_errors' })
    resetTestStore({ profiles: [sqlProfile], tabs: [session], activeTabId: session.id })
    const create = vi.fn((preset: SavedExplorationPreset) => preset)
    render(<SavePresetAction repository={{ create }} />)
    openDialog()
    const input = screen.getByRole('textbox', { name: 'Preset name' })
    fireEvent.change(input, { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '  Checkout errors  ' } })
    fireEvent.submit(input.closest('form')!)
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0]).toMatchObject({ name: 'Checkout errors', connectionProfileId: sqlProfile.id, payload: { sql: 'select * from checkout_errors' } })
    expect(notify).toHaveBeenCalledWith({ message: 'Saved preset “Checkout errors”.' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancels without saving', () => {
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id })
    const create = vi.fn()
    render(<SavePresetAction repository={{ create }} session={session} profile={sqlProfile} />)
    openDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps the dialog, entered name, and richly populated session unchanged when persistence fails', () => {
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, queryMode: 'builder', sql: 'select count(*) from orders' })
    Object.assign(session, {
      running: true, queryError: 'old error', result: { columns: [], rows: [{ count: 2 }], rowCount: 1, durationMs: 7 },
      pendingResult: { columns: [], rows: [], rowCount: 0, durationMs: 1 }, resultRevision: 9, lastSuccessfulResultRevision: 8,
      isResultStale: false, builder: { table: { schema: 'public', name: 'orders' }, timeColumn: 'created_at', timeBucket: 'hour', seriesColumns: ['status'] },
      sqlResultFilters: [{ id: 'f', column: 'status', operator: 'equals', value: 'failed', execution: 'client' }], seriesVisibility: { failed: false }
    })
    const before = structuredClone(session)
    render(<SavePresetAction repository={{ create: () => { throw new Error('quota exceeded') } }} session={session} profile={sqlProfile} />)
    openDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retry me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(notify).toHaveBeenCalledWith({ message: 'Could not save preset: quota exceeded', tone: 'error' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Retry me')
    expect(session).toEqual(before)
  })

  it('captures the active tab and its attached profile rather than stale global connection state', () => {
    const profileA = { ...sqlProfile, id: 'sql-a', name: 'Warehouse A' }
    const tabA = createQuerySession(1, { id: 'tab-a', connectionProfileId: profileA.id, sql: 'select A' })
    const tabB = createQuerySession(2, { id: 'tab-b', connectionProfileId: sqlProfile.id, sql: 'select B' })
    const create = vi.fn((preset: SavedExplorationPreset) => preset)
    resetTestStore({ profiles: [profileA, sqlProfile], tabs: [tabA, tabB], activeTabId: tabB.id, activeProfileId: profileA.id })
    render(<SavePresetAction repository={{ create }} />)
    openDialog(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'B preset' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(create.mock.calls[0][0]).toMatchObject({ connectionProfileId: 'sql-b', payload: { sql: 'select B' } })
    expect(create.mock.calls[0][0].payload).not.toMatchObject({ sql: 'select A' })
  })

  it('persists through localStorage in the repository format', () => {
    const storage = new MemoryStorage()
    const repository = new ExplorationPresetRepository(storage)
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, sql: 'select 42' })
    render(<SavePresetAction repository={repository} session={session} profile={sqlProfile} />)
    openDialog(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Smoke' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(new ExplorationPresetRepository(storage).loadAll()).toEqual([expect.objectContaining({ name: 'Smoke', connectionProfileId: sqlProfile.id, payload: expect.objectContaining({ sql: 'select 42' }) })])
  })

  it('does not run a query or invoke result lifecycle actions while saving', () => {
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, sql: 'select safely' })
    const startQuery = vi.fn(), completeQuery = vi.fn(), setResult = vi.fn()
    resetTestStore({ profiles: [sqlProfile], tabs: [session], activeTabId: session.id, startQuery, completeQuery, setResult })
    const before = structuredClone(useStore.getState().tabs)
    render(<SavePresetAction repository={{ create: vi.fn() }} />)
    openDialog(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Safe' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(startQuery).not.toHaveBeenCalled()
    expect(completeQuery).not.toHaveBeenCalled()
    expect(setResult).not.toHaveBeenCalled()
    expect(useStore.getState().tabs).toEqual(before)
  })
})
