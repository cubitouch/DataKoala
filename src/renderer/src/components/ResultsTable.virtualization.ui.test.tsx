import React from 'react'
void React
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '@shared/types'
import { ResultsTable } from './ResultsTable'
import { patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

const saveText = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ api: { export: { saveText } } }))

const largeResult: QueryResult = {
  columns: [
    { name: 'id', dataTypeID: 23, dataTypeName: 'int4' },
    { name: 'label', dataTypeID: 25, dataTypeName: 'text' }
  ],
  rows: Array.from({ length: 1500 }, (_, id) => ({ id, label: `row-${id}` })),
  rowCount: 1500,
  durationMs: 4
}

function arrange() {
  patchActiveTestSession({ running: false, queryError: null })
  return render(<ResultsTable
    mode="sql"
    rawResult={largeResult}
    filteredResult={{ ...largeResult, originalRowCount: largeResult.rowCount, filteredRowCount: largeResult.rowCount }}
    activeFilters={[]}
    resultRevision={1}
  />)
}

afterEach(() => {
  cleanup()
  saveText.mockReset()
  resetTestStore()
})

describe('ResultsTable virtualization', () => {
  it('keeps the mounted row count bounded and can navigate beyond row 1,000', () => {
    arrange()
    expect(screen.getByRole('textbox', { name: 'Filter rows' }).closest('[data-field]')?.getAttribute('data-label-visibility')).toBe('sr-only')
    const scroll = document.querySelector<HTMLElement>('[data-result-scroll]')
    expect(scroll).toBeTruthy()
    expect(document.querySelectorAll('[data-result-row-index]').length).toBeLessThan(100)
    expect(screen.queryByText('row-1200')).toBeNull()

    if (!scroll) return
    scroll.scrollTop = 1200 * 28
    fireEvent.scroll(scroll)

    expect(screen.getByText('row-1200')).toBeTruthy()
    expect(document.querySelectorAll('[data-result-row-index]').length).toBeLessThan(100)
    expect(screen.queryByText(/Showing first 1000/)).toBeNull()
  })

  it('sorts and searches the full result before virtualizing', () => {
    arrange()
    const idHeader = screen.getByRole('columnheader', { name: /id/ })
    fireEvent.click(idHeader)
    fireEvent.click(idHeader)
    expect(document.querySelector('[data-result-row-index="0"]')?.textContent).toContain('1499')

    fireEvent.change(screen.getByPlaceholderText('filter rows…'), { target: { value: 'row-1499' } })
    expect(screen.getByText('row-1499')).toBeTruthy()
    expect(screen.getByText(/1 of 1500 rows/)).toBeTruthy()
  })

  it('exports the full sorted and filtered result rather than the mounted window', async () => {
    arrange()
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(saveText).toHaveBeenCalledTimes(1))
    const content = saveText.mock.calls[0][0].content as string
    expect(content).toContain('row-0')
    expect(content).toContain('row-1499')
  })
})
