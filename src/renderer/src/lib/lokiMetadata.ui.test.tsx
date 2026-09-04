import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ labelValues: vi.fn() }))
vi.mock('./api.ts', () => ({ api: { connections: { loki: { labels: vi.fn(), labelValues: mocks.labelValues } } } }))
import { clearLokiMetadataCache, lokiLabelValues } from './lokiMetadata.ts'

afterEach(() => mocks.labelValues.mockReset())
describe('Loki dependent metadata', () => {
  it('passes an explicit Builder selector and caches it', async () => {
    clearLokiMetadataCache(); mocks.labelValues.mockResolvedValue(['checkout'])
    const request = { start: 'a', end: 'b' }
    expect(await lokiLabelValues('loki', 'service', { ...request, selector: '{environment="prod"}' })).toEqual(['checkout'])
    await lokiLabelValues('loki', 'service', { ...request, selector: '{environment="prod"}' })
    expect(mocks.labelValues).toHaveBeenCalledTimes(1)
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'service', { start: 'a', end: 'b', selector: '{environment="prod"}' })
  })

  it('supports unfiltered metadata discovery', async () => {
    clearLokiMetadataCache(); mocks.labelValues.mockResolvedValue(['checkout'])
    expect(await lokiLabelValues('loki', 'service_name', { start: 'a', end: 'b' })).toEqual(['checkout'])
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'service_name', { start: 'a', end: 'b' })
  })
})
