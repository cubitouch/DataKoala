// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { NotificationArea } from '../components/NotificationArea'
import { notifyChartCopyResult } from './chartCopyNotification'
import { resetTestStore } from '../test/sessionTestUtils'

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
