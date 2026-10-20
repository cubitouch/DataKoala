// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { NotificationArea } from '@components/ui/feedback/NotificationArea'
import {
  notifyChartCopyResult,
  notifyChartExportResult,
} from './chartCopyNotification'
import { resetTestStore } from '@test/sessionTestUtils'

afterEach(() => {
  cleanup()
  resetTestStore()
})

it('shows successful chart copy feedback through the global notification area', () => {
  render(<NotificationArea />)
  act(() => notifyChartCopyResult(true))
  expect(screen.getByRole('status').textContent).toBe('Chart copied')
})

it('shows chart copy failures as global error notifications', () => {
  render(<NotificationArea />)
  act(() => notifyChartCopyResult(false))
  expect(screen.getByRole('alert').textContent).toBe('Could not copy chart')
})

it.each([true, false])(
  'announces chart export success=%s once with the appropriate role',
  (ok) => {
    render(<NotificationArea />)
    act(() => notifyChartExportResult(ok))
    const role = ok ? 'status' : 'alert'
    expect(screen.getAllByRole(role)).toHaveLength(1)
    expect(screen.getByRole(role).getAttribute('aria-live')).toBe(
      ok ? 'polite' : 'assertive',
    )
    expect(screen.getByRole(role).textContent).toBe(
      ok ? 'Chart exported' : 'Could not export chart. Try Export PNG again.',
    )
  },
)
