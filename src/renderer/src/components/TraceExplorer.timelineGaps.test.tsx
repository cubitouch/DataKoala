import React from 'react'
void React
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TimelineGapOverlay } from './TraceExplorer'

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
