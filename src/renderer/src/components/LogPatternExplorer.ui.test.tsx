import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const virtualizerSpies = vi.hoisted(() => ({ measure: vi.fn(), measureElement: vi.fn() }))
vi.mock('@tanstack/react-virtual', async () => {
  const React = await import('react')
  return { useVirtualizer: ({ count, getScrollElement }: { count: number; getScrollElement: () => HTMLElement | null }) => {
    const [start, setStart] = React.useState(0)
    React.useEffect(() => { const element = getScrollElement(); if (!element) return; const scroll = () => setStart(Math.min(count - 1, Math.floor(element.scrollTop / 113))); element.addEventListener('scroll', scroll); return () => element.removeEventListener('scroll', scroll) }, [count, getScrollElement])
    return { measure: virtualizerSpies.measure, measureElement: virtualizerSpies.measureElement, getTotalSize: () => count * 113, getVirtualItems: () => Array.from({ length: Math.min(12, count - start) }, (_, offset) => ({ index: start + offset, start: (start + offset) * 113 })) }
  } }
})
import { LogPatternExplorer } from './LogPatternExplorer'

afterEach(() => { cleanup(); virtualizerSpies.measure.mockClear(); virtualizerSpies.measureElement.mockClear() })
const letters = (value: number) => { let result = ''; for (let number = value; number >= 0; number = Math.floor(number / 26) - 1) result = String.fromCharCode(97 + number % 26) + result; return result }
const rows = Array.from({ length: 600 }, (_, index) => ({ id: String(index), timestampNs: String(index * 1_000_000), timestampMs: index, line: `Pattern${letters(index)} reports a distinct semantic event`, labels: {}, structuredMetadata: {}, parsedFields: {}, severity: index % 2 ? 'INFO' : 'ERROR' }))

it('virtualizes hundreds of patterns while preserving expansion, scrolling, and drill-down', async () => {
  const onViewLogs = vi.fn()
  render(<LogPatternExplorer rows={rows} onViewLogs={onViewLogs}/>)
  expect(screen.getByText('600 patterns across 600 loaded logs')).toBeTruthy()
  expect(document.querySelectorAll('[data-pattern-card]').length).toBeLessThan(30)

  const firstCard = document.querySelector('[data-pattern-card]') as HTMLElement
  const first = firstCard.querySelector('button[aria-expanded]') as HTMLButtonElement
  const viewLogs = Array.from(firstCard.querySelectorAll('button')).find((button) => /^View \d+ logs?$/.test(button.textContent ?? '')) as HTMLButtonElement
  const severity = firstCard.querySelector('[data-severity]') as HTMLElement
  expect(viewLogs).toBeTruthy()
  expect(severity.getAttribute('data-severity')).toMatch(/^(INFO|ERROR)$/)
  fireEvent.click(viewLogs)
  expect(onViewLogs).toHaveBeenCalledWith(expect.any(String), expect.any(Array))

  fireEvent.click(first)
  expect(first.getAttribute('aria-expanded')).toBe('true')
  expect(document.querySelector('[data-pattern-details]')).toBeTruthy()

  const scroller = document.querySelector('[data-pattern-scroller]') as HTMLDivElement
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 600 * 113 })
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 600 })
  scroller.scrollTop = 550 * 113
  fireEvent.scroll(scroller)
  await waitFor(() => expect(Math.max(...Array.from(document.querySelectorAll('[data-pattern-card]')).map((card) => Number(card.getAttribute('data-index'))))).toBeGreaterThan(500))
  expect(document.querySelectorAll('[data-pattern-card]').length).toBeLessThan(30)
})


it('remeasures the changed card after expand and collapse without resetting all virtual measurements', async () => {
  render(<LogPatternExplorer rows={rows.slice(0, 20)} onViewLogs={vi.fn()}/>)
  const first = document.querySelector('[data-pattern-card] button[aria-expanded]') as HTMLButtonElement
  const card = first.closest('[data-pattern-card]') as HTMLElement
  expect(card).toBeTruthy()

  const initialMeasureCalls = virtualizerSpies.measureElement.mock.calls.length
  fireEvent.click(first)
  await waitFor(() => expect(virtualizerSpies.measureElement.mock.calls.length).toBeGreaterThan(initialMeasureCalls))
  const expandedMeasureCalls = virtualizerSpies.measureElement.mock.calls.length

  fireEvent.click(first)
  await waitFor(() => expect(first.getAttribute('aria-expanded')).toBe('false'))
  await waitFor(() => expect(virtualizerSpies.measureElement.mock.calls.length).toBeGreaterThan(expandedMeasureCalls))

  expect(virtualizerSpies.measureElement).toHaveBeenCalledWith(card)
  expect(virtualizerSpies.measure).not.toHaveBeenCalled()
})
