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
