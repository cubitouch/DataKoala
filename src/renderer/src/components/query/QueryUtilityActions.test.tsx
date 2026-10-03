// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createQuerySession, useStore } from '@store/useStore'
import { QueryUtilityActions } from './QueryUtilityActions'
import {
  activeTestSession,
  patchActiveTestSession,
  resetTestStore,
} from '@test/sessionTestUtils'

const result = { columns: [], rows: [], rowCount: 0, durationMs: 1 }
const openReset = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Reset query' }))
const confirmReset = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Reset exploration' }))

describe('QueryUtilityActions', () => {
  afterEach(() => {
    cleanup()
    resetTestStore()
    vi.restoreAllMocks()
  })

  it.each(['Cancel', 'Escape', 'backdrop'])(
    'leaves all state untouched when dismissed with %s',
    (dismiss) => {
      patchActiveTestSession({ title: 'Metrics', sql: 'select 1', result })
      const before = activeTestSession()
      const onBeforeReset = vi.fn()
      const systemConfirm = vi.spyOn(window, 'confirm')
      render(<QueryUtilityActions onBeforeReset={onBeforeReset} />)
      expect(screen.queryByRole('button', { name: 'Clear results' })).toBeNull()
      openReset()
      expect(screen.getByRole('dialog').textContent).toContain(
        'query, Builder state, and current results',
      )
      if (dismiss === 'Cancel')
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      else if (dismiss === 'Escape')
        fireEvent.keyDown(document, { key: 'Escape' })
      else fireEvent.mouseDown(document.querySelector('[data-modal-backdrop]')!)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(activeTestSession()).toBe(before)
      expect(onBeforeReset).not.toHaveBeenCalled()
      expect(systemConfirm).not.toHaveBeenCalled()
    },
  )

  it.each(['sql', 'builder'] as const)(
    'clears query, builders and result selections together in %s mode',
    (queryMode) => {
      const range = {
        kind: 'rolling' as const,
        amount: 30 as const,
        unit: 'day' as const,
      }
      const initial = activeTestSession()
      patchActiveTestSession({
        title: 'Metrics',
        connectionProfileId: 'saved-connection',
        queryMode,
        sql: 'select 1',
        result,
        builder: {
          ...initial.builder,
          table: { schema: 'public', name: 'events' },
          timeRange: range,
        },
        promqlBuilder: {
          ...initial.promqlBuilder,
          metric: 'http_requests_total',
        },
        lokiBuilder: {
          ...initial.lokiBuilder,
          labelMatchers: [{ label: 'app', operator: '=', value: 'api' }],
        },
        tempoBuilder: { ...initial.tempoBuilder, service: 'api' },
        prometheusTimeRange: range,
        lokiTimeRange: range,
        tempoTimeRange: range,
        seriesVisibility: { hidden: false },
        pendingResult: result,
        explainText: 'plan',
        showExplain: true,
      })
      const onBeforeReset = vi.fn()
      render(<QueryUtilityActions onBeforeReset={onBeforeReset} />)
      openReset()
      expect(activeTestSession().result).toBe(result)
      confirmReset()
      const after = activeTestSession()
      expect(after.sql).toBe('')
      expect(after.manualQueryPristine).toBe(false)
      expect(after.queryMode).toBe(queryMode)
      expect(after.builder.table).toBeNull()
      expect(after.promqlBuilder.metric).toBe('')
      expect(after.lokiBuilder.labelMatchers).toEqual([])
      expect(after.tempoBuilder.service).toBe('')
      expect(after.result).toBeNull()
      expect(after.pendingResult).toBeNull()
      expect(after.seriesVisibility).toEqual({})
      expect(after.sqlResultFilters).toEqual([])
      expect(after.builderResultFilters).toEqual([])
      expect(after.explainText).toBeNull()
      expect(after.builder.timeRange).toEqual(range)
      expect(after.prometheusTimeRange).toEqual(range)
      expect(after.lokiTimeRange).toEqual(range)
      expect(after.tempoTimeRange).toEqual(range)
      expect(after.connectionProfileId).toBe('saved-connection')
      expect(onBeforeReset).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog')).toBeNull()
    },
  )

  it('does not reset another tab if the active tab changes while confirming', () => {
    patchActiveTestSession({ sql: 'select 1', result })
    const first = activeTestSession()
    const second = createQuerySession(2, { sql: 'select 2' })
    render(<QueryUtilityActions />)
    openReset()
    act(() =>
      useStore.setState({ tabs: [first, second], activeTabId: second.id }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useStore.getState().tabs).toEqual([first, second])
  })

  it('prevents resetting an in-flight SQL or Prometheus query', () => {
    patchActiveTestSession({ running: true, sql: 'select 1', result })
    render(<QueryUtilityActions />)
    openReset()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(activeTestSession().running).toBe(true)
  })
})
