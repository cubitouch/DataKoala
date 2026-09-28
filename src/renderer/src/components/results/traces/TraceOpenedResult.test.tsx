import type { ComponentProps } from 'react'
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { TraceRow } from '@lib/traceViewer'
import { MAX_RENDERED_SPANS } from './TraceWaterfall'
import { renderedSpanLimitWarning, TraceOpenedResult } from './TraceOpenedResult'

afterEach(cleanup)

const root: TraceRow = { traceId: 'trace-42', spanId: 'root', parentSpanId: '', service: 'checkout', name: 'POST /orders', kind: 'SERVER', status: 'OK', startTimeMs: 100, durationMs: 1000 }
const client: TraceRow = { traceId: 'trace-42', spanId: 'client', parentSpanId: 'root', service: 'payments', name: 'charge', kind: 'CLIENT', status: 'ERROR', startTimeMs: 200, durationMs: 200 }
const producer: TraceRow = { traceId: 'trace-42', spanId: 'producer', parentSpanId: 'root', service: 'checkout', name: 'publish', kind: 'PRODUCER', status: 'OK', startTimeMs: 500, durationMs: 50 }
const asyncChild: TraceRow = { traceId: 'trace-42', spanId: 'consumer', parentSpanId: 'producer', service: 'worker', name: 'consume', kind: 'CONSUMER', status: 'OK', startTimeMs: 600, durationMs: 1500 }
const spans = [client, asyncChild, root, producer]

function renderResult(overrides: Partial<ComponentProps<typeof TraceOpenedResult>> = {}) {
  const callbacks = {
    onSelectSpan: vi.fn(), onToggleCollapsed: vi.fn(), onToggleSpanKind: vi.fn(), onToggleAsyncBranches: vi.fn(),
    onToggleIdleCompression: vi.fn(), onShowAllKinds: vi.fn(), onBackToResults: vi.fn(), onExploreSimilar: vi.fn()
  }
  const view = render(<TraceOpenedResult spans={spans} selectedSpanId="" collapsed={new Set()} hiddenSpanKinds={new Set()}
    hideAsyncBranches={false} compressIdleGaps={false} showBackToResults {...callbacks} {...overrides} />)
  return { ...view, callbacks }
}

describe('TraceOpenedResult', () => {
  it('derives trace identity and summary values from unsorted raw spans', () => {
    renderResult()
    expect(screen.getByRole('heading', { name: 'checkout · POST /orders' })).toBeTruthy()
    expect(screen.getByText('trace-42')).toBeTruthy()
    expect(within(screen.getByText('Duration').parentElement!).getByText('2.00s')).toBeTruthy()
    expect(within(screen.getByText('Spans').parentElement!).getByText('4')).toBeTruthy()
    expect(screen.getByText('3', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByText('1', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Server 1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Consumer 1/i })).toBeTruthy()
  })

  it('opens only the selected visible span in the inspector and controls closing', () => {
    const selected = renderResult({ selectedSpanId: 'client' })
    const inspector = screen.getByRole('complementary', { name: 'Selected span details' })
    expect(within(inspector).getByText('payments')).toBeTruthy()
    expect(within(inspector).getByText('charge')).toBeTruthy()
    fireEvent.click(within(inspector).getByRole('button', { name: 'Close span details' }))
    expect(selected.callbacks.onSelectSpan).toHaveBeenCalledWith('')
    selected.rerender(<TraceOpenedResult spans={spans} selectedSpanId="" collapsed={new Set()} hiddenSpanKinds={new Set()} hideAsyncBranches={false} compressIdleGaps={false} showBackToResults {...selected.callbacks} />)
    expect(screen.queryByRole('complementary', { name: 'Selected span details' })).toBeNull()
  })

  it('derives visible counts from kind and async branch filters', () => {
    const view = renderResult({ hiddenSpanKinds: new Set(['CLIENT']) })
    expect(screen.getByText('3/4')).toBeTruthy()
    view.rerender(<TraceOpenedResult spans={spans} selectedSpanId="" collapsed={new Set()} hiddenSpanKinds={new Set()} hideAsyncBranches compressIdleGaps={false} showBackToResults {...view.callbacks} />)
    expect(screen.getByText('2/4')).toBeTruthy()
    expect(screen.getByText('2/4 shown · 2 async-branch spans hidden.')).toBeTruthy()
  })

  it('uses the selected span for Explore similar and otherwise the root span', () => {
    const selected = renderResult({ selectedSpanId: 'client' })
    fireEvent.click(screen.getByRole('button', { name: 'Explore similar traces' }))
    expect(selected.callbacks.onExploreSimilar).toHaveBeenCalledWith(client)
    selected.unmount()
    const fallback = renderResult()
    fireEvent.click(screen.getByRole('button', { name: 'Explore similar traces' }))
    expect(fallback.callbacks.onExploreSimilar).toHaveBeenCalledWith(root)
  })

  it('forwards back, waterfall selection, and collapse actions', () => {
    const { callbacks } = renderResult()
    fireEvent.click(screen.getByRole('button', { name: '← Search results' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse POST /orders' }))
    fireEvent.click(screen.getByRole('button', { name: 'payments charge' }))
    expect(callbacks.onBackToResults).toHaveBeenCalledOnce()
    expect(callbacks.onToggleCollapsed).toHaveBeenCalledWith('root')
    expect(callbacks.onSelectSpan).toHaveBeenCalledWith('client')
  })

  it('shows the existing cap warning only above the rendered-span limit', () => {
    expect(renderedSpanLimitWarning(MAX_RENDERED_SPANS)).toBeNull()
    expect(renderedSpanLimitWarning(MAX_RENDERED_SPANS + 1)).toBe(`Showing the first ${MAX_RENDERED_SPANS} visible spans.`)
  })
})
it('reveals and highlights matches under collapsed ancestors and restores collapse on clear', () => {
  const { container, callbacks } = renderResult({ collapsed: new Set(['root']), selectedSpanId: 'client' })
  const input = screen.getByRole('textbox', { name: 'Search trace spans' })
  expect(container.querySelectorAll('[data-span-id]')).toHaveLength(1)
  fireEvent.change(input, { target: { value: 'PAY' } })
  expect(Array.from(container.querySelectorAll('[data-span-id]'), (row) => row.getAttribute('data-span-id'))).toEqual(['root', 'client'])
  expect(screen.getByRole('status').textContent).toContain('1 matching spans · 2 shown with ancestors')
  const match = container.querySelector('[data-span-id="client"]')!
  expect(match.getAttribute('data-search-match')).toBe('true')
  expect(match.querySelector('mark')?.textContent).toBe('pay')
  expect(screen.getByRole('button', { name: 'Collapse POST /orders' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('complementary').querySelector('mark')?.textContent).toBe('pay')
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(container.querySelectorAll('[data-span-id]')).toHaveLength(1)
  expect(container.querySelectorAll('mark')).toHaveLength(0)
  expect(callbacks.onToggleCollapsed).not.toHaveBeenCalled()
  expect(callbacks.onSelectSpan).not.toHaveBeenCalled()
})

it('highlights repeated attribute matches, opens attribute groups, and handles no matches', () => {
  const detailed = { ...client, attributes: JSON.stringify({ custom: 'A word in a wordier sentence' }), resourceAttributes: { 'service.namespace': 'production' } }
  const { container } = renderResult({ spans: [root, detailed, producer], selectedSpanId: 'client' })
  const input = screen.getByRole('textbox', { name: 'Search trace spans' })
  fireEvent.change(input, { target: { value: 'a word' } })
  const inspector = screen.getByRole('complementary')
  expect(Array.from(inspector.querySelectorAll('dd mark'), (mark) => mark.textContent)).toEqual(['A word', 'a word'])
  expect(within(inspector).getByText('Attributes', { selector: 'summary' }).parentElement?.hasAttribute('open')).toBe(true)
  fireEvent.change(input, { target: { value: 'production' } })
  expect(inspector.querySelector('dd mark')?.textContent).toBe('production')
  fireEvent.change(input, { target: { value: 'not found' } })
  expect(screen.getByText('No spans match the current trace filters.')).toBeTruthy()
  expect(screen.queryByRole('complementary')).toBeNull()
  fireEvent.change(input, { target: { value: '' } })
  expect(container.querySelectorAll('[data-span-id]')).toHaveLength(3)
  expect(container.querySelectorAll('mark')).toHaveLength(0)
})

it('keeps kind and async filters applied during search and resets search for a different trace', () => {
  const view = renderResult({ hiddenSpanKinds: new Set(['CLIENT']), hideAsyncBranches: true })
  const input = screen.getByRole('textbox', { name: 'Search trace spans' })
  fireEvent.change(input, { target: { value: 'payments' } })
  expect(screen.getByRole('status').textContent).toContain('0 matching spans')
  fireEvent.change(input, { target: { value: 'worker' } })
  expect(screen.getByRole('status').textContent).toContain('0 matching spans')
  view.rerender(<TraceOpenedResult spans={[{ ...root, traceId: 'another-trace' }]} selectedSpanId="" collapsed={new Set()} hiddenSpanKinds={new Set()} hideAsyncBranches={false} compressIdleGaps={false} showBackToResults {...view.callbacks} />)
  expect((input as HTMLInputElement).value).toBe('')
  expect(screen.getByRole('button', { name: 'checkout POST /orders' })).toBeTruthy()
})
