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

it('discovers sidebar values independently of Builder matchers', async () => {
  mocks.labels.mockResolvedValue(['service_name'])
  mocks.labelValues.mockResolvedValue(['checkout'])
  const sessionId = useStore.getState().activeTabId
  const setMatchersAndRange = (labelMatchers: Array<{ label: string; operator: '=' | '!='; value: string }>, amount: 1 | 3 | 6) => {
    const session = useStore.getState().tabs.find(({ id }) => id === sessionId)!
    useStore.getState().setLokiState({
      lokiBuilder: { ...session.lokiBuilder, labelMatchers },
      lokiTimeRange: { kind: 'rolling', amount, unit: 'hour' }
    }, sessionId)
  }

  act(() => setMatchersAndRange([{ label: 'environment', operator: '=', value: 'production' }], 1))
  render(<LokiSidebarTree connectionId="loki" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Expand service_name' }))
  expect(await screen.findByRole('button', { name: 'checkout' })).toBeTruthy()

  act(() => setMatchersAndRange([{ label: 'environment', operator: '!=', value: 'production' }], 3))
  fireEvent.click(await screen.findByRole('button', { name: 'Expand service_name' }))
  expect(await screen.findByRole('button', { name: 'checkout' })).toBeTruthy()

  act(() => setMatchersAndRange([], 6))
  fireEvent.click(await screen.findByRole('button', { name: 'Expand service_name' }))
  expect(await screen.findByRole('button', { name: 'checkout' })).toBeTruthy()

  await waitFor(() => expect(mocks.labelValues).toHaveBeenCalledTimes(3))
  for (const [connectionId, label, request] of mocks.labelValues.mock.calls) {
    expect(connectionId).toBe('loki')
    expect(label).toBe('service_name')
    expect(request).not.toHaveProperty('selector')
    expect(request).toEqual(expect.objectContaining({ start: expect.any(String), end: expect.any(String) }))
  }
})
