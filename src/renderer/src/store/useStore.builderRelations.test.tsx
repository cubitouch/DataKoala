// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuilderTimeRange } from '../lib/builderTimeRange'

const ALL_TIME: BuilderTimeRange = { kind: 'all' }
const events = { schema: 'app', name: 'events' }
const users = { schema: 'app', name: 'users' }

async function setup() {
  vi.resetModules()
  Object.defineProperty(window, 'datakoala', { configurable: true, value: {} })
  const module = await import('./useStore')
  return module
}

describe('Builder relation selection', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('does not invent temporal state for a newly selected object-browser relation', async () => {
    const { useStore, selectActiveSession } = await setup()
    const session = selectActiveSession(useStore.getState())
    useStore.setState({ tabs: [{ ...session, builder: { table: events, timeColumn: 'created_at', timeBucket: 'week', seriesColumns: ['kind'], timeRange: ALL_TIME }, builderHasRun: true }] })

    useStore.getState().selectBuilderRelation(users)
    expect(selectActiveSession(useStore.getState()).builder).toEqual({
      table: users,
      timeColumn: null,
      timeBucket: 'day',
      timeRange: undefined,
      seriesColumns: []
    })
  })

  it('matches the Builder dropdown and object-browser relation-selection state', async () => {
    const { useStore, selectActiveSession } = await setup()
    const original = { table: events, timeColumn: 'created_at', timeBucket: 'week' as const, seriesColumns: ['kind'], timeRange: ALL_TIME }
    const session = selectActiveSession(useStore.getState())
    useStore.setState({ tabs: [{ ...session, builder: original }] })
    useStore.getState().setBuilder({ table: users, timeColumn: null, timeBucket: 'day', timeRange: undefined, seriesColumns: [] })
    const dropdownBuilder = selectActiveSession(useStore.getState()).builder

    useStore.setState((state) => ({ tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, builder: original } : tab) }))
    useStore.getState().selectBuilderRelation(users)

    expect(selectActiveSession(useStore.getState()).builder).toEqual(dropdownBuilder)
    expect(dropdownBuilder.timeRange).toBeUndefined()
  })
})
