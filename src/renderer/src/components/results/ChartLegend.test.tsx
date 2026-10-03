import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ChartLegend } from './ChartLegend'
import { chartLegendEntries } from '@lib/chartLegend'
import {
  isolateSeries,
  showAllSeries,
  toggleSeries,
} from '@lib/chartVisibility'

afterEach(cleanup)
const names = Array.from(
  { length: 25 },
  (_, i) => `service-${i}-with-a-long-label-to-preserve`,
)

test('native legend preserves full accessible labels, visibility, modifiers and keyboard-accessible isolation', () => {
  function Harness() {
    const [visibility, setVisibility] = useState<Record<string, boolean>>({})
    return (
      <>
        <ChartLegend
          series={chartLegendEntries(names)}
          visibility={visibility}
          onToggle={(id) => setVisibility(toggleSeries(visibility, id))}
          onIsolate={(id) =>
            setVisibility(isolateSeries(visibility, names, id))
          }
        />
        <button onClick={() => setVisibility(showAllSeries(names))}>
          Show all
        </button>
      </>
    )
  }
  render(<Harness />)
  const first = screen.getByRole('button', { name: names[0] })
  const last = screen.getByRole('button', { name: names[24] })
  fireEvent.mouseEnter(first)
  expect(screen.getByRole('tooltip').textContent).toBe(names[0])
  fireEvent.mouseLeave(first)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.focus(first)
  expect(screen.getByRole('tooltip').textContent).toBe(names[0])
  fireEvent.blur(first)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.click(first)
  expect(first.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(last, { shiftKey: true })
  expect(first.getAttribute('aria-pressed')).toBe('false')
  expect(last.getAttribute('aria-pressed')).toBe('true')
  const isolate = screen.getByRole('button', { name: `Isolate ${names[0]}` })
  isolate.focus()
  expect(document.activeElement).toBe(isolate)
  fireEvent.click(isolate) // Native button activation is available to Enter/Space as well as pointer.
  expect(first.getAttribute('aria-pressed')).toBe('true')
  expect(last.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
  expect(last.getAttribute('aria-pressed')).toBe('true')
})

test('scrolling has no selection side effects and single series has no legend', () => {
  const onToggle = vi.fn(),
    onIsolate = vi.fn()
  const props = {
    series: chartLegendEntries(names),
    visibility: {},
    onToggle,
    onIsolate,
  }
  const view = render(<ChartLegend {...props} />)
  const legend = screen.getByRole('group', { name: 'Chart legend' })
  fireEvent.scroll(legend, { target: { scrollTop: 200 } })
  fireEvent.wheel(legend, { deltaY: 100 })
  expect(onToggle).not.toHaveBeenCalled()
  expect(onIsolate).not.toHaveBeenCalled()
  view.rerender(<ChartLegend {...props} series={props.series.slice(0, 1)} />)
  expect(screen.queryByRole('group')).toBeNull()
})
