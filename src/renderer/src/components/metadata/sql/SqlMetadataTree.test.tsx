import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSchemaNode } from '@shared/types'
import { SqlMetadataTree } from './SqlMetadataTree'

afterEach(cleanup)

const schemas: DatabaseSchemaNode[] = [{
  name: 'internal', isSystem: true, relations: [{
    schema: 'internal', name: 'orders', qualifiedName: 'internal.orders', kind: 'r', columnsStatus: 'loaded',
    columns: [{ name: 'created_at', dataTypeName: 'timestamp' }]
  }]
}]

describe('SqlMetadataTree', () => {
  it('adapts schema, relation, and column presentation', () => {
    render(<SqlMetadataTree schemas={schemas} expanded={new Set(['schema:internal', 'relation:internal.orders'])} filter=""
      selectedRelation={{ schema: 'internal', name: 'orders' }} onToggleSchema={vi.fn()} onToggleRelation={vi.fn()} onActivateRelation={vi.fn()} onRetryRelation={vi.fn()} />)
    expect(screen.getByText('system')).toBeTruthy()
    expect(screen.getByText('table')).toBeTruthy()
    expect(screen.getByText('timestamp')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select internal.orders for Builder' }).getAttribute('aria-current')).toBe('true')
  })

  it('routes relation toggles, activation, and retry to the SQL callbacks', () => {
    const relation = { ...schemas[0].relations[0], columns: undefined, columnsStatus: 'error' as const }
    const onToggleSchema = vi.fn(); const onToggleRelation = vi.fn(); const onActivateRelation = vi.fn(); const onRetryRelation = vi.fn()
    render(<SqlMetadataTree schemas={[{ ...schemas[0], relations: [relation] }]} expanded={new Set(['schema:internal', 'relation:internal.orders'])} filter=""
      onToggleSchema={onToggleSchema} onToggleRelation={onToggleRelation} onActivateRelation={onActivateRelation} onRetryRelation={onRetryRelation} />)
    fireEvent.click(screen.getByRole('button', { name: 'internal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse orders' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select internal.orders for Builder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Could not load columns — retry' }))
    expect(onToggleSchema).toHaveBeenCalledWith('schema:internal')
    expect(onToggleRelation).toHaveBeenCalledWith(relation)
    expect(onActivateRelation).toHaveBeenCalledWith(relation)
    expect(onRetryRelation).toHaveBeenCalledWith(relation)
  })
})
