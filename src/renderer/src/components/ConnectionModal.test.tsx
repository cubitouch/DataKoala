import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConnectionProfile, DataSourceProfile } from '../../../shared/types'

const { testConnection, upsert, chooseSqliteFile, chooseFiles, discoverProjects, discoverDefaults, listDatasets } = vi.hoisted(() => ({ testConnection: vi.fn(), upsert: vi.fn(), chooseSqliteFile: vi.fn(), chooseFiles: vi.fn(), discoverProjects: vi.fn(), discoverDefaults: vi.fn(), listDatasets: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { test: testConnection, upsert, chooseSqliteFile, chooseFiles, bigquery: { discoverProjects, discoverDefaults, listDatasets } } } }))
import { ConnectionModal } from './ConnectionModal'

const existing: ConnectionProfile = {
  kind: 'postgres', version: 1,
  id: 'profile-1', name: 'Original', host: 'old.host', port: 5432, database: 'old_db',
  user: 'old_user', password: 'old password', ssl: false, readonly: true
}
const renderModal = (profile: DataSourceProfile | null = null) => {
  const onSaved = vi.fn()
  render(<ConnectionModal existing={profile} onClose={vi.fn()} onSaved={onSaved} />)
  return { onSaved }
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  testConnection.mockReset()
  upsert.mockReset()
  testConnection.mockResolvedValue({ ok: true, serverVersion: '16.2' })
  upsert.mockImplementation(async (profile) => profile)
  chooseSqliteFile.mockReset()
  chooseFiles.mockReset()
  chooseSqliteFile.mockResolvedValue('/fixtures/analytics.sqlite3')
  chooseFiles.mockResolvedValue([])
  discoverProjects.mockReset(); discoverProjects.mockResolvedValue([])
  discoverDefaults.mockReset(); discoverDefaults.mockResolvedValue({})
  listDatasets.mockReset(); listDatasets.mockResolvedValue([])
})
afterEach(cleanup)

describe('ConnectionModal canonical connection draft', () => {
  it('switches the complete new-connection form from both typed selector buttons', () => {
    renderModal()
    const postgres = screen.getByRole('button', { name: 'PostgreSQL' })
    const localFiles = screen.getByRole('button', { name: 'Local files' })
    expect(postgres.getAttribute('type')).toBe('button')
    expect(localFiles.getAttribute('type')).toBe('button')
    expect(screen.getByRole('heading', { name: 'New Postgres connection' })).toBeTruthy()

    fireEvent.click(localFiles)
    expect(screen.getByRole('heading', { name: 'New local file connection' })).toBeTruthy()
    expect(screen.queryByLabelText('Paste a connection string')).toBeNull()

    fireEvent.click(postgres)
    expect(screen.getByRole('heading', { name: 'New Postgres connection' })).toBeTruthy()
    expect(screen.getByLabelText('Paste a connection string')).toBeTruthy()
  })

  it('chooses, tests, and saves a SQLite profile while retaining all three connection choices', async () => {
    const { onSaved } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'SQLite database' }))
    expect(screen.getByRole('heading', { name: 'New SQLite database connection' })).toBeTruthy()
    expect(screen.getByText(/filename extension does not matter/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose database…' }))
    expect(await screen.findByText('/fixtures/analytics.sqlite3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(testConnection).toHaveBeenCalledWith({
      kind: 'sqlite-file', version: 1, id: '', name: 'SQLite database',
      path: '/fixtures/analytics.sqlite3', readonly: true
    }))
    expect(await screen.findByText('SQLite database opened directly in read-only mode.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sqlite-file', path: '/fixtures/analytics.sqlite3' })))

    fireEvent.click(screen.getByRole('button', { name: 'Local files' }))
    expect(screen.getByRole('heading', { name: 'New local file connection' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'PostgreSQL' }))
    expect(screen.getByRole('heading', { name: 'New Postgres connection' })).toBeTruthy()
  })

  it('tests populated visible fields after a pasted string is cleared', async () => {
    renderModal()
    const textarea = screen.getByLabelText('Paste a connection string')
    fireEvent.change(textarea, { target: { value: 'postgres://alice:s%20ecret@db.example:5440/reports?sslmode=require' } })
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'db.example')
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByRole('button', { name: 'Testing…' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Cancel test' })).toBeTruthy()
    await waitFor(() => expect(testConnection).toHaveBeenCalledWith(expect.objectContaining({
      host: 'db.example', port: 5440, database: 'reports', user: 'alice', password: 's ecret', ssl: true
    })))
    expect(await screen.findByText('Connected — server 16.2')).toBeTruthy()
  })

  it('Test and Save both use current edited fields and preserve an existing id', async () => {
    const { onSaved } = renderModal(existing)
    change('Host', ' new.host '); change('Port', '6543'); change('Database', 'new_db'); change('User', 'new_user')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(testConnection).toHaveBeenCalled())
    const tested = testConnection.mock.calls[0][0]
    expect(tested).toEqual(expect.objectContaining({ kind: 'postgres', version: 1, id: 'profile-1', host: 'new.host', port: 6543, database: 'new_db', user: 'new_user' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(upsert).toHaveBeenCalled())
    expect(upsert.mock.calls[0][0]).toEqual(tested)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it.each([
    ['Host', '', 'Host is required'], ['Port', '0', 'Port must be between 1 and 65535'],
    ['Database', '', 'Database is required'], ['User', '', 'User is required']
  ])('shows accessible feedback and does not test an invalid %s', async (label, value, message) => {
    renderModal(existing)
    change(label, value)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true')
    expect(testConnection).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(label)))
  })

  it('retains a valid manual draft after an invalid paste and replaces it after the next valid parse', async () => {
    renderModal(existing)
    const textarea = screen.getByLabelText('Paste a connection string')
    fireEvent.change(textarea, { target: { value: 'definitely invalid' } })
    expect(await screen.findByText(/Unrecognised format/)).toBeTruthy()
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'old.host')
    fireEvent.change(textarea, { target: { value: 'postgres://bob@new.host:6000/newdb' } })
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'new.host')
    expect(screen.getByLabelText(/^Password/)).toHaveProperty('value', '')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(testConnection).toHaveBeenCalledWith(expect.objectContaining({ host: 'new.host', password: '' })))
  })

  it('ignores an older test response after an edit and newer test', async () => {
    let resolveA!: (value: unknown) => void
    let resolveB!: (value: unknown) => void
    testConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve }))
    renderModal(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    change('Host', 'new.host')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    resolveB({ ok: true, serverVersion: 'NEW' })
    expect(await screen.findByText('Connected — server NEW')).toBeTruthy()
    resolveA({ ok: false, error: 'OLD FAILURE' })
    await Promise.resolve()
    expect(screen.queryByText('OLD FAILURE')).toBeNull()
    expect(screen.getByText('Connected — server NEW')).toBeTruthy()
  })

  it('lets the user cancel a test and ignores its eventual response', async () => {
    let resolveTest!: (value: unknown) => void
    testConnection.mockImplementationOnce(() => new Promise((resolve) => { resolveTest = resolve }))
    renderModal(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByRole('button', { name: 'Testing…' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel test' }))
    expect(await screen.findByText('Connection test cancelled.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: 'Cancel test' })).toBeNull()
    resolveTest({ ok: true, serverVersion: 'LATE' })
    await Promise.resolve()
    expect(screen.queryByText('Connected — server LATE')).toBeNull()
    expect(screen.getByText('Connection test cancelled.')).toBeTruthy()
  })

  it('keeps a closed-port failure visible after the loading state ends', async () => {
    testConnection.mockResolvedValueOnce({ ok: false, error: 'connect ECONNREFUSED 127.0.0.1:65432' })
    renderModal(existing)
    change('Port', '65432')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByRole('button', { name: 'Testing…' })).toBeTruthy()
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('ECONNREFUSED')
    expect(screen.getByRole('button', { name: 'Test' }).hasAttribute('disabled')).toBe(false)
    await Promise.resolve()
    expect(screen.getByRole('alert').textContent).toContain('127.0.0.1:65432')
  })

  it('shows a fallback instead of silently rendering an empty backend error', async () => {
    testConnection.mockResolvedValueOnce({ ok: false, error: '' })
    renderModal(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText('Connection test failed. The server did not provide an error message.')).toBeTruthy()
  })

  it('clears validation and stale results when connection fields become valid or change', async () => {
    renderModal(existing)
    change('Port', 'bad')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/Port must/)).toBeTruthy()
    change('Port', '5432')
    expect(screen.queryByText(/Port must/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/Connected/)).toBeTruthy()
    change('Host', 'another.host')
    expect(screen.queryByText(/Connected/)).toBeNull()
  })
})
