import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { DataSourceProfile } from '@shared/types'

const profiles: DataSourceProfile[] = [
  { kind: 'postgres', version: 1, id: 'pg', name: 'Orders', host: 'db.internal', port: 5432, database: 'orders', user: 'reader', password: '', ssl: false, readonly: true },
  { kind: 'bigquery', version: 1, id: 'bq', name: 'Analytics', billingProject: 'billing', defaultProject: 'data', maximumBytesBilled: '1000', readonly: true },
  { kind: 'local-files', version: 1, id: 'files', name: 'Exports', files: [{ path: '/tmp/export.csv', alias: 'export' }], readonly: true },
  { kind: 'sqlite-file', version: 1, id: 'sqlite', name: 'Archive', path: '/tmp/archive.sqlite', readonly: true }
]

vi.mock('../lib/api', () => ({ api: { connections: {
  list: vi.fn(async () => profiles), listObjects: vi.fn(async () => []), describeTable: vi.fn(async () => []),
  connect: vi.fn(), disconnect: vi.fn(), remove: vi.fn()
} } }))

import { Sidebar } from './Sidebar'
import { resetTestStore } from '../test/sessionTestUtils'

afterEach(() => { cleanup(); resetTestStore(); vi.clearAllMocks() })

it('derives every connection badge from the saved profile kind', async () => {
  render(<Sidebar />)
  for (const [name, label] of [['Orders', 'PostgreSQL'], ['Analytics', 'BigQuery'], ['Exports', 'Local files'], ['Archive', 'SQLite']]) {
    const item = (await screen.findByText(name)).closest('[data-connection-item]')!
    expect(within(item).getByText(label)).toBeTruthy()
  }
  expect(screen.queryByText('pg')).toBeNull()
  expect(document.body.textContent).not.toContain('db.internal')
  expect(document.body.textContent).not.toContain('orders @')
})
