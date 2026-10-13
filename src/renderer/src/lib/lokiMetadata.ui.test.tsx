import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ labelValues: vi.fn(), labels: vi.fn() }))
vi.mock('./api.ts', () => ({
  api: {
    connections: {
      loki: { labels: mocks.labels, labelValues: mocks.labelValues },
    },
  },
}))
import {
  clearLokiMetadataCache,
  invalidateLokiMetadata,
  lokiLabelValues,
  lokiLabels,
} from './lokiMetadata.ts'

afterEach(() => mocks.labelValues.mockReset())
describe('Loki dependent metadata', () => {
  it('passes an explicit Builder selector and caches it', async () => {
    clearLokiMetadataCache()
    mocks.labelValues.mockResolvedValue(['checkout'])
    const request = { start: 'a', end: 'b' }
    expect(
      await lokiLabelValues('loki', 'service', {
        ...request,
        selector: '{environment="prod"}',
      }),
    ).toEqual(['checkout'])
    await lokiLabelValues('loki', 'service', {
      ...request,
      selector: '{environment="prod"}',
    })
    expect(mocks.labelValues).toHaveBeenCalledTimes(1)
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'service', {
      start: 'a',
      end: 'b',
      selector: '{environment="prod"}',
    })
  })

  it('supports unfiltered metadata discovery', async () => {
    clearLokiMetadataCache()
    mocks.labelValues.mockResolvedValue(['checkout'])
    expect(
      await lokiLabelValues('loki', 'service_name', { start: 'a', end: 'b' }),
    ).toEqual(['checkout'])
    expect(mocks.labelValues).toHaveBeenCalledWith('loki', 'service_name', {
      start: 'a',
      end: 'b',
    })
  })

  it('invalidates only one profile and bypasses its resolved cache', async () => {
    clearLokiMetadataCache()
    mocks.labelValues
      .mockResolvedValueOnce(['old-a'])
      .mockResolvedValueOnce(['old-b'])
      .mockResolvedValueOnce(['new-a'])
    const request = { start: 'a', end: 'b' }
    expect(await lokiLabelValues('a', 'service', request)).toEqual(['old-a'])
    expect(await lokiLabelValues('b', 'service', request)).toEqual(['old-b'])
    invalidateLokiMetadata('a')
    expect(await lokiLabelValues('a', 'service', request)).toEqual(['new-a'])
    expect(await lokiLabelValues('b', 'service', request)).toEqual(['old-b'])
    expect(mocks.labelValues).toHaveBeenCalledTimes(3)
  })
})

// #365 Phase 3A: invalidated promise rejection must not evict a newer cache entry.
it.fails.each(['labels', 'values'] as const)(
  'preserves replacement Loki %s cache after old rejection',
  async (operation) => {
    clearLokiMetadataCache()
    mocks.labels.mockReset()
    mocks.labelValues.mockReset()
    let rejectOld!: (error: Error) => void
    const backend = operation === 'labels' ? mocks.labels : mocks.labelValues
    backend
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject
        }),
      )
      .mockResolvedValue([])
    const read = () =>
      operation === 'labels'
        ? lokiLabels('loki-a', { start: 'a', end: 'b' })
        : lokiLabelValues('loki-a', 'service', { start: 'a', end: 'b' })
    const old = read()
    const rejected = expect(old).rejects.toThrow('old metadata')
    invalidateLokiMetadata('loki-a')
    const replacement = read()
    await replacement
    rejectOld(new Error('old metadata'))
    await rejected
    const reused = read()
    await reused
    expect(backend).toHaveBeenCalledTimes(2)
    expect(reused).toBe(replacement)
  },
)
