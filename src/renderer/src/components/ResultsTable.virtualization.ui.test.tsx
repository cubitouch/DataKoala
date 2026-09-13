import React from 'react'
void React
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '@shared/types'
import { ResultsTable } from './ResultsTable'
import styles from './ResultsTable.module.css'
import { patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

const resultsTableCss = readFileSync('src/renderer/src/components/ResultsTable.module.css', 'utf8')
const longValue = `row-0-${'complete-value-'.repeat(40)}`

const saveText = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ api: { export: { saveText } } }))

const largeResult: QueryResult = {
  columns: [
    { name: 'id', dataTypeID: 23, dataTypeName: 'int4' },
    { name: 'label', dataTypeID: 25, dataTypeName: 'text' }
  ],
  rows: Array.from({ length: 1500 }, (_, id) => ({ id, label: id === 0 ? longValue : `row-${id}` })),
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
  it('makes only complete result values selectable while controls remain non-selectable', () => {
    arrange()

    const value = screen.getByText(longValue)
    expect(value.classList.contains(styles.cellValue)).toBe(true)
    expect(value.textContent).toBe(longValue)
    expect(resultsTableCss).toMatch(/\.cellValue\s*\{[^}]*user-select:\s*text\s*;/)
    expect(resultsTableCss).toMatch(/\.cellActions\s*\{[^}]*user-select:\s*none\s*;/)
    expect(screen.getByRole('columnheader', { name: /label/ }).classList.contains(styles.cellValue)).toBe(false)
    expect(screen.getByRole('button', { name: 'Export CSV' }).classList.contains(styles.cellValue)).toBe(false)
  })

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

  it('resizes one snapped column without sorting or unbounding virtualization', () => {
    window.PointerEvent = MouseEvent as typeof PointerEvent
    arrange()
    const headers = screen.getAllByRole('columnheader')
    vi.spyOn(headers[0], 'getBoundingClientRect').mockReturnValue({ width: 120 } as DOMRect)
    vi.spyOn(headers[1], 'getBoundingClientRect').mockReturnValue({ width: 240 } as DOMRect)
    const handle = screen.getByRole('separator', { name: 'Resize id column' })

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 180 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 180 })

    const columns = document.querySelectorAll('col')
    expect(columns).toHaveLength(2)
    expect((columns[0] as HTMLElement).style.width).toBe('200px')
    expect((columns[1] as HTMLElement).style.width).toBe('240px')
    expect(document.querySelector<HTMLTableElement>('table')?.style.width).toBe('440px')
    expect(headers[0].textContent).not.toContain('▲')
    expect(document.querySelectorAll('[data-result-row-index]').length).toBeLessThan(100)
  })

  it('clamps resized columns at the minimum and maximum widths', () => {
    window.PointerEvent = MouseEvent as typeof PointerEvent
    arrange()
    const header = screen.getByRole('columnheader', { name: /id/ })
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ width: 160 } as DOMRect)
    const handle = screen.getByRole('separator', { name: 'Resize id column' })

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -1000 })
    expect(document.querySelector<HTMLElement>('col')?.style.width).toBe('80px')

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 2000 })
    expect(document.querySelector<HTMLElement>('col')?.style.width).toBe('720px')
    fireEvent.pointerCancel(handle, { pointerId: 1 })
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

describe('ResultsTable duplicate columns', () => {
  it('renders and searches values through each column internal key', () => {
    patchActiveTestSession({ running: false, queryError: null })
    const result: QueryResult = {
      columns: [
        { name: 'id', dataTypeID: 25, dataTypeName: 'text' },
        { name: 'id', key: '__datakoala_column_1', dataTypeID: 25, dataTypeName: 'text' }
      ],
      rows: [{ id: 'A', __datakoala_column_1: 'B' }],
      rowCount: 1,
      durationMs: 1
    }
    render(<ResultsTable
      mode="sql"
      rawResult={result}
      filteredResult={{ ...result, originalRowCount: 1, filteredRowCount: 1 }}
      activeFilters={[]}
      resultRevision={1}
    />)

    expect(screen.getAllByRole('columnheader', { name: /id/ })).toHaveLength(2)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('filter rows…'), { target: { value: 'B' } })
    expect(screen.getByText('B')).toBeTruthy()
  })
})
