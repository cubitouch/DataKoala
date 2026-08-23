import { beforeEach, describe, expect, it, vi } from 'vitest'

const { attributeValues, attributes } = vi.hoisted(() => ({ attributeValues: vi.fn(), attributes: vi.fn() }))
vi.mock('./api', () => ({ api: { connections: { tempo: { attributeValues, attributes } } } }))

import { resetTempoMetadataCache, tempoAttributes, tempoAttributeValues } from './tempoMetadata'

describe('Tempo metadata cache', () => {
  beforeEach(() => { resetTempoMetadataCache(); attributeValues.mockReset(); attributes.mockReset() })

  it('coalesces attribute names and separates generations and contexts', async () => {
    attributes.mockResolvedValue([{ scope: 'resource', name: 'cloud.region', traceql: 'resource.cloud.region' }])
    const first = tempoAttributes('tempo-a', 1, '{}')
    expect(tempoAttributes('tempo-a', 1, '{}')).toBe(first)
    await first
    await tempoAttributes('tempo-a', 2, '{}')
    await tempoAttributes('tempo-a', 1, '{ true }')
    expect(attributes).toHaveBeenCalledTimes(3)
  })

  it('evicts rejected attribute-name requests', async () => {
    attributes.mockRejectedValueOnce(new Error('no metadata')).mockResolvedValueOnce([])
    await expect(tempoAttributes('tempo-a', 1)).rejects.toThrow('no metadata')
    await expect(tempoAttributes('tempo-a', 1)).resolves.toEqual([])
  })

  it('deduplicates requests and scopes values by profile, generation, and attribute', async () => {
    attributeValues.mockResolvedValueOnce(['rabbitmq', 'kafka', 'kafka']).mockResolvedValue(['nats'])
    const first = tempoAttributeValues('tempo-a', 1, 'span.messaging.system')
    expect(tempoAttributeValues('tempo-a', 1, 'span.messaging.system')).toBe(first)
    await expect(first).resolves.toEqual(['kafka', 'rabbitmq'])
    await tempoAttributeValues('tempo-b', 1, 'span.messaging.system')
    await tempoAttributeValues('tempo-a', 2, 'span.messaging.system')
    expect(attributeValues).toHaveBeenCalledTimes(3)
  })

  it('includes an optional TraceQL scope in the request and cache identity', async () => {
    attributeValues.mockResolvedValue(['kafka'])
    await tempoAttributeValues('tempo-a', 1, 'span.messaging.system', '{ resource.service.name = "worker" }')
    await tempoAttributeValues('tempo-a', 1, 'span.messaging.system', '{ resource.service.name = "api" }')
    expect(attributeValues).toHaveBeenNthCalledWith(1, 'tempo-a', 'span.messaging.system', '{ resource.service.name = "worker" }')
    expect(attributeValues).toHaveBeenNthCalledWith(2, 'tempo-a', 'span.messaging.system', '{ resource.service.name = "api" }')
  })

  it('evicts rejected requests so retry can recover', async () => {
    attributeValues.mockRejectedValueOnce(new Error('temporarily unavailable')).mockResolvedValueOnce(['kafka'])
    await expect(tempoAttributeValues('tempo-a', 1, 'span.messaging.system')).rejects.toThrow('temporarily unavailable')
    await expect(tempoAttributeValues('tempo-a', 1, 'span.messaging.system')).resolves.toEqual(['kafka'])
  })
})
