import React from 'react'
void React
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataSourceProfile } from '@shared/types'
import { activeTestSession, patchActiveTestSession, resetTestStore } from './test/sessionTestUtils'
import { restoreWorkspaceDraft, serializeWorkspaceDraft, WORKSPACE_STORAGE_KEY } from './lib/workspacePersistence'
import { useStore } from './store/useStore'

const mocks = vi.hoisted(() => ({ list: vi.fn(), queryEditorRenders: 0 }))
vi.mock('./lib/api', () => ({ api: {
  connections: {
    list: mocks.list,
    onStateChanged: vi.fn(() => () => undefined),
    connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn(), listObjects: vi.fn(async () => [])
  },
  query: { run: vi.fn(), explain: vi.fn() },
  export: { saveText: vi.fn() }
} }))
vi.mock('./components/QueryEditor', () => ({ QueryEditor: () => { mocks.queryEditorRenders += 1; return <div>SQL editor mounted</div> } }))
vi.mock('./components/BuilderPanel', () => ({ BuilderPanel: () => <div>Builder mounted</div> }))
vi.mock('./components/ResultExplorer', () => ({ ResultExplorer: () => <div>Results mounted</div> }))
vi.mock('./components/ExplainPane', () => ({ ExplainPane: () => null }))

import { App } from './App'

const prometheus: DataSourceProfile = {
  id: 'prom-1', name: 'Cloud metrics', version: 1, kind: 'prometheus', readonly: true,
  transport: { kind: 'gcx' }
}
const postgres: DataSourceProfile = {
  id: 'pg-1', name: 'Postgres', version: 1, kind: 'postgres', readonly: true,
  host: 'localhost', port: 5432, database: 'app', user: 'app', password: '', ssl: false
}

function persistedWorkspaceStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const saved = serializeWorkspaceDraft(useStore.getState())
  return { getItem: (key) => key === WORKSPACE_STORAGE_KEY ? saved : null, setItem: vi.fn() }
}

beforeEach(() => {
  resetTestStore()
  localStorage.clear()
  mocks.queryEditorRenders = 0
  mocks.list.mockReset()
})
afterEach(() => { cleanup(); resetTestStore() })

describe('Prometheus workspace restoration', () => {
  it('restores a Prometheus-bound tab, loads its saved profile, and keeps the app shell alive while disconnected', async () => {
    patchActiveTestSession({ connectionProfileId: prometheus.id, queryMode: 'sql', sql: 'stale SQL must not initialize an editor' })
    const storage = persistedWorkspaceStorage()

    resetTestStore()
    expect(restoreWorkspaceDraft((patch) => useStore.setState(patch), storage)).toBeTruthy()
    let resolveProfiles!: (profiles: DataSourceProfile[]) => void
    mocks.list.mockReturnValue(new Promise<DataSourceProfile[]>((resolve) => { resolveProfiles = resolve }))
    const { container } = render(<App />)

    expect(screen.getByRole('status', { name: 'Loading connection…' })).toBeTruthy()
    expect(container.querySelector('.titlebar > .query-tabs')).toBeTruthy()
    expect(container.querySelector('.main-shell > .query-tabs, .query-tabs-shell')).toBeNull()
    const initialEditorRenders = mocks.queryEditorRenders
    expect(initialEditorRenders).toBe(0)
    resolveProfiles([prometheus])
    await screen.findByText('SQL editor mounted')
    expect(mocks.queryEditorRenders).toBeGreaterThan(initialEditorRenders)
    expect(activeTestSession().connectionProfileId).toBe(prometheus.id)
    expect(useStore.getState().activeProfileId).toBeNull()
    expect(screen.getAllByText('Cloud metrics').length).toBeGreaterThan(0)
    expect(screen.getByText('Disconnected')).toBeTruthy()
  })

  it('renders the PromQL query surface for an already-active Prometheus connection', () => {
    resetTestStore({ profiles: [prometheus], activeProfileId: prometheus.id, connected: true, connectionStatus: 'connected' })
    patchActiveTestSession({ connectionProfileId: prometheus.id, queryMode: 'builder' })
    mocks.list.mockResolvedValue([prometheus])
    render(<App />)

    expect(screen.getByText('SQL editor mounted')).toBeTruthy()
    expect(screen.getByText('Results mounted')).toBeTruthy()
    expect(screen.queryByText('Builder mounted')).toBeNull()
    expect(screen.getByText(/Cloud metrics · Prometheus/)).toBeTruthy()
  })

  it('continues to initialize the SQL editor when another datasource is active', async () => {
    resetTestStore({ profiles: [prometheus, postgres], activeProfileId: postgres.id, connected: true, connectionStatus: 'connected' })
    patchActiveTestSession({ connectionProfileId: postgres.id, queryMode: 'sql' })
    mocks.list.mockResolvedValue([prometheus, postgres])
    render(<App />)

    await waitFor(() => expect(screen.getByText('SQL editor mounted')).toBeTruthy())
    expect(screen.queryByText('Prometheus query support is coming')).toBeNull()
    expect(screen.getByText(/Postgres · PostgreSQL/)).toBeTruthy()
  })
})
