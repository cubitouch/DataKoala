import React from 'react'
void React
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryUtilityActions } from './QueryUtilityActions'
import { activeTestSession, patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

describe('QueryUtilityActions', () => {
  afterEach(() => { cleanup(); resetTestStore(); vi.restoreAllMocks() })

  it('clears only the current result and describes the action', () => {
    patchActiveTestSession({ sql: 'select 1', result: { columns: [], rows: [], rowCount: 0, durationMs: 1 } })
    render(<QueryUtilityActions />)
    const clear = screen.getByRole('button', { name: 'Clear results' })
    expect(clear.title).toBe('Clear the current result without changing the query.')
    fireEvent.click(clear)
    expect(activeTestSession().result).toBeNull()
    expect(activeTestSession().sql).toBe('select 1')
  })

  it('preserves the existing confirmation before resetting the active tab', () => {
    patchActiveTestSession({ title: 'Metrics', sql: 'select 1' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<QueryUtilityActions />)
    const reset = screen.getByRole('button', { name: 'Reset query' })
    expect(reset.title).toBe("Reset the current tab's query and Builder state.")
    fireEvent.click(reset)
    expect(window.confirm).toHaveBeenCalledWith('Reset Metrics to a fresh query?')
    expect(activeTestSession().sql).toBe('select now();')
  })
})
