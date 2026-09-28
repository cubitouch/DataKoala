import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ measure: vi.fn(), getTotalSize: () => count * 42, getVirtualItems: () => Array.from({ length: Math.min(count, 20) }, (_, index) => ({ index, start: index * 42 })), measureElement: vi.fn() }) }))
import { LogResultExplorer } from './LogResultExplorer'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const row = { id: '1', timestampNs: '1750000000000000000', timestampMs: 1750000000000, line: JSON.stringify({ message: 'Payment provider timeout after retries', attempt: 3 }), labels: { service_name: 'checkout-api' }, structuredMetadata: { severity: 'ERROR', trace_id: 'abc', region: 'west' }, parsedFields: { attempt: 3 }, severity: 'ERROR', traceId: 'abc' }

it('opens a compact selected row in the side inspector without advertising unavailable correlation', () => {
  const onFilter = vi.fn()
  render(<LogResultExplorer rows={[row]} limit={100} onFilter={onFilter} />)
  expect(screen.getByRole('textbox', { name: 'Search loaded logs' }).closest('[data-field]')?.getAttribute('data-label-visibility')).toBe('sr-only')
  expect(screen.getByText('ERROR').getAttribute('data-severity')).toBe('ERROR')
  const timestamp = screen.getByText(/\d{2}:\d{2}:\d{2}\.\d{3}/)
  expect(timestamp.getAttribute('title')).toContain('2025-')
  fireEvent.click(screen.getByRole('button', { name: /Payment provider timeout/ }))
  expect(screen.getByRole('heading', { name: 'Indexed labels' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Structured metadata' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Parsed fields' })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Payment provider timeout/ }).getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByRole('button', { name: 'Open trace' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Include service_name' }))
  expect(onFilter).toHaveBeenCalledWith('label', 'service_name', 'checkout-api', false, undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Exclude region' }))
  expect(onFilter).toHaveBeenCalledWith('structured-metadata', 'region', 'west', true, undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Include attempt' }))
  expect(onFilter).toHaveBeenCalledWith('parsed-field', 'attempt', '3', false, 'json')
})

it('keeps a large result set virtualized', () => {
  const rows = Array.from({ length: 1_000 }, (_, index) => ({ ...row, id: String(index), line: `log ${index}` }))
  render(<LogResultExplorer rows={rows} limit={1000} onFilter={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search loaded logs' }), { target: { value: 'log' } })
  expect(document.querySelectorAll('article').length).toBeLessThan(1000)
  expect(document.querySelectorAll('mark')).toHaveLength(20)
})

it('extracts a JSON message and presents trace and span identifiers above metadata', () => {
  const jsonRow = { ...row, line: JSON.stringify({ message: 'Readable checkout failure', trace_id: 'trace-json', span_id: 'span-json' }), parsedFields: { ...row.parsedFields, trace_id: 'trace-json', span_id: 'span-json' }, traceId: 'trace-json', spanId: 'span-json' }
  render(<LogResultExplorer rows={[jsonRow]} limit={100} onFilter={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search loaded logs' }), { target: { value: 'Readable checkout' } })
  const listRow = screen.getByRole('button', { name: /ERROR, Readable checkout failure/ })
  expect(listRow.textContent).toContain('Readable checkout failure')
  expect(listRow.textContent).not.toContain('{"message"')
  fireEvent.click(listRow)
  expect(document.querySelector('p')?.textContent).toBe('Readable checkout failure')
  expect(screen.queryByText(jsonRow.line, { selector: 'p' })).toBeNull()
  expect(screen.getByText('Trace ID').compareDocumentPosition(screen.getByRole('heading', { name: 'Indexed labels' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('trace-json')).toBeTruthy()
  expect(screen.getByText('span-json')).toBeTruthy()
  expect(screen.getAllByText('Trace ID')).toHaveLength(1)
  expect(screen.queryByText('trace_id')).toBeNull()
  expect(screen.queryByText('span_id')).toBeNull()
  expect(screen.getByRole('button', { name: 'Copy raw log' })).toBeTruthy()
})

it('keeps multiline messages compact in the fixed row and complete in the inspector', () => {
  const message = 'Timeout while authorizing payment\nTimeoutError: provider request exceeded 800ms\n    at authorizePayment (payment.ts:184:17)'
  const multiline = { ...row, id: 'stack', line: JSON.stringify({ msg: message }) }
  render(<LogResultExplorer rows={[multiline]} limit={100} onFilter={vi.fn()} />)
  const listRow = screen.getByRole('button', { name: /Timeout while authorizing payment/ })
  expect(listRow.closest('article')?.getBoundingClientRect().height || 0).toBeLessThanOrEqual(42)
  fireEvent.click(listRow)
  const complete = document.querySelector('p')!
  expect(complete.textContent).toBe(message)
  expect(complete.className).toContain('fullLine')
})


it('updates every visible match immediately and copies the original message and raw log', () => {
  const message = 'A word inside a wordier string and A WORD'
  const log = { ...row, line: JSON.stringify({ message }) }
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }))
  const { container } = render(<LogResultExplorer rows={[log]} limit={100} onFilter={vi.fn()} />)
  const input = screen.getByRole('textbox', { name: 'Search loaded logs' })
  fireEvent.change(input, { target: { value: 'a word' } })
  const summary = screen.getByRole('button', { name: /ERROR, A word inside/ })
  expect(Array.from(summary.querySelectorAll('mark'), (mark) => mark.textContent)).toEqual(['A word', 'a word', 'A WORD'])
  fireEvent.click(summary)
  const inspector = screen.getByRole('complementary', { name: 'Selected log details' })
  expect(inspector.querySelectorAll('p mark')).toHaveLength(3)
  expect(inspector.querySelector('p')?.textContent).toBe(message)
  fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
  expect(writeText).toHaveBeenLastCalledWith(message)
  fireEvent.click(screen.getByRole('button', { name: 'Copy raw log' }))
  expect(writeText).toHaveBeenLastCalledWith(log.line)
  fireEvent.change(input, { target: { value: 'inside' } })
  expect(Array.from(container.querySelectorAll('mark'), (mark) => mark.textContent)).toEqual(['inside', 'inside'])
  fireEvent.change(input, { target: { value: '' } })
  expect(container.querySelectorAll('mark')).toHaveLength(0)
  expect(inspector.querySelector('p')?.textContent).toBe(message)
})

it('highlights searchable metadata without marking inspector headings or actions', () => {
  render(<LogResultExplorer rows={[row]} limit={100} onFilter={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search loaded logs' }), { target: { value: 'west' } })
  fireEvent.click(screen.getByRole('button', { name: /Payment provider timeout/ }))
  expect(Array.from(document.querySelectorAll('mark'), (mark) => mark.textContent)).toEqual(['west'])
  expect(screen.getByRole('heading', { name: 'Structured metadata' }).querySelector('mark')).toBeNull()
})
