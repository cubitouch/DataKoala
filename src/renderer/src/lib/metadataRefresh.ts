import { api } from './api'
import { loadConnectionMetadata } from './connectionMetadata'
import { invalidateLokiMetadata } from './lokiMetadata'
import { invalidateTempoMetadata } from './tempoMetadata'
import type { AppState } from '@store/useStore'

const inFlight = new Map<string, Promise<void>>()

/** Refresh a live session in place, retaining all usable metadata until replacement succeeds. */
type StoreAccess = {
  getState: () => AppState
  setState: (update: (state: AppState) => Partial<AppState>) => void
}

export function refreshConnectionMetadata(profileId: string, store: StoreAccess): Promise<void> {
  const joined = inFlight.get(profileId)
  if (joined) return joined
  const initial = store.getState()
  if (!initial.connected || initial.activeProfileId !== profileId) return Promise.resolve()
  const generation = initial.connectionGeneration
  store.setState((state) => {
    const old = state.metadataByProfileId[profileId]
    return old ? { metadataByProfileId: { ...state.metadataByProfileId, [profileId]: { ...old, refreshing: true, refreshError: null } } } : {}
  })
  const promise = (async () => {
    try {
      await api.connections.refreshMetadata(profileId)
      const schemas = await loadConnectionMetadata(profileId)
      const current = store.getState()
      if (current.activeProfileId !== profileId || current.connectionGeneration !== generation || !current.connected) return
      store.setState((state) => {
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
      store.setState((state) => {
        const old = state.metadataByProfileId[profileId]
        if (!old || state.activeProfileId !== profileId || state.connectionGeneration !== generation) return {}
        return { metadataByProfileId: { ...state.metadataByProfileId, [profileId]: { ...old, refreshing: false, refreshError: message } } }
      })
    } finally { inFlight.delete(profileId) }
  })()
  inFlight.set(profileId, promise)
  return promise
}
