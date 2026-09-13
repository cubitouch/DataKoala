import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TraceResultHeader } from './TraceResultHeader'

afterEach(cleanup)

function renderHeader(overrides: Partial<React.ComponentProps<typeof TraceResultHeader>> = {}) {
  const callbacks = {
    onBackToResults: vi.fn(), onExploreSimilar: vi.fn(), onToggleSpanKind: vi.fn(),
    onToggleAsyncBranches: vi.fn(), onToggleIdleCompression: vi.fn(), onShowAllKinds: vi.fn()
  }
  render(<TraceResultHeader traceId="4bf92f" service="checkout" operation="POST /orders" durationMs={1250}
    visibleSpanCount={7} totalSpanCount={10} serviceCount={3} errorCount={2}
    spanKinds={['SERVER', 'INTERNAL']} spanKindCounts={{ SERVER: 4, INTERNAL: 6 }} hiddenSpanKinds={new Set(['INTERNAL'])}
    hideAsyncBranches asyncPrunedCount={3} hasAsyncKinds compressIdleGaps showBackToResults {...callbacks} {...overrides} />)
  return callbacks
}

describe('TraceResultHeader', () => {
  it('renders trace identity, summaries, counts, and controlled span-kind state', () => {
    renderHeader()
    expect(screen.getByRole('heading', { name: 'checkout · POST /orders' })).toBeTruthy()
    expect(screen.getByText('4bf92f')).toBeTruthy()
    const summary = screen.getByText('Duration').parentElement!
    expect(within(summary).getByText('1.25s')).toBeTruthy()
    expect(screen.getByText('7/10')).toBeTruthy()
    expect(screen.getByText('3', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByText('2', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Server 4/i }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Internal \/ code 6/i }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('7/10 shown · 3 async-branch spans hidden.')).toBeTruthy()
  })

  it('forwards every presentation action', () => {
    const callbacks = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: '← Search results' }))
    fireEvent.click(screen.getByRole('button', { name: 'Explore similar traces' }))
    fireEvent.click(screen.getByRole('button', { name: /Internal \/ code 6/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Show async branches' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use wall-clock scale' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show all kinds' }))
    expect(callbacks.onBackToResults).toHaveBeenCalledOnce()
    expect(callbacks.onExploreSimilar).toHaveBeenCalledOnce()
    expect(callbacks.onToggleSpanKind).toHaveBeenCalledWith('INTERNAL')
    expect(callbacks.onToggleAsyncBranches).toHaveBeenCalledOnce()
    expect(callbacks.onToggleIdleCompression).toHaveBeenCalledOnce()
    expect(callbacks.onShowAllKinds).toHaveBeenCalledOnce()
  })

  it('reflects alternate toggle labels and omits Back when no search results exist', () => {
    renderHeader({ showBackToResults: false, hideAsyncBranches: false, compressIdleGaps: false, hiddenSpanKinds: new Set() })
    expect(screen.queryByRole('button', { name: '← Search results' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hide async branches' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compress idle gaps' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show all kinds' })).toBeNull()
  })
})
