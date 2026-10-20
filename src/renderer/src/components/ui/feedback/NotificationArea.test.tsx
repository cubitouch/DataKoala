// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotificationArea,
  notify,
} from '@components/ui/feedback/NotificationArea'
import { selectActiveSession, useStore } from '@store/useStore'
import { patchActiveTestSession, resetTestStore } from '@test/sessionTestUtils'

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

  it.each([undefined, 6000])(
    'keeps focused, expanded details until dismissed (duration=%s)',
    (duration) => {
      render(
        <>
          <button>Copy source</button>
          <NotificationArea />
        </>,
      )
      const source = screen.getByRole('button', { name: 'Copy source' })
      source.focus()
      act(() =>
        notify({
          message: 'Copy failed',
          details: 'Permission denied',
          tone: 'error',
          duration,
        }),
      )
      const summary = screen.getByText('Details')
      fireEvent.click(summary)
      summary.focus()
      expect(summary.closest('details')?.open).toBe(true)
      act(() => vi.advanceTimersByTime(60_000))
      expect(screen.getByRole('alert').textContent).toContain(
        'Permission denied',
      )
      expect(document.activeElement).toBe(summary)
      const dismiss = screen.getByRole('button', {
        name: 'Dismiss notification',
      })
      dismiss.focus()
      fireEvent.click(dismiss)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(document.activeElement).toBe(source)
    },
  )

  it('cancels an old transient timer when detailed feedback replaces it', () => {
    const view = render(<NotificationArea />)
    act(() => notify({ message: 'Old success', duration: 100 }))
    act(() =>
      notify({
        message: 'Export failed',
        details: 'File permission denied',
        tone: 'error',
      }),
    )
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('alert').textContent).toContain('Export failed')
    expect(vi.getTimerCount()).toBe(0)
    act(() => notify({ message: 'Retry succeeded', duration: 500 }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Dismiss notification' }),
    ).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('surfaces Builder filter-removal notices through the notification area and consumes the inline notice', () => {
    render(<NotificationArea />)
    act(() =>
      patchActiveTestSession({
        builderFilterNotice: {
          id: 7,
          message: 'Removed filter because it was removed from the Series.',
        },
      }),
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Removed filter because it was removed from the Series.',
    )
    expect(
      selectActiveSession(useStore.getState()).builderFilterNotice,
    ).toBeNull()
  })
})

it('keeps transport details behind a keyboard-accessible disclosure', () => {
  render(<NotificationArea />)
  act(() =>
    notify({
      message: 'Could not copy to clipboard. Try Copy again.',
      details: 'Clipboard permission denied',
      tone: 'error',
    }),
  )
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByText('Details').tagName).toBe('SUMMARY')
  expect(
    screen.getByText('Clipboard permission denied').closest('details'),
  ).toBeTruthy()
})
