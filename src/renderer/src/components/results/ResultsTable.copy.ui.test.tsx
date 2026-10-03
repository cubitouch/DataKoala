import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '@lib/clipboardText'
import { api } from '@lib/api'
import { notify } from '@components/ui/feedback/NotificationArea'
import type { QueryResult } from '@shared/types'
import { createResultFilter } from '@lib/resultFilters'
import { ResultsTable } from './ResultsTable'

vi.mock('@lib/clipboardText', () => ({ copyTextToClipboard: vi.fn() }))
vi.mock('@lib/api', () => ({ api: { export: { saveText: vi.fn() } } }))
vi.mock('@components/ui/feedback/NotificationArea', () => ({ notify: vi.fn() }))
afterEach(cleanup)

const result: QueryResult = {
  columns: [
    { name: 'name', dataTypeID: 25, dataTypeName: 'text' },
    { name: 'value', dataTypeID: 23, dataTypeName: 'integer' },
  ],
  rows: [
    { name: 'keep,z', value: 2 },
    { name: 'excluded', value: 0 },
    { name: 'keep "a"', value: 1 },
    { name: 'search mismatch', value: 3 },
  ],
  rowCount: 4,
  durationMs: 1,
}
function renderTable(rows = result.rows) {
  return render(
    <ResultsTable
      mode="sql"
      rawResult={result}
      filteredResult={{
        ...result,
        rows,
        originalRowCount: 4,
        filteredRowCount: rows.length,
      }}
      activeFilters={[createResultFilter('value', 'notEquals', 0)]}
      running={false}
      error={null}
      onAddFilter={vi.fn()}
      onRemoveFilter={vi.fn()}
      onClearFilters={vi.fn()}
    />,
  )
}

it('copies the locally filtered, searched and sorted rows with headers, without saving a file', async () => {
  vi.mocked(copyTextToClipboard).mockResolvedValue(undefined)
  renderTable(result.rows.filter((row) => row.value !== 0))
  fireEvent.change(screen.getByRole('textbox', { name: 'Filter rows' }), {
    target: { value: 'keep' },
  })
  fireEvent.click(screen.getByRole('columnheader', { name: /value/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith({ message: 'Table copied as CSV' }),
  )
  const csv = 'name,value\n"keep ""a""",1\n"keep,z",2'
  expect(copyTextToClipboard).toHaveBeenCalledWith(csv)
  expect(api.export.saveText).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  expect(api.export.saveText).toHaveBeenCalledWith({
    defaultName: 'datakoala_results.csv',
    content: csv,
  })
})

it('copies headers when local filters leave no rows', async () => {
  vi.mocked(copyTextToClipboard).mockResolvedValue(undefined)
  renderTable([])
  fireEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))
  await waitFor(() =>
    expect(copyTextToClipboard).toHaveBeenCalledWith('name,value'),
  )
})

it('shows clipboard failures and permits retrying', async () => {
  vi.mocked(copyTextToClipboard)
    .mockRejectedValueOnce(new Error('Permission denied'))
    .mockResolvedValueOnce(undefined)
  renderTable()
  fireEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'error',
        message: expect.stringContaining('clipboard permissions'),
      }),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith({ message: 'Table copied as CSV' }),
  )
  expect(copyTextToClipboard).toHaveBeenCalledTimes(2)
})

it('copies the entire dataset rather than only virtualized rows', async () => {
  vi.mocked(copyTextToClipboard).mockResolvedValue(undefined)
  const rows = Array.from({ length: 200 }, (_, value) => ({
    name: `row ${value}`,
    value,
  }))
  renderTable(rows)
  expect(screen.queryByText('row 199')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Copy CSV' }))
  await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled())
  const csv = vi.mocked(copyTextToClipboard).mock.calls[0][0]
  expect(csv.split('\n')).toHaveLength(201)
  expect(csv.endsWith('row 199,199')).toBe(true)
})
