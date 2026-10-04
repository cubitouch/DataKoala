import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { ResizableDetailPanel } from './ResizableDetailPanel'

function Harness() {
  const [width, setWidth] = useState(380)
  return (
    <ResizableDetailPanel
      main={<div>Main</div>}
      detail={<div>Details</div>}
      detailLabel="Test details"
      width={width}
      onWidthChange={setWidth}
      minDetailWidth={300}
      maxDetailWidth={500}
      minMainWidth={280}
    />
  )
}

it('clamps keyboard resizing and keeps narrow containers from overflowing', () => {
  render(<Harness />)
  const split = document.querySelector(
    '[data-resizable-detail-panel]',
  ) as HTMLDivElement
  const separator = screen.getByRole('separator', {
    name: 'Resize Test details',
  })
  const detail = screen.getByRole('complementary', { name: 'Test details' })

  Object.defineProperty(split, 'clientWidth', {
    configurable: true,
    value: 700,
  })
  for (let index = 0; index < 10; index += 1)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
  expect((detail as HTMLElement).style.width).toBe('420px')

  for (let index = 0; index < 10; index += 1)
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
  expect((detail as HTMLElement).style.width).toBe('300px')

  Object.defineProperty(split, 'clientWidth', {
    configurable: true,
    value: 360,
  })
  fireEvent.keyDown(separator, { key: 'ArrowRight' })
  expect((detail as HTMLElement).style.width).toBe('160px')
})
