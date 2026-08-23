import { api } from './api'
import type { TempoAttribute } from '@shared/tempo'

const valueRequests = new Map<string, Promise<string[]>>()
const attributeRequests = new Map<string, Promise<TempoAttribute[]>>()

export function resetTempoMetadataCache(): void {
  valueRequests.clear()
  attributeRequests.clear()
}

export function tempoAttributes(profileId: string, connectionGeneration: number, query?: string): Promise<TempoAttribute[]> {
  const key = `${profileId}\0${connectionGeneration}\0${query ?? ''}`
  const existing = attributeRequests.get(key)
  if (existing) return existing
  const request = (query === undefined ? api.connections.tempo.attributes(profileId) : api.connections.tempo.attributes(profileId, query))
    .then((attributes) => [...new Map(attributes.map((attribute) => [attribute.traceql, attribute])).values()].sort((a, b) => a.traceql.localeCompare(b.traceql)))
    .catch((error: unknown) => { attributeRequests.delete(key); throw error })
  attributeRequests.set(key, request)
  return request
}

/** Cache is connection-generation scoped; gcx traces labels has no time-range flags. */
export function tempoAttributeValues(profileId: string, connectionGeneration: number, attribute: string, query?: string): Promise<string[]> {
  const key = `${profileId}\0${connectionGeneration}\0${attribute}\0${query ?? ''}`
  const existing = valueRequests.get(key)
  if (existing) return existing
  const request = (query === undefined
    ? api.connections.tempo.attributeValues(profileId, attribute)
    : api.connections.tempo.attributeValues(profileId, attribute, query))
    .then((values) => [...new Set(values)].sort((left, right) => left.localeCompare(right)))
    .catch((error: unknown) => { valueRequests.delete(key); throw error })
  valueRequests.set(key, request)
  return request
}
