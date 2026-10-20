import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { QueryResult } from '@shared/types'
import { QueryStatistics } from './QueryStatistics'
import { ResultsTable } from './ResultsTable'
afterEach(cleanup)
const result: QueryResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  durationMs: 0,
  execution: {
    provider: 'bigquery',
    durationMs: 0,
    rowCount: 0,
    totalRows: 0,
    bytesProcessed: 0,
    bytesBilled: 0,
    slotMs: 0,
    providerDurationMs: 0,
    cacheHit: false,
    statisticsScope: 'job',
  },
}
it('displays real zero and false with distinct units and labels', () => {
  render(<QueryStatistics result={result} />)
  for (const text of [
    '0 returned rows · 0 cols',
    '0 total rows',
    '0 ms request',
    'Job: 0 ms elapsed',
    'Job: 0 B processed',
    'Job: 0 B billed',
    'Job: 0 slot-ms',
    'Job: cache miss',
  ])
    expect(screen.getByText(text)).toBeTruthy()
})
it('omits malformed and unsafe metadata rather than inventing zeroes', () => {
  render(
    <QueryStatistics
      result={{
        ...result,
        execution: {
          provider: 'bigquery',
          durationMs: 0,
          bytesBilled: NaN,
          bytesProcessed: -1,
          slotMs: 9007199254740992,
        },
      }}
    />,
  )
  expect(
    screen.queryByText(/B billed|B processed|slot-ms|cache miss|total rows/),
  ).toBeNull()
})
it('labels script parent statistics separately from final-statement row counts', () => {
  render(
    <QueryStatistics
      result={{
        ...result,
        rowCount: 10,
        execution: {
          ...result.execution!,
          statisticsScope: 'script',
          totalRows: 100,
          truncated: true,
          cacheHit: true,
        },
      }}
      visibleRowCount={3}
    />,
  )
  expect(
    screen.getByText('3 of 10 returned final-statement rows · 0 cols'),
  ).toBeTruthy()
  expect(screen.getByText('100 total final-statement rows')).toBeTruthy()
  expect(screen.getByText('Script job: cache hit')).toBeTruthy()
  expect(screen.getByText('capped · more rows available')).toBeTruthy()
})
it('retains ordinary SQL stats and exposes BigQuery metadata in the production table header', () => {
  const props = {
    mode: 'sql' as const,
    activeFilters: [],
    filteredResult: null,
    rawResult: result,
    running: false,
    error: null,
    onAddFilter: vi.fn(),
    onRemoveFilter: vi.fn(),
    onClearFilters: vi.fn(),
  }
  const view = render(<ResultsTable {...props} />)
  expect(screen.getByText('Job: 0 B billed')).toBeTruthy()
  view.rerender(<ResultsTable {...props} error="Failure B" />)
  expect(screen.queryByText('Job: 0 B billed')).toBeNull()
  view.rerender(
    <ResultsTable
      {...props}
      rawResult={{
        ...result,
        execution: { ...result.execution!, bytesBilled: 123 },
      }}
    />,
  )
  expect(screen.getByText('Job: 123 B billed')).toBeTruthy()
  view.rerender(
    <ResultsTable {...props} rawResult={{ ...result, execution: undefined }} />,
  )
  expect(screen.getByText('0 rows · 0 cols · 0 ms')).toBeTruthy()
})
