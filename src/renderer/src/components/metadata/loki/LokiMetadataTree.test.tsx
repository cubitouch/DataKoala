import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LokiMetadataTree, visibleLokiMetadata } from './LokiMetadataTree'

afterEach(cleanup)

const callbacks = () => ({ onToggle: vi.fn(), onActivate: vi.fn(), onRetry: vi.fn() })

describe('LokiMetadataTree', () => {
  it('renders labels through MetadataTree and separates expansion from activation', () => {
    const handlers = callbacks()
    render(<LokiMetadataTree labels={['app']} expanded={new Set()} values={{}} valueStatus={{}} filter="" {...handlers} />)
    expect(screen.getByRole('tree', { name: 'Loki labels' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand app' }))
    expect(handlers.onToggle).toHaveBeenCalledWith('app')
    expect(handlers.onActivate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'app' }))
    expect(handlers.onActivate).toHaveBeenCalledWith('app')
  })

  it('renders loaded values as activatable leaves', () => {
    const handlers = callbacks()
    render(<LokiMetadataTree labels={['app']} expanded={new Set(['app'])} values={{ app: ['api'] }} valueStatus={{}} filter="" {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: 'api' }))
    expect(handlers.onActivate).toHaveBeenCalledWith('app', 'api')
  })

  it('renders loading and actionable error states', () => {
    const handlers = callbacks()
    const { rerender } = render(<LokiMetadataTree labels={['app']} expanded={new Set(['app'])} values={{}} valueStatus={{ app: 'loading' }} filter="" {...handlers} />)
    expect(screen.getByRole('status').textContent).toBe('Loading values…')
    rerender(<LokiMetadataTree labels={['app']} expanded={new Set(['app'])} values={{}} valueStatus={{ app: 'error' }} filter="" {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Could not load values — retry' }))
    expect(handlers.onRetry).toHaveBeenCalledWith('app')
  })

  it('pre-filters labels and loaded values without forcing expansion', () => {
    const handlers = callbacks()
    const { rerender } = render(<LokiMetadataTree labels={['app', 'cluster']} expanded={new Set(['app'])} values={{ app: ['api', 'worker'], cluster: ['production'] }} valueStatus={{}} filter="api" {...handlers} />)
    expect(screen.getByText('app')).toBeTruthy()
    expect(screen.getByText('api')).toBeTruthy()
    expect(screen.queryByText('worker')).toBeNull()
    expect(screen.queryByText('cluster')).toBeNull()

    rerender(<LokiMetadataTree labels={['app', 'cluster']} expanded={new Set()} values={{ app: ['api'], cluster: ['production'] }} valueStatus={{}} filter="production" {...handlers} />)
    expect(screen.getByText('cluster')).toBeTruthy()
    expect(screen.queryByText('production')).toBeNull()
    expect(screen.getByRole('treeitem', { name: /cluster/i }).getAttribute('aria-expanded')).toBe('false')
    expect(handlers.onToggle).not.toHaveBeenCalled()
  })

  it('keeps all loaded values beneath an expanded matching label', () => {
    const handlers = callbacks()
    render(<LokiMetadataTree labels={['application']} expanded={new Set(['application'])} values={{ application: ['api', 'worker'] }} valueStatus={{}} filter="app" {...handlers} />)
    expect(screen.getByText('api')).toBeTruthy()
    expect(screen.getByText('worker')).toBeTruthy()
  })

  it('disables expansion, activation, and retry with native controls', () => {
    const handlers = callbacks()
    render(<LokiMetadataTree labels={['app']} expanded={new Set(['app'])} values={{ app: ['api'] }} valueStatus={{ app: 'error' }} filter="" disabled {...handlers} />)
    for (const button of screen.getAllByRole('button')) expect(button.hasAttribute('disabled')).toBe(true)
    screen.getAllByRole('button').forEach((button) => fireEvent.click(button))
    expect(handlers.onToggle).not.toHaveBeenCalled()
    expect(handlers.onActivate).not.toHaveBeenCalled()
    expect(handlers.onRetry).not.toHaveBeenCalled()
  })

  it('deduplicates, sorts, and removes empty and internal metadata', () => {
    expect(visibleLokiMetadata(['z', '', '__name__', 'a', 'z'])).toEqual(['a', 'z'])
  })
})
