// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '@shared/types'
import { createResultFilter, type ResultFilter } from '../lib/resultFilters'
import { ResultsTable, type ResultsTableProps } from './ResultsTable'

vi.mock('../lib/api', () => ({ api: { export: { saveText: vi.fn() } } }))

const result: QueryResult = {
  columns: [{ name: 'status', dataTypeID: 25, dataTypeName: 'text', nativeType: 'varchar' }],
  rows: [{ status: 'ready' }],
  rowCount: 1,
  durationMs: 2
}

function renderTable(overrides: Partial<ResultsTableProps> = {}) {
  const props: ResultsTableProps = {
    mode: 'sql',
    rawResult: result,
    filteredResult: { ...result, originalRowCount: 1, filteredRowCount: 1 },
    activeFilters: [],
    running: false,
    error: null,
    onAddFilter: vi.fn(),
    onRemoveFilter: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides
  }
  return { ...render(<ResultsTable {...props} />), props }
}

afterEach(cleanup)

describe('ResultsTable controlled session state', () => {
  it('renders running, error, and empty states from props', () => {
    const view = renderTable({ running: true })
    expect(screen.getByText('Running query…')).toBeTruthy()
    view.rerender(<ResultsTable {...view.props} running={false} error="Query failed" />)
    expect(screen.getByRole('alert').textContent).toBe('Query failed')
    view.rerender(<ResultsTable {...view.props} running={false} error={null} rawResult={null} filteredResult={null} />)
    expect(screen.getByText('Run a query to see results.')).toBeTruthy()
  })

  it.each([
    ['Filter to this value', 'equals'],
    ['Exclude this value', 'notEquals']
  ] as const)('sends the generated filter through onAddFilter for %s', (button, operator) => {
    const onAddFilter = vi.fn()
    renderTable({ onAddFilter })
    fireEvent.click(screen.getByLabelText('Filter actions for status'))
    fireEvent.click(screen.getByRole('button', { name: button }))
    expect(onAddFilter).toHaveBeenCalledWith(expect.objectContaining({ column: 'status', operator, value: 'ready', nativeType: 'varchar' }))
  })

  it('delegates remove and clear operations', () => {
    const filters = [createResultFilter('status', 'equals', 'ready'), createResultFilter('status', 'notEquals', 'failed')]
    const onRemoveFilter = vi.fn()
    const onClearFilters = vi.fn()
    renderTable({ activeFilters: filters, onRemoveFilter, onClearFilters })
    fireEvent.click(screen.getByRole('button', { name: /Remove filter status = .*ready/ }))
    expect(onRemoveFilter).toHaveBeenCalledWith(filters[0].id)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('uses Builder execution and promotion/demotion callbacks', () => {
    const clientFilter = createResultFilter('status', 'equals', 'ready')
    const queryFilter: ResultFilter = { ...createResultFilter('status', 'notEquals', 'failed'), execution: 'query' }
    const onToggleFilterExecution = vi.fn()
    const canPromoteFilter = vi.fn((filter: ResultFilter) => filter.id === clientFilter.id)
    const canDemoteFilter = vi.fn((filter: ResultFilter) => ({ allowed: filter.id !== queryFilter.id, reason: 'Required by Builder' }))
    renderTable({ mode: 'builder', activeFilters: [clientFilter, queryFilter], onToggleFilterExecution, canPromoteFilter, canDemoteFilter })

    fireEvent.click(screen.getByRole('button', { name: 'Apply to SQL' }))
    expect(onToggleFilterExecution).toHaveBeenCalledWith(clientFilter.id)
    const demote = screen.getByRole('button', { name: 'Move to client' })
    expect((demote as HTMLButtonElement).disabled).toBe(true)
    expect(demote.title).toBe('Required by Builder')
    expect(canPromoteFilter).toHaveBeenCalledWith(clientFilter)
    expect(canDemoteFilter).toHaveBeenCalledWith(queryFilter)
  })

  it('does not expose Builder execution controls in SQL mode', () => {
    const filter = createResultFilter('status', 'equals', 'ready')
    renderTable({ mode: 'sql', activeFilters: [filter] })
    expect(screen.queryByRole('button', { name: 'Apply to SQL' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move to client' })).toBeNull()
  })
})
