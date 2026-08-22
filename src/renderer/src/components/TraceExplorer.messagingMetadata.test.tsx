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
    render(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledWith('tempo-1', 'span.messaging.system'))
    expect(attributeValues).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Search results')).toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: /Messaging system/ }))
    expect(await screen.findByText('kafka')).toBeTruthy()
    expect(screen.getByText('rabbitmq')).toBeTruthy()
    const input = screen.getByRole('textbox', { name: 'Search Messaging system' })
    fireEvent.change(input, { target: { value: 'custom-broker' } })
    expect(screen.getByText(/Use “custom-broker”/)).toBeTruthy()
  })

  it('does not leak values across connection generations', async () => {
    const view = render(<TraceExplorer connectionId="tempo-1" />)
    await screen.findByText('Generated TraceQL')
    await waitFor(() => expect(attributeValues).toHaveBeenCalledTimes(1))
    attributeValues.mockResolvedValueOnce(['nats'])
    resetTestStore({ connected: true, connectionGeneration: 8 })
    patchActiveTestSession({ connectionProfileId: 'tempo-1', queryMode: 'builder', sql: '{ span.messaging.system != nil }' })
    setActiveTestMetadata([], 'loaded', null, 'tempo-1')
    view.rerender(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledTimes(2))
  })
})
