// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '@shared/types'
import type { ResultFilter } from '../lib/resultFilters'

const resultA: QueryResult = {
  columns: [{ name: 'value', dataTypeID: 23, dataTypeName: 'int4' }],
  rows: [{ value: 1 }],
  rowCount: 1,
  durationMs: 4
}

const promotedFilter: ResultFilter = {
  id: 'country-fr',
  column: 'country',
  operator: 'equals',
  value: 'FR',
  execution: 'query',
  provenance: {
    mode: 'builder',
    resultAlias: 'series',
    table: { schema: 'public', name: 'events' },
    sourceColumns: ['country'],
    sourceColumn: 'country',
    timeColumn: 'created_at',
    timeBucket: 'day',
    sourceKind: 'single-column',
    targetKind: 'source-column',
    displayLabel: 'country'
  }
}

const clientFilter: ResultFilter = {
  id: 'device-mobile', column: 'device', operator: 'equals', value: 'mobile', execution: 'client'
}

async function setup() {
  vi.resetModules()
  Object.defineProperty(window, 'datakoala', {
    configurable: true,
    value: {
      connections: {
        connect: vi.fn(),
        disconnect: vi.fn(async () => undefined),
        list: vi.fn(async () => []),
        listObjects: vi.fn(async () => []),
        describeTable: vi.fn(async () => [])
      }
    }
  })
  return import('./useStore')
}

describe('query session model', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps SQL, Builder, filters, visualization and result state isolated between tabs', async () => {
    const { useStore, selectSession } = await setup()
    const a = useStore.getState().activeTabId
    useStore.getState().setSql('select from_a;', a)
    useStore.getState().setBuilder({ table: { schema: 'public', name: 'events' }, timeColumn: 'created_at', seriesColumns: ['country'] }, a)
    useStore.getState().setVisualization('sql', { view: 'bar', xColumn: 'value', valueColumn: 'value' }, a)
    useStore.getState().addResultFilter('builder', promotedFilter, a)
    useStore.getState().completeQuery(resultA, null, a)

    const b = useStore.getState().createTab()
    useStore.getState().setQueryMode('sql', b)
    useStore.getState().setSql('select from_b;', b)
    useStore.getState().setBuilder({ timeBucket: 'hour' }, b)

    const state = useStore.getState()
    expect(state.activeTabId).toBe(b)
    expect(selectSession(state, a)).toMatchObject({
      sql: 'select from_a;',
      queryMode: 'builder',
      result: resultA,
      builder: { table: { schema: 'public', name: 'events' }, timeColumn: 'created_at', seriesColumns: ['country'] },
      sqlVisualization: { view: 'bar', xColumn: 'value' }
    })
    expect(selectSession(state, a)?.builderResultFilters).toHaveLength(1)
    expect(selectSession(state, b)).toMatchObject({ sql: 'select from_b;', queryMode: 'sql', result: null, builder: { timeBucket: 'hour' } })
    expect(selectSession(state, b)?.builderResultFilters).toEqual([])
  })

  it('delivers a late Tab A result to A while Tab B remains active and untouched', async () => {
    const { useStore, selectSession } = await setup()
    const a = useStore.getState().activeTabId
    useStore.getState().startQuery(a)
    const b = useStore.getState().createTab()
    useStore.getState().setSql('select b;', b)

    useStore.getState().completeQuery(resultA, null, a)

    const state = useStore.getState()
    expect(state.activeTabId).toBe(b)
    expect(selectSession(state, a)?.result).toEqual(resultA)
    expect(selectSession(state, a)?.running).toBe(false)
    expect(selectSession(state, b)?.result).toBeNull()
    expect(selectSession(state, b)?.sql).toBe('select b;')
  })

  it('Clear results preserves the query and promoted Builder predicates but removes runtime/client exploration state', async () => {
    const { useStore, selectActiveSession } = await setup()
    const id = useStore.getState().activeTabId
    useStore.getState().setSql('select keep_me;', id)
    useStore.getState().setBuilder({ table: { schema: 'public', name: 'events' }, timeColumn: 'created_at', seriesColumns: ['country'] }, id)
    useStore.setState((state) => ({
      tabs: state.tabs.map((tab) => tab.id === id ? {
        ...tab,
        result: resultA,
        queryError: 'boom',
        explainText: 'plan',
        showExplain: true,
        builderResultFilters: [promotedFilter, clientFilter],
        sqlResultFilters: [clientFilter],
        seriesVisibility: { FR: false }
      } : tab)
    }))

    useStore.getState().clearActiveResults()
    const active = selectActiveSession(useStore.getState())
    expect(active.sql).toBe('select keep_me;')
    expect(active.builder.table).toEqual({ schema: 'public', name: 'events' })
    expect(active.result).toBeNull()
    expect(active.queryError).toBeNull()
    expect(active.explainText).toBeNull()
    expect(active.seriesVisibility).toEqual({})
    expect(active.sqlResultFilters).toEqual([])
    expect(active.builderResultFilters).toEqual([promotedFilter])
  })

  it('Reset query preserves tab identity/title/connection while returning editable work to defaults', async () => {
    const { useStore, selectActiveSession } = await setup()
    const id = useStore.getState().activeTabId
    useStore.setState((state) => ({
      profiles: [],
      activeProfileId: 'profile-a',
      tabs: state.tabs.map((tab) => tab.id === id ? {
        ...tab,
        title: 'Revenue investigation',
        connectionProfileId: 'profile-a',
        queryMode: 'sql',
        sql: 'select revenue;',
        result: resultA,
        builderResultFilters: [promotedFilter],
        builder: { table: { schema: 'public', name: 'events' }, timeColumn: 'created_at', timeBucket: 'hour', seriesColumns: ['country'] }
      } : tab)
    }))

    useStore.getState().resetActiveQuery()
    const active = selectActiveSession(useStore.getState())
    expect(active.id).toBe(id)
    expect(active.title).toBe('Revenue investigation')
    expect(active.connectionProfileId).toBe('profile-a')
    expect(active.queryMode).toBe('builder')
    expect(active.sql).toBe('select now();')
    expect(active.result).toBeNull()
    expect(active.builder.table).toBeNull()
    expect(active.builder.timeRange).toEqual({ kind: 'rolling', amount: 7, unit: 'day' })
    expect(active.builderResultFilters).toEqual([])
    expect(active.sqlVisualization.view).toBe('table')
  })

  it('closing the final tab always leaves one fresh tab and keeps its connection association', async () => {
    const { useStore, selectActiveSession } = await setup()
    const original = useStore.getState().activeTabId
    useStore.setState((state) => ({ tabs: state.tabs.map((tab) => ({ ...tab, connectionProfileId: 'profile-a', sql: 'select disposable;' })) }))

    useStore.getState().closeTab(original)
    const state = useStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).not.toBe(original)
    expect(selectActiveSession(state).connectionProfileId).toBe('profile-a')
    expect(selectActiveSession(state).sql).toBe('select now();')
  })
})
