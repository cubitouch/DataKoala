import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResultsTable } from '../ResultsTable'
import { patchActiveTestSession, resetTestStore } from '../../test/sessionTestUtils'
import type { QueryResult } from '@shared/types'

const copyTextToClipboard = vi.hoisted(() => vi.fn())
vi.mock('../../lib/clipboardText', () => ({ copyTextToClipboard }))
vi.mock('../../lib/api', () => ({ api: { export: { saveText: vi.fn() } } }))

const baseResult: QueryResult = {
  columns: [
    { name: 'payload', dataTypeID: 3802, dataTypeName: 'jsonb' },
    { name: 'notes', dataTypeID: 0, dataTypeName: 'text' }
  ],
  rows: [{ payload: { user: { id: 42, name: 'Ada' }, items: [true, null, '雪'], long_key_name_that_requires_horizontal_scrolling: 'x'.repeat(120) }, notes: '{"looks":"json"}' }],
  rowCount: 1,
  durationMs: 3
}

function arrange(result = baseResult, mode: 'sql' | 'builder' = 'sql') {
  patchActiveTestSession({ running: false, queryError: null })
  return render(<ResultsTable mode={mode} rawResult={result} filteredResult={{ ...result, originalRowCount: result.rowCount, filteredRowCount: result.rowCount }} activeFilters={[]} resultRevision={1} />)
}

afterEach(() => { cleanup(); copyTextToClipboard.mockReset(); resetTestStore() })

describe('JSON cell explorer', () => {
  it('shows JSON actions for native JSON columns and JSON-shaped text in SQL mode', () => {
    arrange({ ...baseResult, columns: [{ name: 'j', dataTypeID: 114, dataTypeName: 'json' }, { name: 'jb', dataTypeID: 0, dataTypeName: 'jsonb' }, { name: 'text_json', dataTypeID: 0, dataTypeName: 'text' }], rows: [{ j: '{}', jb: {}, text_json: '{}' }] })
    expect(screen.getByRole('button', { name: 'Explore JSON in j, row 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explore JSON in jb, row 1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Explore JSON in text_json, row 1' })).toBeTruthy()
  })

  it('hides JSON actions for null values and Builder mode', () => {
    arrange({ ...baseResult, rows: [{ payload: null, notes: 'plain text' }] })
    expect(screen.queryByRole('button', { name: /Explore JSON/ })).toBeNull()
    cleanup()
    arrange(baseResult, 'builder')
    expect(screen.queryByRole('button', { name: /Explore JSON/ })).toBeNull()
  })

  it('opens, scrolls, copies the full formatted value, closes with Escape, and restores focus', async () => {
    copyTextToClipboard.mockResolvedValue(undefined)
    arrange()
    const button = screen.getByRole('button', { name: 'Explore JSON in payload, row 1' })
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'JSON · payload' })
    expect(dialog.querySelector('pre')).toBeTruthy()
    expect(screen.getByText('Row 1')).toBeTruthy()
    const close = screen.getByRole('button', { name: 'Close JSON explorer' })
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.getByText(/"id": 42/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith(expect.stringContaining('  "user": {')))
    expect(copyTextToClipboard.mock.calls[0][0]).toContain('long_key_name_that_requires_horizontal_scrolling')
    await screen.findByText('Copied')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('keeps the explorer open and reports copy failures', async () => {
    copyTextToClipboard.mockRejectedValue(new Error('denied'))
    arrange()
    fireEvent.click(screen.getByRole('button', { name: 'Explore JSON in payload, row 1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy JSON' }))
    await waitFor(() => expect(screen.getAllByText('Could not copy JSON').length).toBeGreaterThan(0))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('outside click closes, second cell replaces first, rerun invalidates, and malformed JSON is safe', async () => {
    arrange({ ...baseResult, columns: [{ name: 'a', dataTypeID: 3802, dataTypeName: 'jsonb' }, { name: 'b', dataTypeID: 3802, dataTypeName: 'jsonb' }], rows: [{ a: '{bad', b: { ok: true } }] })
    fireEvent.click(screen.getByRole('button', { name: 'Explore JSON in a, row 1' }))
    expect(await screen.findByText('This JSON value could not be formatted.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Explore JSON in b, row 1' }))
    expect(screen.queryByText('This JSON value could not be formatted.')).toBeNull()
    fireEvent.click(screen.getByRole('columnheader', { name: /b/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Explore JSON in b, row 1' }))
    fireEvent.mouseDown(document.querySelector('[data-modal-backdrop]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    const { rerender } = arrange()
    fireEvent.click(screen.getByRole('button', { name: 'Explore JSON in payload, row 1' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    rerender(<ResultsTable mode="sql" rawResult={baseResult} filteredResult={{ ...baseResult, originalRowCount: baseResult.rowCount, filteredRowCount: baseResult.rowCount }} activeFilters={[]} resultRevision={2} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

it('shows the explorer for JSON-shaped varchar values but not ordinary text', () => {
  arrange({
    ...baseResult,
    columns: [
      { name: 'json_text', dataTypeID: 1043, dataTypeName: 'character varying' },
      { name: 'plain_text', dataTypeID: 1043, dataTypeName: 'character varying' }
    ],
    rows: [{ json_text: '{"ok":true}', plain_text: 'hello' }]
  })
  expect(screen.getByRole('button', { name: 'Explore JSON in json_text, row 1' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Explore JSON in plain_text, row 1' })).toBeNull()
})
