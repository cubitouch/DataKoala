// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@uiw/react-codemirror', () => ({ default: ({ value }: { value: string }) => <pre>{value}</pre> }))
vi.mock('../lib/api', () => ({ api: { query: { seriesStatistics: vi.fn(), probeSeriesCardinality: vi.fn() }, connections: { describeTable: vi.fn() } } }))

import { BuilderPanel } from './BuilderPanel'
import type { BuilderTimeRange } from '../lib/builderTimeRange'
import { activeTestSession, patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'
import type { DatabaseSchemaNode } from '@shared/types'

const schemas: DatabaseSchemaNode[] = [{
  name: 'analytics', isSystem: false, relations: [{
    schema: 'analytics', name: 'events', kind: 'r', qualifiedName: 'analytics.events', columnsStatus: 'loaded', columns: [
      { name: 'created_at', dataTypeName: 'timestamp with time zone' },
      { name: 'status', dataTypeName: 'text' }
    ]
  }]
}]

const arrange = (timeRange: BuilderTimeRange) => {
  resetTestStore({ connected: true, activeProfileId: 'p1', connectionStatus: 'connected' })
  setActiveTestMetadata(schemas, 'loaded', null, 'p1')
  patchActiveTestSession({
    connectionProfileId: 'p1',
    builder: { table: { schema: 'analytics', name: 'events' }, timeColumn: 'created_at', timeBucket: 'hour', seriesColumns: [], timeRange },
    builderVisualization: { ...activeTestSession().builderVisualization, xColumn: 'created_at', valueColumn: null, aggregation: 'count', seriesColumn: null, seriesColumns: [] }
  })
  return render(<BuilderPanel />)
}

afterEach(() => { cleanup(); resetTestStore() })

describe('Builder Minute bucket availability', () => {
  it('keeps Minute visible but disabled and explains why in the dropdown for ranges over 24 hours', () => {
    arrange({ kind: 'rolling', amount: 7, unit: 'day' })
    fireEvent.click(screen.getByRole('combobox', { name: /Time bucket: Hour/ }))
    const minute = screen.getByRole('option', { name: /Minute, Available for ranges up to 24 hours/ })
    expect(minute.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Available for ranges up to 24 hours')).toBeTruthy()
    expect(screen.queryByText('Minute is available only for time ranges of 24 hours or less.')).toBeNull()
    fireEvent.click(minute)
    expect(activeTestSession().builder.timeBucket).toBe('hour')
  })

  it('enables Minute at the inclusive 24-hour boundary', () => {
    arrange({ kind: 'rolling', amount: 24, unit: 'hour' })
    fireEvent.click(screen.getByRole('combobox', { name: /Time bucket: Hour/ }))
    const minute = screen.getByRole('option', { name: 'Minute' })
    expect(minute.getAttribute('aria-disabled')).not.toBe('true')
    fireEvent.click(minute)
    expect(activeTestSession().builder.timeBucket).toBe('minute')
  })

  it('falls back a stale Minute selection to Hour when the temporal range expands', () => {
    arrange({ kind: 'rolling', amount: 24, unit: 'hour' })
    act(() => useStore.getState().setBuilder({ timeBucket: 'minute' }))
    act(() => useStore.getState().setBuilder({ timeRange: { kind: 'rolling', amount: 7, unit: 'day' } }))
    expect(activeTestSession().builder.timeBucket).toBe('hour')
    expect(activeTestSession().builderFilterNotice?.message).toContain('Changed Time bucket to Hour')
  })
})
