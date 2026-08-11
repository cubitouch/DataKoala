import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('../lib/api', () => ({ api: { connections: { connect: vi.fn() } } }))

import { ResultExplorer } from './ResultExplorer'
import { createResultFilter } from '../lib/resultFilters'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'
import type { QueryResult } from '@shared/types'

Element.prototype.scrollIntoView = vi.fn()

const result: QueryResult = {
  columns: [
    { name: 'created_at', dataTypeID: 0, dataTypeName: 'timestamp with time zone' },
    { name: 'revenue', dataTypeID: 0, dataTypeName: 'numeric' },
    { name: 'duration_ms', dataTypeID: 0, dataTypeName: 'integer' },
    { name: 'region', dataTypeID: 0, dataTypeName: 'text' },
    ...Array.from({ length: 12 }, (_, i) => ({ name: `extra_${i}`, dataTypeID: 0, dataTypeName: 'text' }))
  ],
  rows: [
    { created_at: '2026-01-01', revenue: 10, duration_ms: 5, region: 'West', extra_0: 'mobile' },
    { created_at: '2026-01-02', revenue: 0, duration_ms: 6, region: 'East', extra_0: 'desktop' }
  ],
  rowCount: 2,
  durationMs: 12
}

const arrange = (patch: Parameters<typeof patchActiveTestSession>[0] = {}) => {
  resetTestStore({ connected: true, connectionStatus: 'connected' })
  patchActiveTestSession({
    result,
    resultRevision: 1,
    sqlVisualization: { view: 'line', xColumn: 'created_at', valueColumn: 'revenue', aggregation: 'sum', seriesColumn: null, seriesColumns: [], valueAxisScale: 'linear' },
    sqlResultFilters: [],
    running: false,
    queryError: null,
    isResultStale: false,
    ...patch
  })
  return render(<ResultExplorer mode="sql" />)
}

afterEach(() => { cleanup(); resetTestStore() })

describe('ResultExplorer chart combobox controls', () => {
  it('uses only X axis, Y axis and Series for SQL chart configuration', () => {
    const view = arrange()
    for (const label of ['X axis', 'Y axis', 'Series columns', 'Value axis scale']) expect(view.container.querySelector(`select[aria-label="${label}"]`)).toBeNull()
    expect(screen.queryByRole('combobox', { name: /Aggregation/ })).toBeNull()
    expect(screen.getByRole('combobox', { name: /X axis/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Y axis/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Series columns/ })).toBeTruthy()
  })

  it('updates X axis, Y axis, and multiple Series through comboboxes', () => {
    arrange()
    fireEvent.click(screen.getByRole('combobox', { name: /X axis: created_at/ }))
    fireEvent.change(screen.getByRole('textbox', { name: /Search X axis/ }), { target: { value: 'extra_11' } })
    fireEvent.click(screen.getByRole('option', { name: /extra_11, text/ }))
    expect(activeTestSession().sqlVisualization.xColumn).toBe('extra_11')

    fireEvent.click(screen.getByRole('combobox', { name: /Y axis: revenue/ }))
    fireEvent.click(screen.getByRole('option', { name: /duration_ms, integer/ }))
    expect(activeTestSession().sqlVisualization.valueColumn).toBe('duration_ms')

    fireEvent.click(screen.getByRole('combobox', { name: /Series columns: No breakdown/ }))
    fireEvent.click(screen.getByRole('option', { name: /region, text/ }))
    expect(activeTestSession().sqlVisualization.seriesColumn).toBe('region')
    expect(activeTestSession().sqlVisualization.seriesColumns).toEqual([])

    fireEvent.click(screen.getByRole('option', { name: /extra_0, text/ }))
    expect(activeTestSession().sqlVisualization.seriesColumn).toBeNull()
    expect(activeTestSession().sqlVisualization.seriesColumns).toEqual(['region', 'extra_0'])

    fireEvent.click(screen.getByRole('option', { name: /region, text/ }))
    expect(activeTestSession().sqlVisualization.seriesColumn).toBe('extra_0')
    expect(activeTestSession().sqlVisualization.seriesColumns).toEqual([])
  })

  it('keeps SQL result filters client-side with no Apply to SQL action', () => {
    arrange({ sqlResultFilters: [createResultFilter('region', 'equals', 'West')] })
    expect(screen.getByText(/region =/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apply to SQL' })).toBeNull()
    expect(screen.queryByRole('button', { name: /query filter/i })).toBeNull()
  })

  it('keeps Log selectable and reports omitted non-positive values persistently', () => {
    arrange()
    fireEvent.click(screen.getByRole('combobox', { name: /Value axis scale: Linear/ }))
    const log = screen.getByRole('option', { name: 'Log' })
    expect(log.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(log)
    expect(activeTestSession().sqlVisualization.valueAxisScale).toBe('log')
    expect(screen.getByRole('status').textContent).toContain('Log scale: 1 zero or negative point is not plotted.')
  })
})
