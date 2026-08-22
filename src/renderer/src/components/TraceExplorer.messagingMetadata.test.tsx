import React from 'react'
void React
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { attributeValues } = vi.hoisted(() => ({ attributeValues: vi.fn() }))
vi.mock('../lib/api', () => ({ api: {
  tempoPerformanceEnabled: false,
  connections: { tempo: { attributeValues } },
  query: { run: vi.fn() }
} }))

import { TraceExplorer } from './TraceExplorer'
import { resetTempoMetadataCache } from '../lib/tempoMetadata'
import { patchActiveTestSession, resetTestStore, setActiveTestMetadata } from '../test/sessionTestUtils'
import { useStore } from '../store/useStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('Trace Explorer messaging metadata', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    resetTempoMetadataCache()
    attributeValues.mockReset().mockResolvedValue(['rabbitmq', 'kafka'])
    resetTestStore({ connected: true, connectionGeneration: 7 })
    patchActiveTestSession({ connectionProfileId: 'tempo-1', queryMode: 'builder', sql: '{ span.messaging.system != nil }' })
    setActiveTestMetadata([], 'loaded', null, 'tempo-1')
  })
  afterEach(cleanup)

  it('loads messaging systems before any trace query and keeps the dropdown searchable/custom', async () => {
    const metadata = deferred<string[]>()
    attributeValues.mockReturnValueOnce(metadata.promise)
    render(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledWith('tempo-1', 'span.messaging.system'))
    expect(attributeValues).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Search results')).toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: /Messaging system/ }))
    const input = screen.getByRole('textbox', { name: 'Search Messaging system' })
    fireEvent.change(input, { target: { value: 'custom-broker' } })
    fireEvent.click(screen.getByText(/Use “custom-broker”/))
    expect(screen.getByRole('combobox', { name: /Messaging system: custom-broker/ })).toBeTruthy()

    metadata.resolve(['rabbitmq', 'kafka'])
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Messaging system: custom-broker/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('combobox', { name: /Messaging system: custom-broker/ }))
    expect(await screen.findByText('kafka')).toBeTruthy()
    expect(screen.getAllByText('custom-broker').length).toBeGreaterThan(0)
  })

  it('does not let a late response from an old connection generation overwrite current values', async () => {
    const oldMetadata = deferred<string[]>()
    attributeValues.mockReturnValueOnce(oldMetadata.promise).mockResolvedValueOnce(['nats'])
    const view = render(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledTimes(1))
    useStore.setState({ connectionGeneration: 8 })
    view.rerender(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('combobox', { name: /Messaging system/ }))
    expect(await screen.findByText('nats')).toBeTruthy()
    expect(screen.queryByText('kafka')).toBeNull()

    oldMetadata.resolve(['kafka'])
    await waitFor(() => expect(screen.getByText('nats')).toBeTruthy())
    expect(screen.queryByText('kafka')).toBeNull()
  })
})
