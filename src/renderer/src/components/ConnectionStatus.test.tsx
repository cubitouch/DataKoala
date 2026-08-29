import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ConnectionStatus } from './ConnectionStatus'
import { resetTestStore } from '../test/sessionTestUtils'

const postgres = { kind: 'postgres' as const, version: 1 as const, id: 'pg', name: 'A very long production database name', host: 'db', port: 5432, database: 'app', user: 'app', password: '', ssl: false, readonly: true }

describe('ConnectionStatus', () => {
  afterEach(() => { cleanup(); resetTestStore() })

  it('preserves connected text, glow state, live semantics, and the full accessible label', () => {
    resetTestStore({ profiles: [postgres], activeProfileId: postgres.id, connected: true, connectionStatus: 'connected', serverVersion: '16.4' })
    render(<ConnectionStatus />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('A very long production database name · PostgreSQL 16.4')
    expect(status.dataset.state).toBe('connected')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.title).toBe(status.textContent)
  })

  it.each([
    [{ connectionStatus: 'reconnecting' as const }, 'Reconnecting…', 'reconnecting'],
    [{ connectionStatus: 'idle' as const }, 'Idle', 'idle'],
    [{ connectionStatus: 'disconnected' as const, activeProfileId: postgres.id, profiles: [postgres] }, 'A very long production database name · disconnected', 'disconnected'],
    [{ connectionStatus: 'error' as const, connectionError: 'Connection refused' }, 'Connection refused', 'error']
  ])('renders the non-connected state %#', (patch, text, stateClass) => {
    resetTestStore(patch)
    render(<ConnectionStatus />)
    expect(screen.getByRole('status').textContent).toBe(text)
    expect(screen.getByRole('status').dataset.state).toBe(stateClass)
  })
})
