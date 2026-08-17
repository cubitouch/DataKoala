import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <pre>{value}</pre> }))
vi.mock('../lib/api', () => ({
  api: {
    query: {
      seriesStatistics: vi.fn(async () => ({ available: true, estimatedDistinct: 2, source: 'pg_stats' as const })),
      probeSeriesCardinality: vi.fn(async () => ({ exceedsHardLimit: false }))
    },
    connections: { describeTable: vi.fn() }
  }
}))

import { BuilderPanel } from './BuilderPanel'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'
import type { DatabaseSchemaNode } from '@shared/types'

const schemas: DatabaseSchemaNode[] = [
  { name: 'demo_shop', isSystem: false, relations: [] },
  { name: 'analytics', isSystem: false, relations: [] },
  { name: 'information_schema', isSystem: true, relations: [] }
]

function arrange() {
  resetTestStore({ connected: true, activeProfileId: 'p1', connectionStatus: 'connected' })
  setActiveTestMetadata(schemas, 'loaded', null, 'p1')
  patchActiveTestSession({
    connectionProfileId: 'p1',
    builder: { table: null, timeColumn: null, timeBucket: 'day', seriesColumns: [], timeRange: undefined },
    builderVisualization: {
      ...activeTestSession().builderVisualization,
      xColumn: null,
      valueColumn: null,
      aggregation: 'count',
      seriesColumn: null,
      seriesColumns: []
    }
  })
  render(<BuilderPanel />)
}

afterEach(() => {
  cleanup()
  resetTestStore()
})

it('filters schemas case-insensitively, selects a match, and reports no matches', () => {
  arrange()

  fireEvent.click(screen.getByRole('combobox', { name: /Schema: Select a schema/ }))
  const search = screen.getByRole('textbox', { name: /Search Schema/ })
  fireEvent.change(search, { target: { value: 'ANALYT' } })

  expect(screen.getByRole('option', { name: /analytics, schema/ })).toBeTruthy()
  expect(screen.queryByRole('option', { name: /demo_shop/ })).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: /analytics, schema/ }))
  expect(screen.getByRole('combobox', { name: /Schema: analytics/ })).toBeTruthy()

  fireEvent.click(screen.getByRole('combobox', { name: /Schema: analytics/ }))
  fireEvent.change(screen.getByRole('textbox', { name: /Search Schema/ }), { target: { value: 'missing' } })
  expect(screen.getByText('No matching schemas')).toBeTruthy()
})
