import React from 'react'
void React
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MetadataTree, type MetadataTreeNode } from './MetadataTree'

afterEach(cleanup)

const nodes: MetadataTreeNode[] = [{
  id: 'parent', label: 'Parent', expandable: true, expanded: true, activatable: true,
  children: [{ id: 'child', label: 'Child', secondaryText: 'special type', activatable: true }]
}]

describe('MetadataTree', () => {
  it('renders nested nodes recursively and hides descendants when controlled closed', () => {
    const { rerender } = render(<MetadataTree ariaLabel="Things" nodes={nodes} />)
    expect(screen.getByRole('tree', { name: 'Things' })).toBeTruthy()
    expect(screen.getByText('Child')).toBeTruthy()
    rerender(<MetadataTree ariaLabel="Things" nodes={[{ ...nodes[0], expanded: false }]} />)
    expect(screen.queryByText('Child')).toBeNull()
  })

  it('surfaces toggle and activation callbacks', () => {
    const onToggle = vi.fn()
    const onActivate = vi.fn()
    render(<MetadataTree ariaLabel="Things" nodes={nodes} onToggle={onToggle} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Parent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Child' }))
    expect(onToggle).toHaveBeenCalledWith(nodes[0])
    expect(onActivate).toHaveBeenCalledWith(nodes[0].children![0])
  })

  it('keeps matching ancestors visible while filtering without changing controlled expansion', () => {
    const { rerender } = render(<MetadataTree ariaLabel="Things" nodes={[{ ...nodes[0], expanded: false }]} filter="special" />)
    expect(screen.getByText('Parent')).toBeTruthy()
    expect(screen.getByText('Child')).toBeTruthy()
    rerender(<MetadataTree ariaLabel="Things" nodes={[{ ...nodes[0], expanded: false }]} filter="" />)
    expect(screen.queryByText('Child')).toBeNull()
  })

  it('renders loading and error states and surfaces retry', () => {
    const onRetry = vi.fn()
    const statusNodes: MetadataTreeNode[] = [
      { id: 'loading', label: 'Loading parent', expandable: true, expanded: true, status: 'loading', statusText: 'Loading children…' },
      { id: 'error', label: 'Error parent', expandable: true, expanded: true, status: 'error', statusText: 'Failed — retry' }
    ]
    render(<MetadataTree ariaLabel="Things" nodes={statusNodes} onRetry={onRetry} />)
    expect(screen.getByRole('status').textContent).toBe('Loading children…')
    fireEvent.click(screen.getByRole('button', { name: 'Failed — retry' }))
    expect(onRetry).toHaveBeenCalledWith(statusNodes[1])
  })
})
