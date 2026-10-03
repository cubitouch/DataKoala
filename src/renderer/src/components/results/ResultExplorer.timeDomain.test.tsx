// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { BuilderTimeRange } from '@lib/builderTimeRange'
import type { QueryResult } from '@shared/types'
import { patchActiveTestSession, resetTestStore } from '@test/sessionTestUtils'

const captured = vi.hoisted(() => ({
  chartTimeDomain: null as { min: number; max: number } | null | undefined
}))

vi.mock('./GenericResultExplorer', () => ({
  GenericResultExplorer: (props: { chartTimeDomain?: { min: number; max: number } | null }) => {
    captured.chartTimeDomain = props.chartTimeDomain
    return <div data-testid="generic-result-explorer" />
  }
}))

import { ResultExplorer } from './ResultExplorer'

const result: QueryResult = {
  columns: [
    { name: 'time_bucket', dataTypeID: 0, dataTypeName: 'timestamp with time zone' },
    { name: 'value', dataTypeID: 0, dataTypeName: 'numeric' }
  ],
  rows: [
    { time_bucket: '2026-09-27T00:00:00Z', value: 10 },
    { time_bucket: '2026-09-28T00:00:00Z', value: 20 }
  ],
  rowCount: 2,
  durationMs: 12
}

function arrange(timeRange: BuilderTimeRange) {
  resetTestStore({ connected: true, connectionStatus: 'connected' })
  patchActiveTestSession({
    result,
    resultRevision: 1,
    queryMode: 'builder',
    builderHasRun: true,
    builder: {
      table: { schema: 'public', name: 'events' },
      timeColumn: 'created_at',
      timeBucket: 'day',
      seriesColumns: [],
      timeRange
    },
    builderVisualization: {
      view: 'bar',
      xColumn: 'time_bucket',
      valueColumn: 'value',
      aggregation: 'sum',
      seriesColumn: null,
      seriesColumns: [],
      valueAxisScale: 'linear'
    },
    builderResultFilters: [],
    running: false,
    queryError: null,
    isResultStale: false
  })
  return render(<ResultExplorer mode="builder" dimensionControls="external" />)
}

afterEach(() => {
  cleanup()
  resetTestStore()
  vi.useRealTimers()
  captured.chartTimeDomain = null
})

it('refreshes a rolling chart domain when a new query result is committed', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T17:00:00Z'))
  arrange({ kind: 'rolling', amount: 7, unit: 'day' })

  expect(captured.chartTimeDomain).toEqual({
    min: Date.parse('2026-09-26T17:00:00.000Z'),
    max: Date.parse('2026-10-03T17:00:00.000Z')
  })

  act(() => {
    vi.setSystemTime(new Date('2026-10-03T18:30:00Z'))
    patchActiveTestSession({ result: { ...result, durationMs: 13 }, resultRevision: 2 })
  })

  expect(captured.chartTimeDomain).toEqual({
    min: Date.parse('2026-09-26T18:30:00.000Z'),
    max: Date.parse('2026-10-03T18:30:00.000Z')
  })
})

it('keeps a custom chart domain fixed when query results change', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T17:00:00Z'))
  arrange({
    kind: 'custom',
    startDate: '2026-09-26',
    startTime: '12:00',
    endDate: '2026-10-03',
    endTime: '12:00',
    recurringWindows: []
  })

  const expected = {
    min: Date.parse('2026-09-26T12:00:00.000Z'),
    max: Date.parse('2026-10-03T12:00:00.000Z')
  }
  expect(captured.chartTimeDomain).toEqual(expected)

  act(() => {
    vi.setSystemTime(new Date('2026-10-04T09:00:00Z'))
    patchActiveTestSession({ result: { ...result, durationMs: 13 }, resultRevision: 2 })
  })

  expect(captured.chartTimeDomain).toEqual(expected)
})
