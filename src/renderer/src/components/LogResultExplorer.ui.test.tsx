import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ measure: vi.fn(), getTotalSize: () => count * 42, getVirtualItems: () => Array.from({ length: Math.min(count, 20) }, (_, index) => ({ index, start: index * 42 })), measureElement: vi.fn() }) }))
import { LogResultExplorer } from './LogResultExplorer'

afterEach(cleanup)
const row = { id: '1', timestampNs: '1750000000000000000', timestampMs: 1750000000000, line: 'Payment provider timeout after retries', labels: { service_name: 'checkout-api' }, structuredMetadata: { severity: 'ERROR', trace_id: 'abc' }, parsedFields: { attempt: 3 }, severity: 'ERROR', traceId: 'abc' }

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
  expect(onFilter).toHaveBeenCalledWith('label', 'service_name', 'checkout-api', false)
})

it('keeps a large result set virtualized', () => {
  const rows = Array.from({ length: 1_000 }, (_, index) => ({ ...row, id: String(index), line: `log ${index}` }))
  render(<LogResultExplorer rows={rows} limit={1000} onFilter={vi.fn()} />)
  expect(document.querySelectorAll('article').length).toBeLessThan(1000)
})

it('extracts a JSON message and presents trace and span identifiers above metadata', () => {
  const jsonRow = { ...row, line: JSON.stringify({ message: 'Readable checkout failure', trace_id: 'trace-json', span_id: 'span-json' }), parsedFields: { ...row.parsedFields, trace_id: 'trace-json', span_id: 'span-json' }, traceId: 'trace-json', spanId: 'span-json' }
  render(<LogResultExplorer rows={[jsonRow]} limit={100} onFilter={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search loaded logs' }), { target: { value: 'Readable checkout' } })
  const listRow = screen.getByRole('button', { name: /ERROR, Readable checkout failure/ })
  expect(listRow.textContent).toContain('Readable checkout failure')
  expect(listRow.textContent).not.toContain('{"message"')
  fireEvent.click(listRow)
  expect(screen.getByText('Readable checkout failure', { selector: 'p' })).toBeTruthy()
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
