import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

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
        getTotalSize: () => count * 58,
        getVirtualItems: () =>
          Array.from({ length: Math.min(12, count - start) }, (_, offset) => ({
            index: start + offset,
            start: (start + offset) * 58,
          })),
      }
    },
  }
})
import { LogPatternExplorer } from './LogPatternExplorer'

afterEach(cleanup)

const letters = (value: number) => {
  let result = ''
  for (let number = value; number >= 0; number = Math.floor(number / 26) - 1)
    result = String.fromCharCode(97 + (number % 26)) + result
  return result
}
const rows = Array.from({ length: 600 }, (_, index) => ({
  id: String(index),
  timestampNs: String(index * 1_000_000),
  timestampMs: index,
  line: `Pattern${letters(index)} reports a distinct semantic event`,
  labels: {},
  structuredMetadata: {},
  parsedFields: {},
  severity: index % 2 ? 'INFO' : 'ERROR',
}))
const variableRows = [
  {
    ...rows[0],
    id: 'one',
    line: 'Request 123 completed',
    severity: 'INFO',
  },
  {
    ...rows[1],
    id: 'two',
    line: 'Request 456 completed',
    severity: 'ERROR',
  },
]

it('renders compact virtualized pattern rows without a redundant heading', async () => {
  render(<LogPatternExplorer rows={rows} onViewLogs={vi.fn()} />)

  expect(screen.queryByRole('heading', { name: 'Patterns' })).toBeNull()
  expect(screen.getByText('600 patterns · 600 loaded logs')).toBeTruthy()
  expect(document.querySelectorAll('[data-pattern-row]').length).toBeLessThan(
    30,
  )

  const scroller = document.querySelector(
    '[data-pattern-scroller]',
  ) as HTMLDivElement
  scroller.scrollTop = 550 * 58
  fireEvent.scroll(scroller)

  await waitFor(() =>
    expect(
      Math.max(
        ...Array.from(document.querySelectorAll('[data-pattern-row]')).map(
          (row) => Number(row.getAttribute('data-index')),
        ),
      ),
    ).toBeGreaterThan(500),
  )
  expect(document.querySelectorAll('[data-pattern-row]').length).toBeLessThan(
    30,
  )
})

it('orders metrics, representative severity, pattern, and chevron like Loki list rows', () => {
  render(<LogPatternExplorer rows={variableRows} onViewLogs={vi.fn()} />)

  const patternRow = document.querySelector(
    '[data-pattern-row] button',
  ) as HTMLButtonElement
  const children = Array.from(patternRow.children)

  expect(children).toHaveLength(4)
  expect(children[0].hasAttribute('data-pattern-metrics')).toBe(true)
  expect(children[0].textContent).toBe('2 logs · 100.0%')

  const severity = children[1].querySelector('[data-log-severity]')
  expect(severity?.textContent).toBe('ERROR')
  expect(severity?.textContent).not.toMatch(/\d/)

  expect(children[2].hasAttribute('data-pattern-template')).toBe(true)
  expect(children[2].textContent).toContain('Request')
  expect(children[2].textContent).toContain('completed')

  expect(children[3].hasAttribute('data-log-row-chevron')).toBe(true)
  expect(children[3].textContent).toBe('›')
})

it('selects patterns into one resizable inspector and keeps its width across selections', () => {
  render(<LogPatternExplorer rows={rows.slice(0, 4)} onViewLogs={vi.fn()} />)
  const patternRows = Array.from(
    document.querySelectorAll('[data-pattern-row] button'),
  ) as HTMLButtonElement[]

  fireEvent.click(patternRows[0])
  expect(patternRows[0].getAttribute('aria-selected')).toBe('true')
  expect(
    screen.getByRole('complementary', { name: 'Selected pattern details' }),
  ).toBeTruthy()

  const separator = screen.getByRole('separator', {
    name: 'Resize Selected pattern details',
  })
  fireEvent.keyDown(separator, { key: 'ArrowLeft' })
  const width = document
    .querySelector('[data-resizable-detail]')!
    .getAttribute('data-detail-width')

  fireEvent.click(patternRows[1])
  expect(patternRows[1].getAttribute('aria-selected')).toBe('true')
  expect(
    document
      .querySelector('[data-resizable-detail]')!
      .getAttribute('data-detail-width'),
  ).toBe(width)

  fireEvent.keyDown(window, { key: 'Escape' })
  expect(
    screen.queryByRole('complementary', { name: 'Selected pattern details' }),
  ).toBeNull()
})

it('shows level-only inspector badges and keeps View logs beside Close in the header', () => {
  const onViewLogs = vi.fn()
  render(<LogPatternExplorer rows={variableRows} onViewLogs={onViewLogs} />)

  const patternRow = document.querySelector(
    '[data-pattern-row] button',
  ) as HTMLButtonElement
  fireEvent.click(patternRow)

  const inspector = screen.getByRole('complementary', {
    name: 'Selected pattern details',
  })
  const header = inspector.querySelector('header')!
  const headerButtons = Array.from(
    header.querySelectorAll('button'),
    (button) => button.textContent?.trim(),
  )
  expect(headerButtons).toEqual(['View logs', 'Close'])
  expect(screen.getAllByRole('button', { name: 'View logs' })).toHaveLength(1)

  const inspectorSeverities = Array.from(
    inspector.querySelectorAll('[data-log-severity]'),
    (badge) => badge.textContent,
  )
  expect(inspectorSeverities).toEqual(['ERROR', 'INFO'])
  expect(inspectorSeverities.every((severity) => !/\d/.test(severity ?? '')))
    .toBe(true)

  expect(screen.getByRole('heading', { name: 'Template' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Example messages' })).toBeTruthy()
  expect(screen.getByText('Request 123 completed')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Variable samples' })).toBeTruthy()
  expect(screen.getByText(/123, 456/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'View logs' }))
  expect(onViewLogs).toHaveBeenCalledTimes(1)
  expect(onViewLogs.mock.calls[0][0].memberIds).toEqual(['one', 'two'])

  fireEvent.click(screen.getByRole('button', { name: 'Close pattern details' }))
  expect(document.querySelector('[data-pattern-inspector]')).toBeNull()
})
