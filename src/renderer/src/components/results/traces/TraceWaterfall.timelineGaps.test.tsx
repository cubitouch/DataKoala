import React from 'react'
void React
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineGapOverlay, TraceWaterfall, type TraceWaterfallProps } from './TraceWaterfall'

describe('TimelineGapOverlay', () => {
  afterEach(cleanup)

  it('renders one global marker per compressed timeline gap', () => {
    const gaps = Array.from({ length: 4 }, (_, index) => ({
      key: String(index),
      left: index * 20,
      width: 1,
      durationMs: 1_000
    }))
    const { container } = render(<TimelineGapOverlay gaps={gaps} />)

    expect(container.querySelectorAll('[data-trace-idle-gap]')).toHaveLength(4)
  })

  it('renders no markers for a wall-clock timeline', () => {
    const { container } = render(<TimelineGapOverlay gaps={[]} />)

    expect(container.querySelectorAll('[data-trace-idle-gap]')).toHaveLength(0)
  })
})

const root = { spanId: 'root', parentSpanId: '', service: 'api', name: 'request', startTimeMs: 0, durationMs: 100, status: 'OK' }
const child = { spanId: 'child', parentSpanId: 'root', service: 'db', name: 'query', startTimeMs: 20, durationMs: 40, status: 'ERROR' }

function waterfallProps(overrides: Partial<TraceWaterfallProps> = {}): TraceWaterfallProps {
  return {
    visibleTree: [
      { row: root, id: 'root', depth: 0, hasChildren: true },
      { row: child, id: 'child', depth: 1, hasChildren: false }
    ],
    timelineSpans: [root, child],
    selectedSpanId: 'child',
    collapsed: new Set(),
    filteredSpanCount: 2,
    totalSpanCount: 2,
    traceStart: 0,
    traceDuration: 100,
    compressIdleGaps: false,
    hasInspector: true,
    onSelectSpan: vi.fn(),
    onToggleCollapse: vi.fn(),
    ...overrides
  }
}

describe('TraceWaterfall', () => {
  afterEach(cleanup)

  it('selects spans from both their identity and timeline controls', () => {
    const props = waterfallProps()
    const { getByRole } = render(<TraceWaterfall {...props} />)

    fireEvent.click(getByRole('button', { name: /^api request$/i }))
    fireEvent.click(getByRole('button', { name: /select db query/i }))
    expect(props.onSelectSpan).toHaveBeenNthCalledWith(1, 'root')
    expect(props.onSelectSpan).toHaveBeenNthCalledWith(2, 'child')
  })

  it('represents selection and delegates caret toggles', () => {
    const props = waterfallProps()
    const { container, getByRole } = render(<TraceWaterfall {...props} />)

    expect(container.querySelector('[data-span-id="child"]')?.className).toContain('selected')
    fireEvent.click(getByRole('button', { name: 'Collapse request' }))
    expect(props.onToggleCollapse).toHaveBeenCalledWith('root')
  })

  it('preserves the filtered-empty state', () => {
    const { getByText, container } = render(<TraceWaterfall {...waterfallProps({ visibleTree: [], timelineSpans: [], filteredSpanCount: 0 })} />)

    expect(getByText('No spans match the current trace filters.')).toBeTruthy()
    expect(container.querySelector('[data-trace-waterfall]')?.getAttribute('data-visual-items')).toBe('0')
  })

  it('caps rendering at 500 rows', () => {
    const visibleTree = Array.from({ length: 501 }, (_, index) => ({ row: { ...child, spanId: `span-${index}` }, id: `span-${index}`, depth: 0, hasChildren: false }))
    const { container } = render(<TraceWaterfall {...waterfallProps({ visibleTree, filteredSpanCount: 501, totalSpanCount: 501 })} />)

    expect(container.querySelectorAll('[data-span-id]')).toHaveLength(500)
    expect(container.querySelector('[data-trace-waterfall]')?.getAttribute('data-visual-items')).toBe('500')
  })
})
