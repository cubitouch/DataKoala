import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'
const { upsert, discover, testConnection } = vi.hoisted(() => ({
  upsert: vi.fn(),
  discover: vi.fn(),
  testConnection: vi.fn(),
}))
vi.mock('@lib/api', () => ({
  api: {
    connections: {
      upsert,
      test: testConnection,
      prometheus: {
        discoverDatasources: async () => [
          { uid: 'metrics', name: 'Metrics', type: 'prometheus' },
        ],
        discover,
      },
      loki: {
        discover: async () => [{ uid: 'logs', name: 'Logs', type: 'loki' }],
      },
      tempo: {
        discoverDatasources: async () => [
          { uid: 'traces', name: 'Traces', type: 'tempo' },
        ],
      },
      bigquery: {
        discoverProjects: async () => [],
        discoverDefaults: async () => ({}),
        listDatasets: async () => [],
      },
    },
  },
}))
import { ConnectionModal } from './ConnectionModal'
const base = { id: 'captured', name: 'Captured', readonly: true as const }
const profiles: DataSourceProfile[] = [
  {
    ...base,
    kind: 'postgres',
    version: 2,
    host: 'localhost',
    port: 5432,
    database: 'db',
    user: 'reader',
    password: '',
    tlsMode: 'disable',
  },
  {
    ...base,
    kind: 'bigquery',
    version: 1,
    billingProject: 'synthetic',
    maximumBytesBilled: '',
  },
  {
    ...base,
    kind: 'local-files',
    version: 1,
    files: [{ path: '/tmp/example.csv', alias: 'example' }],
  },
  { ...base, kind: 'sqlite-file', version: 1, path: '/tmp/example.sqlite' },
  {
    ...base,
    kind: 'prometheus',
    version: 1,
    transport: { kind: 'gcx', datasourceUid: 'metrics' },
  },
  {
    ...base,
    kind: 'loki',
    version: 1,
    transport: { kind: 'gcx', datasourceUid: 'logs' },
  },
  {
    ...base,
    kind: 'tempo',
    version: 1,
    transport: { kind: 'gcx', datasourceUid: 'traces' },
  },
]
beforeEach(() => {
  upsert.mockReset()
  testConnection.mockReset()
  discover.mockReset()
})
afterEach(cleanup)
it.each(profiles)(
  '$kind owns pending Save and cannot affect a replacement edit profile',
  async (profile) => {
    let finish!: (profile: DataSourceProfile) => void
    upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const onSaved = vi.fn(),
      onClose = vi.fn()
    const view = render(
      <ConnectionModal
        existing={profile}
        onSaved={onSaved}
        onClose={onClose}
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
      ).toBe(false),
    )
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)
    await waitFor(() => expect(upsert).toHaveBeenCalledOnce())
    fireEvent.click(saveButton)
    expect(upsert).toHaveBeenCalledOnce()
    const replacement = { ...profile, id: 'replacement', name: 'Replacement' }
    view.rerender(
      <ConnectionModal
        existing={replacement}
        onSaved={onSaved}
        onClose={onClose}
      />,
    )
    await act(async () => finish(profile))
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelectorAll('[data-modal-backdrop]')).toHaveLength(1)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
      true,
    )
  },
)

for (const profile of profiles.filter((p) =>
  ['postgres', 'bigquery'].includes(p.kind),
)) {
  it.each(['success', 'failure'])(
    `${profile.kind} retains pending Save ownership across edits (%s)`,
    async (outcome) => {
      let resolve!: (value: DataSourceProfile) => void
      let reject!: (error: Error) => void
      upsert
        .mockReturnValueOnce(
          new Promise((done, fail) => {
            resolve = done
            reject = fail
          }),
        )
        .mockImplementation(async (value) => value)
      const onSaved = vi.fn(),
        onClose = vi.fn()
      render(
        <ConnectionModal
          existing={profile}
          onSaved={onSaved}
          onClose={onClose}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      const label = profile.kind === 'postgres' ? 'Host' : 'Connection name'
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: 'edited' },
      })
      expect(upsert).toHaveBeenCalledOnce()
      expect(upsert.mock.calls[0][0]).toMatchObject(profile)
      expect(
        screen.getByRole('button', { name: /Sav/ }).hasAttribute('disabled'),
      ).toBe(true)
      const testButton = screen.getByRole('button', { name: /Test/ })
      expect(testButton.hasAttribute('disabled')).toBe(true)
      fireEvent.click(testButton)
      expect(testConnection).not.toHaveBeenCalled()
      await act(async () => {
        if (outcome === 'success') resolve(profile)
        else reject(new Error('Storage unavailable'))
      })
      if (outcome === 'success') {
        expect(onSaved).toHaveBeenCalledExactlyOnceWith(profile)
        expect(onClose).toHaveBeenCalledOnce()
      } else {
        expect(screen.getByRole('alert').textContent).toContain(
          'Storage unavailable',
        )
        expect(screen.getByLabelText(label)).toHaveProperty('value', 'edited')
        expect(
          screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
        ).toBe(false)
        expect(onSaved).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
        expect(upsert.mock.calls[1][0]).toMatchObject(
          profile.kind === 'postgres' ? { host: 'edited' } : { name: 'edited' },
        )
        expect(onClose).toHaveBeenCalledOnce()
      }
    },
  )
}

const bigQueryEdits = [
  {
    name: 'name',
    edit: () =>
      fireEvent.change(screen.getByLabelText('Connection name'), {
        target: { value: 'Edited' },
      }),
    expected: { name: 'Edited' },
  },
  {
    name: 'project reference',
    edit: () =>
      fireEvent.change(screen.getByLabelText('Paste BigQuery reference'), {
        target: { value: 'other.dataset' },
      }),
    expected: { defaultProject: 'other', defaultDataset: 'dataset' },
  },
  {
    name: 'billing limit',
    edit: () => {
      fireEvent.click(screen.getByText('Advanced'))
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Limit bytes billed per query' }),
      )
    },
    expected: { maximumBytesBilled: '' },
  },
]
for (const edit of bigQueryEdits) {
  it.each(['success', 'provider failure', 'rejection'])(
    `BigQuery keeps pending Test controls truthful after editing ${edit.name} (%s)`,
    async (outcome) => {
      let resolve!: (value: unknown) => void
      let reject!: (error: Error) => void
      testConnection
        .mockReturnValueOnce(
          new Promise((done, fail) => {
            resolve = done
            reject = fail
          }),
        )
        .mockResolvedValue({ ok: true })
      upsert.mockImplementation(async (value) => value)
      render(
        <ConnectionModal
          existing={
            { ...profiles[1], maximumBytesBilled: '100' } as DataSourceProfile
          }
          onSaved={vi.fn()}
          onClose={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      edit.edit()
      expect(
        screen
          .getByRole('button', { name: 'Testing…' })
          .hasAttribute('disabled'),
      ).toBe(true)
      expect(
        screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
      ).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Testing…' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(testConnection).toHaveBeenCalledOnce()
      expect(upsert).not.toHaveBeenCalled()
      await act(async () => {
        if (outcome === 'rejection') reject(new Error('OLD failure'))
        else
          resolve(
            outcome === 'success'
              ? { ok: true }
              : { ok: false, error: 'OLD failure' },
          )
      })
      expect(
        screen.queryByText('Credentials and metadata access verified.'),
      ).toBeNull()
      expect(screen.queryByText('OLD failure')).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Test' }).hasAttribute('disabled'),
      ).toBe(false)
      expect(
        screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
      ).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      await screen.findByText('Credentials and metadata access verified.')
      expect(testConnection).toHaveBeenCalledTimes(2)
      expect(testConnection.mock.calls[1][0]).toMatchObject(edit.expected)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(upsert).toHaveBeenCalledOnce())
      expect(upsert.mock.calls[0][0]).toMatchObject(edit.expected)
    },
  )
}
