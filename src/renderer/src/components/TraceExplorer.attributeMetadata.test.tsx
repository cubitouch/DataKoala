// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { attributeValues, attributes } = vi.hoisted(() => ({ attributeValues: vi.fn(), attributes: vi.fn() }))
vi.mock('../lib/api', () => ({ api: {
  tempoPerformanceEnabled: false,
  connections: { tempo: { attributeValues, attributes } },
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

describe('Trace Explorer attribute facet metadata', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    resetTempoMetadataCache()
    attributes.mockReset().mockResolvedValue([{ scope: 'resource', name: 'cloud.region', traceql: 'resource.cloud.region' }])
    attributeValues.mockReset()
    resetTestStore({ connected: true, connectionGeneration: 7 })
    patchActiveTestSession({ connectionProfileId: 'tempo-1', queryMode: 'builder', sql: '{ resource.service.name = "checkout" && resource.cloud.region = "eu-west-1" }' })
    setActiveTestMetadata([], 'loaded', null, 'tempo-1')
  })
  afterEach(cleanup)

  it('narrows discovery with other Builder filters and ignores an old-generation response', async () => {
    const oldValues = deferred<string[]>()
    attributeValues.mockReturnValueOnce(oldValues.promise).mockResolvedValueOnce(['eu-central-1'])
    const view = render(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledWith('tempo-1', 'resource.cloud.region', '{ resource.service.name = "checkout" }'))

    useStore.setState({ connectionGeneration: 8 })
    view.rerender(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledTimes(2))
    oldValues.resolve(['stale-region'])

    fireEvent.click(screen.getByText('Advanced filters'))
    fireEvent.click(screen.getByRole('combobox', { name: /resource.cloud.region values/ }))
    expect(await screen.findByText('eu-central-1')).toBeTruthy()
    expect(screen.queryByText('stale-region')).toBeNull()
  })

  it('shows the custom-value empty state only after tag discovery returns no values', async () => {
    const values = deferred<string[]>()
    attributeValues.mockReturnValueOnce(values.promise)
    render(<TraceExplorer connectionId="tempo-1" />)
    await waitFor(() => expect(attributeValues).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByText('Advanced filters'))
    fireEvent.click(screen.getByRole('combobox', { name: /resource.cloud.region values/ }))
    expect(screen.getByText('Loading values…')).toBeTruthy()
    values.resolve([])
    expect(await screen.findByText('No discovered values. Type a custom value.')).toBeTruthy()
  })
})
