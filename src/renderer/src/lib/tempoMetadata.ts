import { api } from './api'

const valueRequests = new Map<string, Promise<string[]>>()

export function resetTempoMetadataCache(): void {
  valueRequests.clear()
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
