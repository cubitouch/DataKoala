import { beforeEach, describe, expect, it, vi } from 'vitest'

const { attributeValues, attributes } = vi.hoisted(() => ({
  attributeValues: vi.fn(),
  attributes: vi.fn(),
}))
vi.mock('./api', () => ({
  api: { connections: { tempo: { attributeValues, attributes } } },
}))

import {
  resetTempoMetadataCache,
  invalidateTempoMetadata,
  tempoAttributes,
  tempoAttributeValues,
} from './tempoMetadata'

describe('Tempo metadata cache', () => {
  beforeEach(() => {
    resetTempoMetadataCache()
    attributeValues.mockReset()
    attributes.mockReset()
  })

  it('coalesces attribute names and separates generations and contexts', async () => {
    attributes.mockResolvedValue([
      {
        scope: 'resource',
        name: 'cloud.region',
        traceql: 'resource.cloud.region',
      },
    ])
    const first = tempoAttributes('tempo-a', 1, '{}')
    expect(tempoAttributes('tempo-a', 1, '{}')).toBe(first)
    await first
    await tempoAttributes('tempo-a', 2, '{}')
    await tempoAttributes('tempo-a', 1, '{ true }')
    expect(attributes).toHaveBeenCalledTimes(3)
  })

  it('evicts rejected attribute-name requests', async () => {
    attributes
      .mockRejectedValueOnce(new Error('no metadata'))
      .mockResolvedValueOnce([])
    await expect(tempoAttributes('tempo-a', 1)).rejects.toThrow('no metadata')
    await expect(tempoAttributes('tempo-a', 1)).resolves.toEqual([])
  })

  it('deduplicates requests and scopes values by profile, generation, and attribute', async () => {
    attributeValues
      .mockResolvedValueOnce(['rabbitmq', 'kafka', 'kafka'])
      .mockResolvedValue(['nats'])
    const first = tempoAttributeValues('tempo-a', 1, 'span.messaging.system')
    expect(tempoAttributeValues('tempo-a', 1, 'span.messaging.system')).toBe(
      first,
    )
    await expect(first).resolves.toEqual(['kafka', 'rabbitmq'])
    await tempoAttributeValues('tempo-b', 1, 'span.messaging.system')
    await tempoAttributeValues('tempo-a', 2, 'span.messaging.system')
    expect(attributeValues).toHaveBeenCalledTimes(3)
  })

  it('includes an optional TraceQL scope in the request and cache identity', async () => {
    attributeValues.mockResolvedValue(['kafka'])
    await tempoAttributeValues(
      'tempo-a',
      1,
      'span.messaging.system',
      '{ resource.service.name = "worker" }',
    )
    await tempoAttributeValues(
      'tempo-a',
      1,
      'span.messaging.system',
      '{ resource.service.name = "api" }',
    )
    expect(attributeValues).toHaveBeenNthCalledWith(
      1,
      'tempo-a',
      'span.messaging.system',
      '{ resource.service.name = "worker" }',
    )
    expect(attributeValues).toHaveBeenNthCalledWith(
      2,
      'tempo-a',
      'span.messaging.system',
      '{ resource.service.name = "api" }',
    )
  })

  it('evicts rejected requests so retry can recover', async () => {
    attributeValues
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce(['kafka'])
    await expect(
      tempoAttributeValues('tempo-a', 1, 'span.messaging.system'),
    ).rejects.toThrow('temporarily unavailable')
    await expect(
      tempoAttributeValues('tempo-a', 1, 'span.messaging.system'),
    ).resolves.toEqual(['kafka'])
  })
})

// #365 Phase 3A: invalidated promise rejection must not evict a newer cache entry.
it.each(['attributes', 'values'] as const)(
  'preserves replacement Tempo %s cache after old rejection',
  async (operation) => {
    resetTempoMetadataCache()
    attributes.mockReset()
    attributeValues.mockReset()
    let rejectOld!: (error: Error) => void
    const backend = operation === 'attributes' ? attributes : attributeValues
    backend
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject
        }),
      )
      .mockResolvedValue([])
    const read = () =>
      operation === 'attributes'
        ? tempoAttributes('tempo-a', 1)
        : tempoAttributeValues('tempo-a', 1, 'span.messaging.system')
    const old = read()
    const rejected = expect(old).rejects.toThrow('old metadata')
    invalidateTempoMetadata('tempo-a')
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

it.each(['attributes', 'values'] as const)(
  'preserves pending replacement %s and profile isolation, and retries current failure',
  async (operation) => {
    resetTempoMetadataCache()
    attributes.mockReset()
    attributeValues.mockReset()
    const backend = operation === 'attributes' ? attributes : attributeValues
    let rejectOld!: (error: Error) => void
    let rejectNew!: (error: Error) => void
    backend
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject
        }),
      )
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectNew = reject
        }),
      )
      .mockResolvedValue([])
    const read = (profile = 'a') =>
      operation === 'attributes'
        ? tempoAttributes(profile, 1)
        : tempoAttributeValues(profile, 1, 'span.messaging.system')
    const old = read()
    const oldRejected = expect(old).rejects.toThrow('old')
    const other = read('b')
    await other
    invalidateTempoMetadata('a')
    const replacement = read()
    const newRejected = expect(replacement).rejects.toThrow('current')
    rejectOld(new Error('old'))
    await oldRejected
    expect(read()).toBe(replacement)
    expect(read('b')).toBe(other)
    expect(backend).toHaveBeenCalledTimes(3)
    rejectNew(new Error('current'))
    await newRejected
    await expect(read()).resolves.toEqual([])
    expect(backend).toHaveBeenCalledTimes(4)
    expect(read('b')).toBe(other)
  },
)
