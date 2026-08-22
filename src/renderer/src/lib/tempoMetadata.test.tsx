import { beforeEach, describe, expect, it, vi } from 'vitest'

const { attributeValues } = vi.hoisted(() => ({ attributeValues: vi.fn() }))
vi.mock('./api', () => ({ api: { connections: { tempo: { attributeValues } } } }))

import { resetTempoMetadataCache, tempoAttributeValues } from './tempoMetadata'

describe('Tempo metadata cache', () => {
  beforeEach(() => { resetTempoMetadataCache(); attributeValues.mockReset() })

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
