import React from 'react'
void React
// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationArea, notify } from './NotificationArea'
import { patchActiveTestSession, resetTestStore } from '../test/sessionTestUtils'

describe('NotificationArea', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    resetTestStore()
    vi.useRealTimers()
  })

  it('renders a normal notification with status and polite semantics', () => {
    render(<NotificationArea />)
    act(() => notify({ message: 'Query completed' }))
    const notification = screen.getByRole('status')
    expect(notification.textContent).toBe('Query completed')
    expect(notification.getAttribute('aria-live')).toBe('polite')
  })

  it('renders an error notification with alert and assertive semantics', () => {
    render(<NotificationArea />)
    act(() => notify({ message: 'Query failed', tone: 'error' }))
    const notification = screen.getByRole('alert')
    expect(notification.textContent).toBe('Query failed')
    expect(notification.getAttribute('aria-live')).toBe('assertive')
  })

  it('replaces an earlier notification with a later one', () => {
    render(<NotificationArea />)
    act(() => notify({ message: 'First' }))
    act(() => notify({ message: 'Second' }))
    expect(screen.queryByText('First')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Second')
  })

  it('dismisses a notification when its timer expires', () => {
    render(<NotificationArea />)
    act(() => notify({ message: 'Temporary', duration: 500 }))
    act(() => vi.advanceTimersByTime(499))
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('surfaces Builder filter-removal notices through the notification area and consumes the inline notice', () => {
    render(<NotificationArea />)
    act(() => patchActiveTestSession({ builderFilterNotice: { id: 7, message: 'Removed filter because it was removed from the Series.' } }))
    expect(screen.getByRole('status').textContent).toBe('Removed filter because it was removed from the Series.')
    expect(useBuilderNotice()).toBeNull()
  })
})

function useBuilderNotice() {
  const state = require('../store/useStore') as typeof import('../store/useStore')
  return state.selectActiveSession(state.useStore.getState()).builderFilterNotice
}
