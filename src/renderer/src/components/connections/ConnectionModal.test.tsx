// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ConnectionProfile, DataSourceProfile } from '@shared/types'

const {
  testConnection,
  upsert,
  chooseSqliteFile,
  chooseFiles,
  discoverProjects,
  discoverDefaults,
  listDatasets,
  retryCredentialMigration,
} = vi.hoisted(() => ({
  testConnection: vi.fn(),
  upsert: vi.fn(),
  chooseSqliteFile: vi.fn(),
  chooseFiles: vi.fn(),
  discoverProjects: vi.fn(),
  discoverDefaults: vi.fn(),
  listDatasets: vi.fn(),
  retryCredentialMigration: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    connections: {
      test: testConnection,
      upsert,
      chooseSqliteFile,
      chooseFiles,
      retryCredentialMigration,
      bigquery: { discoverProjects, discoverDefaults, listDatasets },
    },
  },
}))
import { ConnectionModal } from './ConnectionModal'

const existing: ConnectionProfile = {
  kind: 'postgres',
  version: 2,
  id: 'profile-1',
  name: 'Original',
  host: 'old.host',
  port: 5432,
  database: 'old_db',
  user: 'old_user',
  password: '',
  hasPassword: true,
  credentialState: 'secure',
  tlsMode: 'disable',
  readonly: true,
}
const renderModal = (
  profile: DataSourceProfile | null = null,
  stayOnPicker = false,
) => {
  const onSaved = vi.fn()
  render(
    <ConnectionModal existing={profile} onClose={vi.fn()} onSaved={onSaved} />,
  )
  if (!profile && !stayOnPicker)
    fireEvent.click(screen.getByRole('radio', { name: /PostgreSQL/ }))
  return { onSaved }
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  testConnection.mockReset()
  upsert.mockReset()
  testConnection.mockResolvedValue({ ok: true, serverVersion: '16.2' })
  upsert.mockImplementation(async (profile) => profile)
  chooseSqliteFile.mockReset()
  chooseFiles.mockReset()
  chooseSqliteFile.mockResolvedValue('/fixtures/analytics.sqlite3')
  chooseFiles.mockResolvedValue([])
  discoverProjects.mockReset()
  discoverProjects.mockResolvedValue([])
  discoverDefaults.mockReset()
  discoverDefaults.mockResolvedValue({})
  listDatasets.mockReset()
  listDatasets.mockResolvedValue([])
  retryCredentialMigration.mockReset()
})
afterEach(cleanup)

describe('ConnectionModal canonical connection draft', () => {
  it('represents a saved password without putting it in the input', async () => {
    renderModal(existing)
    expect(screen.getByLabelText('Password')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Password')).toHaveProperty(
      'placeholder',
      'Saved securely — leave blank to keep',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove saved password' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ password: '', hasPassword: false }),
      ),
    )
  })
  it('starts with a source picker and preserves drafts across Back', () => {
    renderModal(null, true)
    const postgres = screen.getByRole('radio', { name: /PostgreSQL/ })
    const localFiles = screen.getByRole('radio', { name: /Local files/ })
    expect(postgres.getAttribute('type')).toBe('button')
    expect(localFiles.getAttribute('type')).toBe('button')
    expect(
      screen.getByRole('heading', { name: 'Choose a connection type' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: /Excel/ }).hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(postgres)
    expect(screen.getByLabelText('Paste a connection string')).toBeTruthy()
    change('Profile name', 'Draft Postgres')
    fireEvent.click(
      screen.getByRole('button', { name: /Back to connection types/ }),
    )
    fireEvent.click(screen.getByRole('radio', { name: /Local files/ }))
    expect(screen.getByRole('heading', { name: 'Local files' })).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /Back to connection types/ }),
    )
    fireEvent.click(screen.getByRole('radio', { name: /PostgreSQL/ }))
    expect(screen.getByLabelText('Profile name')).toHaveProperty(
      'value',
      'Draft Postgres',
    )
  })

  it('chooses, tests, and saves a SQLite profile while retaining all three connection choices', async () => {
    const { onSaved } = renderModal(null, true)
    fireEvent.click(screen.getByRole('radio', { name: /SQLite/ }))
    expect(screen.getByRole('heading', { name: 'SQLite' })).toBeTruthy()
    expect(screen.getByText(/filename extension does not matter/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose database…' }))
    expect(await screen.findByText('/fixtures/analytics.sqlite3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() =>
      expect(testConnection).toHaveBeenCalledWith({
        kind: 'sqlite-file',
        version: 1,
        id: '',
        name: 'SQLite database',
        path: '/fixtures/analytics.sqlite3',
        readonly: true,
      }),
    )
    expect(
      await screen.findByText(
        'SQLite database opened directly in read-only mode.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'sqlite-file',
          path: '/fixtures/analytics.sqlite3',
        }),
      ),
    )
  })

  it('tests populated visible fields after a pasted string is cleared', async () => {
    renderModal()
    const textarea = screen.getByLabelText('Paste a connection string')
    fireEvent.change(textarea, {
      target: {
        value:
          'postgres://alice:s%20ecret@db.example:5440/reports?sslmode=require',
      },
    })
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'db.example')
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(
      screen
        .getByRole('button', { name: 'Testing…' })
        .getAttribute('aria-busy'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Cancel test' })).toBeTruthy()
    await waitFor(() =>
      expect(testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'db.example',
          port: 5440,
          database: 'reports',
          user: 'alice',
          password: 's ecret',
          tlsMode: 'require',
        }),
      ),
    )
    expect(await screen.findByText('Connected — server 16.2')).toBeTruthy()
  })

  it('Test and Save both use current edited fields and preserve an existing id', async () => {
    const { onSaved } = renderModal(existing)
    change('Host', ' new.host ')
    change('Port', '6543')
    change('Database', 'new_db')
    change('User', 'new_user')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(testConnection).toHaveBeenCalled())
    const tested = testConnection.mock.calls[0][0]
    expect(tested).toEqual(
      expect.objectContaining({
        kind: 'postgres',
        version: 2,
        id: 'profile-1',
        host: 'new.host',
        port: 6543,
        database: 'new_db',
        user: 'new_user',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(upsert).toHaveBeenCalled())
    expect(upsert.mock.calls[0][0]).toEqual(tested)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it.each([
    ['Host', '', 'Host is required'],
    ['Port', '0', 'Port must be between 1 and 65535'],
    ['Database', '', 'Database is required'],
    ['User', '', 'User is required'],
  ])(
    'shows accessible feedback and does not test an invalid %s',
    async (label, value, message) => {
      renderModal(existing)
      change(label, value)
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      expect(await screen.findByText(message)).toBeTruthy()
      expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe(
        'true',
      )
      expect(testConnection).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText(label)),
      )
    },
  )

  it('retains a valid manual draft after an invalid paste and replaces it after the next valid parse', async () => {
    renderModal(existing)
    const textarea = screen.getByLabelText('Paste a connection string')
    fireEvent.change(textarea, { target: { value: 'definitely invalid' } })
    expect(await screen.findByText(/Unrecognised format/)).toBeTruthy()
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'old.host')
    fireEvent.change(textarea, {
      target: { value: 'postgres://bob@new.host:6000/newdb' },
    })
    expect(screen.getByLabelText('Host')).toHaveProperty('value', 'new.host')
    expect(screen.getByLabelText(/^Password/)).toHaveProperty('value', '')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() =>
      expect(testConnection).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'new.host', password: '' }),
      ),
    )
  })

  it('shows migrated require mode as compatibility TLS and removes the warning when verification is selected', () => {
    renderModal({ ...existing, tlsMode: 'require' })
    expect(
      screen.getByRole('combobox', { name: /TLS mode:.*Require TLS/i }),
    ).toBeTruthy()
    expect(
      screen.getByText(/server certificate is not verified/i),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: /TLS mode:/i }))
    fireEvent.click(
      screen.getByRole('option', { name: /Verify server identity/i }),
    )
    expect(
      screen.queryByText(/server certificate is not verified/i),
    ).toBeNull()
    expect(screen.getByLabelText('CA certificate (optional)')).toBeTruthy()
  })

  it('shows CA input only for certificate-verifying TLS modes', () => {
    renderModal(existing)
    const tls = screen.getByRole('combobox', { name: /TLS mode:/i })
    expect(screen.queryByLabelText('CA certificate (optional)')).toBeNull()

    fireEvent.click(tls)
    fireEvent.click(screen.getByRole('option', { name: /^Verify CA/i }))
    expect(screen.getByLabelText('CA certificate (optional)')).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: /TLS mode:/i }))
    fireEvent.click(screen.getByRole('option', { name: /Require TLS/i }))
    expect(screen.queryByLabelText('CA certificate (optional)')).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: /TLS mode:/i }))
    fireEvent.click(
      screen.getByRole('option', { name: /Verify server identity/i }),
    )
    expect(screen.getByLabelText('CA certificate (optional)')).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: /TLS mode:/i }))
    fireEvent.click(screen.getByRole('option', { name: /^Disabled/i }))
    expect(screen.queryByLabelText('CA certificate (optional)')).toBeNull()
  })

  it('pasted sslmode selects the exact TLS mode without preserving the previous mode', () => {
    renderModal({ ...existing, tlsMode: 'require' })
    const textarea = screen.getByLabelText('Paste a connection string')

    fireEvent.change(textarea, {
      target: {
        value:
          'postgres://alice:secret@db.example:5432/reports?sslmode=verify-full',
      },
    })
    expect(
      screen.getByRole('combobox', {
        name: /TLS mode:.*Verify server identity/i,
      }),
    ).toBeTruthy()

    fireEvent.change(textarea, {
      target: {
        value:
          'postgres://alice:secret@db.example:5432/reports?sslmode=require',
      },
    })
    expect(
      screen.getByRole('combobox', { name: /TLS mode:.*Require TLS/i }),
    ).toBeTruthy()
  })

  it('Test and Save receive exact TLS mode and CA while previews never expose CA material', async () => {
    renderModal(existing)
    fireEvent.click(screen.getByRole('combobox', { name: /TLS mode:/i }))
    fireEvent.click(
      screen.getByRole('option', { name: /Verify server identity/i }),
    )
    const ca =
      '-----BEGIN CERTIFICATE-----\\nSYNTHETIC-TEST-CA\\n-----END CERTIFICATE-----'
    fireEvent.change(screen.getByLabelText('CA certificate (optional)'), {
      target: { value: ca },
    })

    const preview = screen.getByText('Will connect as').parentElement
    expect(preview?.textContent).toContain('sslmode=verify-full')
    expect(preview?.textContent).not.toContain('SYNTHETIC-TEST-CA')

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() =>
      expect(testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          tlsMode: 'verify-full',
          tlsCa: ca,
        }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          tlsMode: 'verify-full',
          tlsCa: ca,
        }),
      ),
    )
  })

  it('changing TLS mode or CA clears stale connection-test results', async () => {
    renderModal(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/Connected/)).toBeTruthy()

    fireEvent.click(screen.getByRole('combobox', { name: /TLS mode:/i }))
    fireEvent.click(screen.getByRole('option', { name: /^Verify CA/i }))
    expect(screen.queryByText(/Connected/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/Connected/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('CA certificate (optional)'), {
      target: { value: 'SYNTHETIC-TEST-CA' },
    })
    expect(screen.queryByText(/Connected/)).toBeNull()
  })

  it('ignores an older test response after an edit and newer test', async () => {
    let resolveA!: (value: unknown) => void
    let resolveB!: (value: unknown) => void
    testConnection
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve
          }),
      )
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
    testConnection.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve
        }),
    )
    renderModal(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(
      screen.getByRole('button', { name: 'Testing…' }).hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel test' }))
    expect(await screen.findByText('Connection test cancelled.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Test' }).hasAttribute('disabled'),
    ).toBe(false)
    expect(screen.queryByRole('button', { name: 'Cancel test' })).toBeNull()
    resolveTest({ ok: true, serverVersion: 'LATE' })
    await Promise.resolve()
    expect(screen.queryByText('Connected — server LATE')).toBeNull()
    expect(screen.getByText('Connection test cancelled.')).toBeTruthy()
  })

  it('keeps a closed-port failure visible after the loading state ends', async () => {
    testConnection.mockResolvedValueOnce({
      ok: false,
      error: 'connect ECONNREFUSED 127.0.0.1:65432',
    })
    renderModal(existing)
    change('Port', '65432')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByRole('button', { name: 'Testing…' })).toBeTruthy()
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('ECONNREFUSED')
    expect(
      screen.getByRole('button', { name: 'Test' }).hasAttribute('disabled'),
    ).toBe(false)
    await Promise.resolve()
    expect(screen.getByRole('alert').textContent).toContain('127.0.0.1:65432')
  })

  it('shows a fallback instead of silently rendering an empty backend error', async () => {
    testConnection.mockResolvedValueOnce({ ok: false, error: '' })
    renderModal(existing)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(
      await screen.findByText(
        'Connection test failed. The server did not provide an error message.',
      ),
    ).toBeTruthy()
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
