// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('@lib/api', () => ({ api: { clipboardImage: vi.fn(), export: { saveBinary: vi.fn() } } }))

import { GenericResultExplorer, type GenericResultExplorerProps } from './GenericResultExplorer'
import { createResultFilter } from '@lib/resultFilters'
import type { VisualizationConfiguration } from '@lib/resultVisualization'
import type { QueryResult } from '@shared/types'

const result: QueryResult = {
  columns: [
    { name: 'category', dataTypeID: 0, dataTypeName: 'text' },
    { name: 'value', dataTypeID: 0, dataTypeName: 'integer' }
  ],
  rows: [{ category: 'A', value: 2 }], rowCount: 1, durationMs: 3
}
const configuration: VisualizationConfiguration = { view: 'table', xColumn: 'category', valueColumn: 'value', aggregation: 'sum', seriesColumn: null, seriesColumns: [], valueAxisScale: 'linear' }
const props = (overrides: Partial<GenericResultExplorerProps> = {}): GenericResultExplorerProps => ({
  mode: 'sql', result, resultRevision: 1, running: false, error: null, isResultStale: false,
  configuration, seriesVisibility: {}, activeFilters: [], onConfigurationChange: vi.fn(),
  onSeriesVisibilityChange: vi.fn(), onAddFilter: vi.fn(), onRemoveFilter: vi.fn(), onClearFilters: vi.fn(),
  ...overrides
})

afterEach(cleanup)

describe('GenericResultExplorer controlled presentation', () => {
  it('shows the initial empty state without a session', () => {
    render(<GenericResultExplorer {...props({ hasRun: false, result: null })} />)
    expect(screen.getByText('Run a query to view its results.')).toBeTruthy()
  })

  it('renders controlled errors and stale reconnect state', () => {
    const onReconnect = vi.fn()
    render(<GenericResultExplorer {...props({ error: 'query failed', isResultStale: true, onReconnect })} />)
    expect(screen.getByRole('status').textContent).toContain('showing results from the last successful query')
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnect).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain('query failed')
  })

  it('emits a complete next configuration when chart type changes', () => {
    const onConfigurationChange = vi.fn()
    render(<GenericResultExplorer {...props({ onConfigurationChange })} />)
    expect(screen.queryByRole('button', { name: 'Patterns' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Bar' }))
    expect(onConfigurationChange).toHaveBeenCalledWith({ ...configuration, view: 'bar' })
  })

  it('wires table and chart promotion predicates independently', () => {
    const filter = createResultFilter('category', 'equals', 'A')
    const canPromoteTableFilter = vi.fn(() => true)
    const canPromoteChartFilter = vi.fn(() => false)
    const shared = { mode: 'builder' as const, activeFilters: [filter], onToggleFilterExecution: vi.fn(), canPromoteTableFilter, canPromoteChartFilter }

    const table = render(<GenericResultExplorer {...props({ ...shared })} />)
    expect(screen.getByRole('button', { name: 'Apply to SQL' })).toBeTruthy()
    expect(canPromoteTableFilter).toHaveBeenCalledWith(filter)
    expect(canPromoteChartFilter).not.toHaveBeenCalled()
    table.unmount()

    render(<GenericResultExplorer {...props({ ...shared, configuration: { ...configuration, view: 'bar' } })} />)
    expect(screen.queryByRole('button', { name: 'Apply to SQL' })).toBeNull()
    expect(canPromoteChartFilter).toHaveBeenCalledWith(filter)
  })

  it('renders the controlled result in the table branch', () => {
    render(<GenericResultExplorer {...props()} />)
    expect(screen.getByText('category')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
  })
})