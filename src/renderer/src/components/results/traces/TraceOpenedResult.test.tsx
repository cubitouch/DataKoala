import type { ComponentProps } from 'react'
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { TraceRow } from '../../../lib/traceViewer'
import { MAX_RENDERED_SPANS } from './TraceWaterfall'
import { TraceOpenedResult } from './TraceOpenedResult'

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
    const manySpans = Array.from({ length: MAX_RENDERED_SPANS + 1 }, (_, index) => ({ ...root, spanId: `span-${index}`, parentSpanId: '' }))
    const view = renderResult({ spans: manySpans })
    expect(screen.getByText(`Showing the first ${MAX_RENDERED_SPANS} visible spans.`)).toBeTruthy()
    view.rerender(<TraceOpenedResult spans={manySpans.slice(0, MAX_RENDERED_SPANS)} selectedSpanId="" collapsed={new Set()} hiddenSpanKinds={new Set()} hideAsyncBranches={false} compressIdleGaps={false} showBackToResults {...view.callbacks} />)
    expect(screen.queryByText(`Showing the first ${MAX_RENDERED_SPANS} visible spans.`)).toBeNull()
  })
})
