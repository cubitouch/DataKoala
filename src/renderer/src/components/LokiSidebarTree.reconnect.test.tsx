import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ labels: vi.fn(), labelValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: { connections: { loki: { labels: mocks.labels, labelValues: mocks.labelValues } } } }))

import { LokiSidebarTree } from './LokiSidebarTree'
import { clearLokiLabelsResources } from '../lib/useLokiLabelsResource'
import { clearLokiMetadataCache } from '../lib/lokiMetadata'
import { createQuerySession, useStore } from '../store/useStore'

beforeEach(() => {
  const tab = createQuerySession(1, { id: 'loki-sidebar', connectionProfileId: 'loki', queryMode: 'builder' })
  useStore.setState({ tabs: [tab], activeTabId: tab.id, activeProfileId: 'loki', connected: true, connecting: false, connectionStatus: 'connected', connectionGeneration: 1 })
  mocks.labels.mockReset().mockResolvedValue(['app'])
  mocks.labelValues.mockReset()
})
afterEach(() => { cleanup(); clearLokiLabelsResources(); clearLokiMetadataCache() })

it('ignores an expanded value request after disconnect and refreshes on reconnect', async () => {
  let rejectValue!: (reason: unknown) => void
  const pending = new Promise<string[]>((_, reject) => { rejectValue = reject })
  mocks.labelValues.mockReturnValueOnce(pending).mockResolvedValueOnce(['api'])
  render(<LokiSidebarTree connectionId="loki" />)
  const expand = await screen.findByRole('button', { name: 'Expand app' })
  fireEvent.click(expand)
  await waitFor(() => expect(mocks.labelValues).toHaveBeenCalledTimes(1))

  act(() => useStore.setState({ connected: false, connectionStatus: 'reconnecting', connectionGeneration: 2 }))
  await act(async () => { rejectValue(new Error('This profile is not connected')); await pending.catch(() => undefined) })
  expect(screen.queryByText(/This profile is not connected/)).toBeNull()
  expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  expect(screen.getByText('Metadata unavailable')).toBeTruthy()
  expect(mocks.labels).toHaveBeenCalledTimes(1)

  act(() => useStore.setState({ connected: true, connectionStatus: 'connected', connectionGeneration: 3 }))
  await waitFor(() => expect(mocks.labels).toHaveBeenCalledTimes(2))
  const refreshedExpand = await screen.findByRole('button', { name: 'Expand app' })
  expect(refreshedExpand.hasAttribute('disabled')).toBe(false)
  fireEvent.click(refreshedExpand)
  await waitFor(() => expect(mocks.labelValues).toHaveBeenCalledTimes(2))
  expect(await screen.findByRole('treeitem', { name: 'api' })).toBeTruthy()
})

it('keeps connected metadata failures actionable', async () => {
  mocks.labels.mockRejectedValue(new Error('upstream denied'))
  render(<LokiSidebarTree connectionId="loki" />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText('upstream denied')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
})
