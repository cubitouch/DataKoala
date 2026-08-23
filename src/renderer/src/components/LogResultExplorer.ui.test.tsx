import React from 'react'
void React
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ measure: vi.fn(), getTotalSize: () => count * 42, getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 42 })), measureElement: vi.fn() }) }))
import { LogResultExplorer } from './LogResultExplorer'

afterEach(cleanup)
const row = { id: '1', timestampNs: '1750000000000000000', timestampMs: 1750000000000, line: 'Payment provider timeout after retries', labels: { service_name: 'checkout-api' }, structuredMetadata: { severity: 'ERROR', trace_id: 'abc' }, parsedFields: { attempt: 3 }, severity: 'ERROR', traceId: 'abc' }

it('renders compact severity and restrained expanded field actions with honest correlation', () => {
  const onFilter = vi.fn()
  render(<LogResultExplorer rows={[row]} limit={100} onFilter={onFilter} correlationDisabledReason="Tempo navigation is unavailable." />)
  expect(screen.getByText('ERROR').getAttribute('data-severity')).toBe('ERROR')
  const timestamp = screen.getByText(/\d{2}:\d{2}:\d{2}\.\d{3}/)
  expect(timestamp.getAttribute('title')).toContain('2025-')
  fireEvent.click(screen.getByRole('button', { name: /Payment provider timeout/ }))
  expect(screen.getByRole('heading', { name: 'Indexed labels' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Structured metadata' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Parsed fields' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open trace' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Include service_name' }))
  expect(onFilter).toHaveBeenCalledWith('label', 'service_name', 'checkout-api', false)
})
