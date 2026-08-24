import React from 'react'
void React
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ measure: vi.fn(), getTotalSize: () => count * 42, getVirtualItems: () => Array.from({ length: Math.min(count, 20) }, (_, index) => ({ index, start: index * 42 })), measureElement: vi.fn() }) }))
import { LogResultExplorer } from './LogResultExplorer'

afterEach(cleanup)
const row = { id: '1', timestampNs: '1750000000000000000', timestampMs: 1750000000000, line: 'Payment provider timeout after retries', labels: { service_name: 'checkout-api' }, structuredMetadata: { severity: 'ERROR', trace_id: 'abc' }, parsedFields: { attempt: 3 }, severity: 'ERROR', traceId: 'abc' }

it('opens a compact selected row in the side inspector without advertising unavailable correlation', () => {
  const onFilter = vi.fn()
  render(<LogResultExplorer rows={[row]} limit={100} onFilter={onFilter} />)
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
