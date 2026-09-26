// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'
import { createQuerySession, useStore } from '@store/useStore'
import { createPresetFromSession, ExplorationPresetRepository, type PresetStorage } from '@lib/explorationPresets'
import { resetTestStore } from '@test/sessionTestUtils'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify }))

import { PresetManagerAction, type PresetManagerRepository } from './PresetManagerAction'

const sqlProfile: DataSourceProfile = { id: 'sql-b', name: 'Warehouse B', kind: 'postgres', version: 1, readonly: false, host: 'localhost', port: 5432, database: 'app', user: 'user', password: '', ssl: false }

class MemoryStorage implements PresetStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Manage saved presets' }))
  return screen.getByRole('dialog', { name: 'Saved presets' })
}
function seed(repository: ExplorationPresetRepository, name: string, connectionProfileId = sqlProfile.id, timestamp = 1) {
  const profile = { ...sqlProfile, id: connectionProfileId }
  const session = createQuerySession(timestamp, { connectionProfileId, sql: `select '${name}'` })
  repository.create(createPresetFromSession({ name, profile, session, id: `${connectionProfileId}-${name}`, now: () => timestamp }))
}
function renderManager(repository: PresetManagerRepository, session = createQuerySession(1, { connectionProfileId: sqlProfile.id, sql: 'select 42' }), profile = sqlProfile) {
  return render(<PresetManagerAction repository={repository} session={session} profile={profile} />)
}

describe('PresetManagerAction', () => {
  beforeEach(() => { notify.mockReset(); resetTestStore() })
  afterEach(() => { cleanup(); resetTestStore(); vi.restoreAllMocks() })

  it('is enabled for an attached profile, opens focused, and saves a trimmed name without closing', () => {
    const repository = new ExplorationPresetRepository(new MemoryStorage())
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, sql: 'select * from checkout_errors' })
    renderManager(repository, session)
    const action = screen.getByRole('button', { name: 'Manage saved presets' }) as HTMLButtonElement
    expect(action.disabled).toBe(false)
    expect(action.textContent).toBe('Save')
    openDialog()
    const input = screen.getByRole('textbox', { name: 'Preset name' })
    expect(document.activeElement).toBe(input)
    expect(screen.getByText('No saved presets for this connection yet.')).toBeTruthy()
    fireEvent.change(input, { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '  Checkout errors  ' } })
    fireEvent.submit(input.closest('form')!)
    expect(repository.listForConnection(sqlProfile.id)).toEqual([expect.objectContaining({ name: 'Checkout errors', payload: expect.objectContaining({ sql: 'select * from checkout_errors' }) })])
    expect(notify).toHaveBeenCalledWith({ message: 'Saved preset “Checkout errors”.' })
    expect(screen.getByRole('dialog', { name: 'Saved presets' })).toBeTruthy()
    expect(screen.getByText('Checkout errors')).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('keeps the entered name and session unchanged when saving fails', () => {
    const base = new ExplorationPresetRepository(new MemoryStorage())
    const repository: PresetManagerRepository = { ...base, create: () => { throw new Error('quota exceeded') }, listForConnection: base.listForConnection.bind(base), rename: base.rename.bind(base), delete: base.delete.bind(base) }
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, queryMode: 'builder', sql: 'select count(*) from orders' })
    Object.assign(session, { running: true, queryError: 'old error', resultRevision: 9, seriesVisibility: { failed: false } })
    const before = structuredClone(session)
    renderManager(repository, session)
    openDialog()
    fireEvent.change(screen.getByRole('textbox', { name: 'Preset name' }), { target: { value: 'Retry me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(notify).toHaveBeenCalledWith({ message: 'Could not save preset: quota exceeded', tone: 'error' })
    expect((screen.getByRole('textbox', { name: 'Preset name' }) as HTMLInputElement).value).toBe('Retry me')
    expect(session).toEqual(before)
  })

  it('lists only the active tab connection, orders recent presets first, and ignores stale global profile state', () => {
    const repository = new ExplorationPresetRepository(new MemoryStorage())
    const profileA = { ...sqlProfile, id: 'production', name: 'Production' }
    const tabA = createQuerySession(1, { id: 'tab-a', connectionProfileId: profileA.id })
    const tabB = createQuerySession(2, { id: 'tab-b', connectionProfileId: sqlProfile.id })
    seed(repository, 'Prod errors', profileA.id, 20)
    seed(repository, 'Older staging', sqlProfile.id, 10)
    seed(repository, 'Staging errors', sqlProfile.id, 30)
    resetTestStore({ profiles: [profileA, sqlProfile], tabs: [tabA, tabB], activeTabId: tabB.id, activeProfileId: profileA.id })
    render(<PresetManagerAction repository={repository} />)
    openDialog()
    expect(screen.queryByText('Prod errors')).toBeNull()
    const names = screen.getAllByRole('listitem').map((row) => row.querySelector('span')?.textContent)
    expect(names).toEqual(['Staging errors', 'Older staging'])
  })

  it('reads presets persisted before rendering through a newly constructed repository', () => {
    const storage = new MemoryStorage()
    seed(new ExplorationPresetRepository(storage), 'Survives restart')
    renderManager(new ExplorationPresetRepository(storage))
    openDialog()
    expect(screen.getByText('Survives restart')).toBeTruthy()
  })

  it('renames with trimming, rejects blank names, and cancel does not persist', () => {
    const repository = new ExplorationPresetRepository(new MemoryStorage(), () => 50)
    seed(repository, 'Checkout errors')
    renderManager(repository)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Rename preset Checkout errors' }))
    const edit = screen.getByRole('textbox', { name: 'Rename Checkout errors' }) as HTMLInputElement
    expect(edit.value).toBe('Checkout errors')
    fireEvent.change(edit, { target: { value: '   ' } })
    expect((screen.getAllByRole('button', { name: 'Save' }).at(-1) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(edit, { target: { value: 'Do not keep' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(repository.listForConnection(sqlProfile.id)[0].name).toBe('Checkout errors')
    fireEvent.click(screen.getByRole('button', { name: 'Rename preset Checkout errors' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Checkout errors' }), { target: { value: '  Checkout failures  ' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Rename Checkout errors' }).closest('form')!)
    expect(repository.listForConnection(sqlProfile.id)[0].name).toBe('Checkout failures')
    expect(screen.getByText('Checkout failures')).toBeTruthy()
    expect(notify).toHaveBeenCalledWith({ message: 'Renamed preset to “Checkout failures”.' })
  })

  it('keeps rename edit state and value available when persistence fails', () => {
    const base = new ExplorationPresetRepository(new MemoryStorage())
    seed(base, 'Original')
    const repository: PresetManagerRepository = { create: base.create.bind(base), listForConnection: base.listForConnection.bind(base), rename: () => { throw new Error('blocked') }, delete: base.delete.bind(base) }
    renderManager(repository)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Rename preset Original' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Original' }), { target: { value: 'Retry rename' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Rename Original' }).closest('form')!)
    expect(notify).toHaveBeenCalledWith({ message: 'Could not rename preset: blocked', tone: 'error' })
    expect((screen.getByRole('textbox', { name: 'Rename Original' }) as HTMLInputElement).value).toBe('Retry rename')
  })

  it('requires delete confirmation, removes only the confirmed preset, and handles a missing preset', () => {
    const repository = new ExplorationPresetRepository(new MemoryStorage())
    seed(repository, 'Keep')
    seed(repository, 'Remove', sqlProfile.id, 2)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true).mockReturnValueOnce(true)
    renderManager(repository)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Remove' }))
    expect(confirm).toHaveBeenCalledWith('Delete preset “Remove”?')
    expect(screen.getByText('Remove')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Remove' }))
    expect(screen.queryByText('Remove')).toBeNull()
    expect(screen.getByText('Keep')).toBeTruthy()
    expect(notify).toHaveBeenCalledWith({ message: 'Deleted preset “Remove”.' })
    repository.delete(repository.listForConnection(sqlProfile.id)[0].id)
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Keep' }))
    expect(screen.queryByText('Keep')).toBeNull()
  })

  it('reports delete and read failures without hiding a persisted row or crashing the workspace', () => {
    const base = new ExplorationPresetRepository(new MemoryStorage())
    seed(base, 'Visible')
    const repository: PresetManagerRepository = { create: base.create.bind(base), listForConnection: base.listForConnection.bind(base), rename: base.rename.bind(base), delete: () => { throw new Error('storage denied') } }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager(repository)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Visible' }))
    expect(screen.getByText('Visible')).toBeTruthy()
    expect(notify).toHaveBeenCalledWith({ message: 'Could not delete preset: storage denied', tone: 'error' })
    cleanup()
    const readFailure: PresetManagerRepository = { ...repository, listForConnection: () => { throw new Error('read denied') } }
    renderManager(readFailure)
    openDialog()
    expect(screen.getByRole('alert').textContent).toContain('Could not read saved presets')
    expect(screen.queryByText('No saved presets for this connection yet.')).toBeNull()
  })

  it('does not mutate the session or invoke query lifecycle actions while managing presets', () => {
    const repository = new ExplorationPresetRepository(new MemoryStorage())
    seed(repository, 'Safe')
    const session = createQuerySession(1, { connectionProfileId: sqlProfile.id, sql: 'select safely' })
    const startQuery = vi.fn(), completeQuery = vi.fn(), setResult = vi.fn()
    resetTestStore({ profiles: [sqlProfile], tabs: [session], activeTabId: session.id, startQuery, completeQuery, setResult })
    const before = structuredClone(useStore.getState().tabs)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PresetManagerAction repository={repository} />)
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Rename preset Safe' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Safe' }))
    expect(startQuery).not.toHaveBeenCalled()
    expect(completeQuery).not.toHaveBeenCalled()
    expect(setResult).not.toHaveBeenCalled()
    expect(useStore.getState().tabs).toEqual(before)
  })
})
