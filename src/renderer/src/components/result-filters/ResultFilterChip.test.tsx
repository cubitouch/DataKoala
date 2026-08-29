// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResultFilter, stableResultFilterId, type ResultFilter } from '../../lib/resultFilters'
import { ResultFilterChip } from './ResultFilterChip'

const promoted = (): ResultFilter => {
  const value = { ...createResultFilter('series', 'equals', 'PUBSUB'), execution: 'query' as const, provenance: { mode: 'builder' as const, targetKind: 'source-column' as const, resultAlias: 'series' as const, table: { schema: 'public', name: 'events' }, sourceKind: 'single-column' as const, sourceColumn: 'status', sourceColumns: ['status'], displayLabel: 'status', timeColumn: 'created_at', timeBucket: 'day' } }
  return { ...value, id: stableResultFilterId(value) }
}

afterEach(cleanup)

describe('ResultFilterChip promoted source semantics', () => {
  it('identifies the source column and disables unsafe demotion with accessible explanation', () => {
    const filter = promoted(); render(<ResultFilterChip filter={filter} onRemove={vi.fn()} onToggleExecution={vi.fn()} demotion={{ allowed: false, reason: 'Result does not contain status.' }}/>)
    expect(screen.getByText('status = “PUBSUB”')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Move to client' }) as HTMLButtonElement
    expect(button.disabled).toBe(true); expect(button.title).toBe('Result does not contain status.')
    expect(screen.getByText('Result does not contain status.')).toBeTruthy()
  })
  it('enables safe demotion', () => {
    render(<ResultFilterChip filter={promoted()} onRemove={vi.fn()} onToggleExecution={vi.fn()} demotion={{ allowed: true }}/>)
    expect((screen.getByRole('button', { name: 'Move to client' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
