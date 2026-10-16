import type { LokiMetadataRequest } from '@shared/loki.ts'
import { api } from './api.ts'

const cache = new Map<string, Promise<string[]>>()
const key = (...values: unknown[]) => JSON.stringify(values)

export function lokiLabels(
  connectionId: string,
  request: LokiMetadataRequest,
  generation = 0,
): Promise<string[]> {
  const cacheKey = key(
    'labels',
    connectionId,
    request.start,
    request.end,
    request.selector ?? '',
    generation,
  )
  const previous = cache.get(cacheKey)
  if (previous) return previous
  const pending = api.connections.loki
    .labels(connectionId, request)
    .catch((error) => {
      if (cache.get(cacheKey) === pending) cache.delete(cacheKey)
      throw error
    })
  cache.set(cacheKey, pending)
  return pending
}

export function lokiLabelValues(
  connectionId: string,
  label: string,
  request: LokiMetadataRequest,
  generation = 0,
): Promise<string[]> {
  const cacheKey = key(
    'values',
    connectionId,
    request.start,
    request.end,
    request.selector ?? '',
    label,
    generation,
  )
  const previous = cache.get(cacheKey)
  if (previous) return previous
  const pending = api.connections.loki
    .labelValues(connectionId, label, request)
    .catch((error) => {
      if (cache.get(cacheKey) === pending) cache.delete(cacheKey)
      throw error
    })
  cache.set(cacheKey, pending)
  return pending
}

export function clearLokiMetadataCache(): void {
  cache.clear()
}

export function invalidateLokiMetadata(connectionId: string): void {
  for (const cacheKey of cache.keys()) {
    const parsed = JSON.parse(cacheKey) as unknown[]
    if (parsed[1] === connectionId) cache.delete(cacheKey)
  }
}
