import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ labelValues: vi.fn() }))
vi.mock('./api', () => ({ api: { connections: { loki: { labels: vi.fn(), labelValues: mocks.labelValues } } } }))
import { clearLokiMetadataCache, lokiLabelValues } from './lokiMetadata'

afterEach(() => mocks.labelValues.mockReset())
describe('Loki dependent metadata', () => {
  it('excludes the requested labels own matcher and caches it', async () => {
    clearLokiMetadataCache(); mocks.labelValues.mockResolvedValue(['checkout'])
    const request = { start: 'a', end: 'b' }
    const matchers = [{ label: 'environment', operator: '=' as const, value: 'prod' }, { label: 'service', operator: '=' as const, value: 'checkout' }]
    expect(await lokiLabelValues('loki', 'service', request, matchers)).toEqual(['checkout'])
    await lokiLabelValues('loki', 'service', request, matchers)
    expect(mocks.labelValues).toHaveBeenCalledTimes(1)
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'service', { start: 'a', end: 'b', selector: '{environment="prod"}' })
  })
})
