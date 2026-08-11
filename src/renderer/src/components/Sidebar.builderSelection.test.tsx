import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <pre>{value}</pre> }))
const { describeTable } = vi.hoisted(() => ({
  describeTable: vi.fn(async () => [
    { name: 'created_at', dataTypeName: 'timestamp with time zone' },
    { name: 'status', dataTypeName: 'text' },
    { name: 'revenue', dataTypeName: 'numeric' },
    { name: 'duckdb_measure', dataTypeName: 'DOUBLE' },
    { name: 'clock_time', dataTypeName: 'TIME' },
    { name: 'clock_time_tz', dataTypeName: 'TIMETZ' }
  ])
}))
vi.mock('../lib/api', () => ({
  api: {
    connections: {
      list: vi.fn(async () => []),
      listObjects: vi.fn(async () => []),
      describeTable,
      connect: vi.fn(),
      disconnect: vi.fn(),
      remove: vi.fn()
    },
    query: {
      seriesStatistics: vi.fn(async () => ({ available: true, estimatedDistinct: 2, source: 'pg_stats' as const })),
      probeSeriesCardinality: vi.fn(async () => ({ exceedsHardLimit: false }))
    }
  }
}))

import { Sidebar } from './Sidebar'
import { BuilderPanel } from './BuilderPanel'
import { activeTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'

const schemas = [{
  name: 'demo_shop',
  isSystem: false,
  relations: [{
    schema: 'demo_shop', name: 'orders', kind: 'r' as const,
    qualifiedName: 'demo_shop.orders', columnsStatus: 'idle' as const
  }]
}]

afterEach(() => {
  cleanup()
  resetTestStore()
  vi.clearAllMocks()
})

describe('Sidebar Builder relation selection', () => {
  it('loads relation columns and populates explicit Time and X axis choices when the table is chosen from the object tree', async () => {
    resetTestStore({ connected: true, activeProfileId: 'p1', connectionStatus: 'connected' })
    setActiveTestMetadata(schemas, 'loaded', null, 'p1')
    const session = activeTestSession()
    const { useStore } = await import('../store/useStore')
    useStore.setState({
      tabs: [{ ...session, connectionProfileId: 'p1', builder: { table: null, timeColumn: null, timeBucket: 'day', seriesColumns: [], timeRange: undefined } }]
    })

    render(<><Sidebar /><BuilderPanel /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Select demo_shop.orders for Builder' }))

    await waitFor(() => expect(describeTable).toHaveBeenCalledWith('p1', 'demo_shop', 'orders'))
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Time column: Select a time column/ })).toBeTruthy())
    expect(activeTestSession().builder.timeColumn).toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: /Time column/ }))
    expect(screen.getByRole('option', { name: /created_at, timestamp with time zone/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /clock_time, TIME/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /clock_time_tz, TIMETZ/ })).toBeNull()
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Time column/ }), { key: 'Escape' })

    fireEvent.click(screen.getByRole('combobox', { name: /X axis/ }))
    expect(screen.getByRole('option', { name: /created_at, timestamp with time zone/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /status, text/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /revenue, numeric/ })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('combobox', { name: /X axis/ }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('combobox', { name: /Y axis/ }))
    expect(screen.getByRole('option', { name: /duckdb_measure, DOUBLE/ })).toBeTruthy()
  })
})
