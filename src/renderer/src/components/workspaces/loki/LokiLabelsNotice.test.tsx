import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LokiLabelsNotice } from './LokiLabelsNotice'
afterEach(cleanup)
it('shows persistent failure once with optional diagnostics and an explicit retry', () => {
  const retry = vi.fn().mockResolvedValue(undefined)
  render(
    <LokiLabelsNotice
      status="error"
      error="technical config diagnostic"
      onRetry={retry}
    />,
  )
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(
    screen.getByText('technical config diagnostic').closest('details')?.open,
  ).toBe(false)
  expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry labels' }))
  expect(retry).toHaveBeenCalledTimes(1)
})
it('renders retry progress and successful recovery without a remaining error', () => {
  const retry = vi.fn().mockResolvedValue(undefined)
  const view = render(
    <LokiLabelsNotice status="error" error="failure" onRetry={retry} />,
  )
  view.rerender(
    <LokiLabelsNotice status="loading" error={null} onRetry={retry} />,
  )
  expect(
    (screen.getByRole('button', { name: 'Retrying…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
  view.rerender(
    <LokiLabelsNotice status="loaded" error={null} onRetry={retry} />,
  )
  expect(screen.getByText('Loki labels refreshed')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Retry labels' })).toBeNull()
})

it('distinguishes expired authentication from a metadata read race without claiming disconnection', () => {
  render(
    <LokiLabelsNotice
      status="error"
      error="gcx authentication has expired"
      onRetry={vi.fn()}
    />,
  )
  expect(
    screen.getByText('Loki label authentication needs attention'),
  ).toBeTruthy()
  expect(screen.getByText(/Run gcx login, then retry labels/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull()
})
