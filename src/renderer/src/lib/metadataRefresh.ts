import { api } from './api'
import { loadConnectionMetadata } from './connectionMetadata'
import { invalidateLokiMetadata } from './lokiMetadata'
import { invalidateTempoMetadata } from './tempoMetadata'
import { useStore } from '../store/useStore'

const inFlight = new Map<string, Promise<void>>()

/** Refresh a live session in place, retaining all usable metadata until replacement succeeds. */
export function refreshConnectionMetadata(profileId: string): Promise<void> {
  const joined = inFlight.get(profileId)
  if (joined) return joined
  const initial = useStore.getState()
  if (!initial.connected || initial.activeProfileId !== profileId) return Promise.resolve()
  const generation = initial.connectionGeneration
  useStore.setState((state) => {
    const old = state.metadataByProfileId[profileId]
    return old ? { metadataByProfileId: { ...state.metadataByProfileId, [profileId]: { ...old, refreshing: true, refreshError: null } } } : {}
  })
  const promise = (async () => {
    try {
      await api.connections.refreshMetadata(profileId)
      const schemas = await loadConnectionMetadata(profileId)
      const current = useStore.getState()
      if (current.activeProfileId !== profileId || current.connectionGeneration !== generation || !current.connected) return
      useStore.setState((state) => {
        const old = state.metadataByProfileId[profileId]
        if (!old) return {}
        return { metadataByProfileId: { ...state.metadataByProfileId, [profileId]: {
          ...old, schemas, status: 'loaded' as const, error: null, isStale: false,
          refreshing: false, refreshError: null, revision: (old.revision ?? 0) + 1
        } } }
      })
      invalidateTempoMetadata(profileId)
      invalidateLokiMetadata(profileId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      useStore.setState((state) => {
        const old = state.metadataByProfileId[profileId]
        if (!old || state.activeProfileId !== profileId || state.connectionGeneration !== generation) return {}
        return { metadataByProfileId: { ...state.metadataByProfileId, [profileId]: { ...old, refreshing: false, refreshError: message } } }
      })
    } finally { inFlight.delete(profileId) }
  })()
  inFlight.set(profileId, promise)
  return promise
}
