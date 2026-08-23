import type { LokiLabelMatcher, LokiMetadataRequest } from '@shared/loki'
import { selectorWithoutMatcher } from '@shared/loki-builder'
import { api } from './api'

const cache = new Map<string, Promise<string[]>>()
const key = (...values: unknown[]) => JSON.stringify(values)

export function lokiLabels(connectionId: string, request: LokiMetadataRequest): Promise<string[]> {
  const cacheKey = key('labels', connectionId, request.start, request.end, request.selector ?? '')
  const previous = cache.get(cacheKey)
  if (previous) return previous
  const pending = api.connections.loki.labels(connectionId, request).catch((error) => { cache.delete(cacheKey); throw error })
  cache.set(cacheKey, pending)
  return pending
}

export function lokiLabelValues(connectionId: string, label: string, request: Omit<LokiMetadataRequest, 'selector'>, matchers: LokiLabelMatcher[]): Promise<string[]> {
  const selector = selectorWithoutMatcher(matchers, label)
  const cacheKey = key('values', connectionId, request.start, request.end, selector ?? '', label)
  const previous = cache.get(cacheKey)
  if (previous) return previous
  const pending = api.connections.loki.labelValues(connectionId, label, { ...request, ...(selector ? { selector } : {}) }).catch((error) => { cache.delete(cacheKey); throw error })
  cache.set(cacheKey, pending)
  return pending
}

export function clearLokiMetadataCache(): void { cache.clear() }
