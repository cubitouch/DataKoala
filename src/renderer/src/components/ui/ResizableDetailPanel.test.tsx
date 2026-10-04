import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useState } from 'react'
import {
  DEFAULT_DETAIL_PANEL_WIDTH,
  ResizableDetailPanel,
} from './ResizableDetailPanel'

function Harness() {
  const [width, setWidth] = useState(DEFAULT_DETAIL_PANEL_WIDTH)
  return (
    <ResizableDetailPanel
      detailLabel="Details"
      detail={<div>Inspector</div>}
      width={width}
      onWidthChange={setWidth}
      minDetailWidth={300}
      maxDetailWidth={500}
    >
      <div>Main</div>
    </ResizableDetailPanel>
  )
}

it('resizes with the keyboard and clamps to configured bounds', () => {
  render(<Harness />)
  const separator = screen.getByRole('separator', { name: 'Resize Details' })
  const detail = document.querySelector('[data-resizable-detail]')!

  for (let index = 0; index < 10; index += 1)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
  expect(detail.getAttribute('data-detail-width')).toBe('500')

  for (let index = 0; index < 20; index += 1)
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
  expect(detail.getAttribute('data-detail-width')).toBe('300')
})
