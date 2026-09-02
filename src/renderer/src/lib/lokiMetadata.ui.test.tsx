import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ labelValues: vi.fn() }))
vi.mock('./api.ts', () => ({ api: { connections: { loki: { labels: vi.fn(), labelValues: mocks.labelValues } } } }))
import { clearLokiMetadataCache, lokiLabelValues } from './lokiMetadata.ts'

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

  it('omits an exclusion-only dependent selector so metadata remains discoverable', async () => {
    clearLokiMetadataCache(); mocks.labelValues.mockResolvedValue(['checkout'])
    const matchers = [{ label: 'environment', operator: '!=' as const, value: 'production' }]
    expect(await lokiLabelValues('loki', 'service_name', { start: 'a', end: 'b' }, matchers)).toEqual(['checkout'])
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'service_name', { start: 'a', end: 'b' })
  })

  it('retains positive and negative dependencies when the selector is valid', async () => {
    clearLokiMetadataCache(); mocks.labelValues.mockResolvedValue(['checkout'])
    const matchers = [
      { label: 'service_name', operator: '=' as const, value: 'checkout' },
      { label: 'environment', operator: '!=' as const, value: 'development' }
    ]
    await lokiLabelValues('loki', 'namespace', { start: 'a', end: 'b' }, matchers)
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'namespace', { start: 'a', end: 'b', selector: '{service_name="checkout", environment!="development"}' })
  })
})
