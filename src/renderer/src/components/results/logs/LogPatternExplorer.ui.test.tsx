import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const virtualizerSpies = vi.hoisted(() => ({
  measure: vi.fn(),
  measureElement: vi.fn(),
}))
vi.mock('@tanstack/react-virtual', async () => {
  const React = await import('react')
  return {
    useVirtualizer: ({
      count,
      getScrollElement,
    }: {
      count: number
      getScrollElement: () => HTMLElement | null
    }) => {
      const [start, setStart] = React.useState(0)
      React.useEffect(() => {
        const element = getScrollElement()
        if (!element) return
        const scroll = () =>
          setStart(Math.min(count - 1, Math.floor(element.scrollTop / 58)))
        element.addEventListener('scroll', scroll)
        return () => element.removeEventListener('scroll', scroll)
      }, [count, getScrollElement])
      return {
        measure: virtualizerSpies.measure,
        measureElement: virtualizerSpies.measureElement,
        getTotalSize: () => count * 58,
        getVirtualItems: () =>
          Array.from({ length: Math.min(14, count - start) }, (_, offset) => ({
            index: start + offset,
            start: (start + offset) * 58,
          })),
      }
    },
  }
})
import { LogPatternExplorer } from './LogPatternExplorer'

afterEach(() => {
  cleanup()
  virtualizerSpies.measure.mockClear()
  virtualizerSpies.measureElement.mockClear()
})
const letters = (value: number) => {
  let result = ''
  for (let number = value; number >= 0; number = Math.floor(number / 26) - 1)
    result = String.fromCharCode(97 + (number % 26)) + result
  return result
}
const row = (id: string, line: string, severity = 'INFO') => ({
  id,
  timestampNs: String(Number(id.replace(/\D/g, '') || '1') * 1_000_000),
  timestampMs: Number(id.replace(/\D/g, '') || '1'),
  line,
  labels: {},
  structuredMetadata: {},
  parsedFields: {},
  severity,
})
const rows = Array.from({ length: 600 }, (_, index) =>
  row(
    String(index),
    `Pattern${letters(index)} reports a distinct semantic event`,
    index % 2 ? 'INFO' : 'ERROR',
  ),
)

it('renders a compact virtualized pattern list without the redundant heading', async () => {
  render(<LogPatternExplorer rows={rows} onFilterPattern={vi.fn()} />)
  expect(screen.getByText('600 patterns · 600 loaded logs')).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Patterns' })).toBeNull()
  expect(document.querySelectorAll('[data-pattern-row]').length).toBeLessThan(
    30,
  )

  const scroller = document.querySelector(
    '[data-pattern-scroller]',
  ) as HTMLDivElement
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    value: 600 * 58,
  })
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    value: 600,
  })
  scroller.scrollTop = 550 * 58
  fireEvent.scroll(scroller)
  await waitFor(() =>
    expect(
      Math.max(
        ...Array.from(document.querySelectorAll('[data-pattern-row]')).map(
          (item) => Number(item.getAttribute('data-index')),
        ),
      ),
    ).toBeGreaterThan(500),
  )
})

it('selects patterns into one resizable inspector and keeps its width', () => {
  const sample = [
    row('1', 'Request 123 completed'),
    row('2', 'Request 456 completed', 'ERROR'),
    row('3', 'Worker started normally'),
  ]
  render(<LogPatternExplorer rows={sample} onFilterPattern={vi.fn()} />)

  const request = screen.getByRole('option', {
    name: /Request.*<number>.*completed/,
  })
  fireEvent.click(request)
  expect(request.getAttribute('aria-selected')).toBe('true')
  expect(
    screen.getByRole('complementary', { name: 'Pattern details' }),
  ).toBeTruthy()
  expect(screen.getByText('Example messages')).toBeTruthy()
  expect(screen.getByText('Variable samples')).toBeTruthy()
  expect(screen.getByText('123, 456')).toBeTruthy()

  const split = document.querySelector(
    '[data-resizable-detail-panel]',
  ) as HTMLDivElement
  Object.defineProperty(split, 'clientWidth', {
    configurable: true,
    value: 1000,
  })
  fireEvent.keyDown(
    screen.getByRole('separator', { name: 'Resize Pattern details' }),
    { key: 'ArrowLeft' },
  )
  expect(
    (
      screen.getByRole('complementary', {
        name: 'Pattern details',
      }) as HTMLElement
    ).style.width,
  ).toBe('414px')

  fireEvent.click(
    screen.getByRole('option', { name: /Worker.*started.*normally/ }),
  )
  expect(screen.getByText('Worker started normally')).toBeTruthy()
  expect(
    (
      screen.getByRole('complementary', {
        name: 'Pattern details',
      }) as HTMLElement
    ).style.width,
  ).toBe('414px')

  fireEvent.click(screen.getByRole('button', { name: 'Close pattern details' }))
  expect(
    screen.queryByRole('complementary', { name: 'Pattern details' }),
  ).toBeNull()
})

it('passes the safe query candidate with the selected cluster', () => {
  const onFilterPattern = vi.fn()
  render(
    <LogPatternExplorer
      rows={[
        row('1', 'Request 123 completed'),
        row('2', 'Request 456 completed'),
      ]}
      onFilterPattern={onFilterPattern}
    />,
  )
  fireEvent.click(
    screen.getByRole('option', { name: /Request.*<number>.*completed/ }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Filter logs' }))
  expect(onFilterPattern).toHaveBeenCalledWith(
    expect.objectContaining({ count: 2 }),
    'completed',
  )
})
