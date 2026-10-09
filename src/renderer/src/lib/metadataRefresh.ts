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

export function refreshConnectionMetadata(
  profileId: string,
  store: StoreAccess,
): Promise<void> {
  const joined = inFlight.get(profileId)
  if (joined) return joined
  const initial = store.getState()
  const connection = initial.connectionStateByProfileId[profileId]
  if (connection?.status !== 'connected' && connection?.status !== 'idle')
    return Promise.resolve()
  const generation = connection.generation
  store.setState((state) => {
    const old = state.metadataByProfileId[profileId]
    return {
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [profileId]:
          old?.status === 'loaded'
            ? { ...old, refreshing: true, refreshError: null }
            : {
                ...(old ?? { schemas: [], isStale: false }),
                status: 'loading' as const,
                error: null,
                refreshing: true,
                refreshError: null,
              },
      },
    }
  })
  const promise = (async () => {
    try {
      await api.connections.refreshMetadata(profileId)
      const schemas = await loadConnectionMetadata(profileId)
      const current = store.getState()
      const currentConnection = current.connectionStateByProfileId[profileId]
      if (
        !currentConnection ||
        currentConnection.generation !== generation ||
        (currentConnection.status !== 'connected' &&
          currentConnection.status !== 'idle')
      )
        return
      store.setState((state) => {
        const old = state.metadataByProfileId[profileId]
        return {
          metadataByProfileId: {
            ...state.metadataByProfileId,
            [profileId]: {
              ...(old ?? { schemas: [] }),
              schemas,
              status: 'loaded' as const,
              error: null,
              isStale: false,
              refreshing: false,
              refreshError: null,
              revision: (old?.revision ?? 0) + 1,
            },
          },
        }
      })
      invalidateTempoMetadata(profileId)
      invalidateLokiMetadata(profileId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.setState((state) => {
        const old = state.metadataByProfileId[profileId]
        const latest = state.connectionStateByProfileId[profileId]
        if (
          !latest ||
          latest.generation !== generation ||
          (latest.status !== 'connected' && latest.status !== 'idle')
        )
          return {}
        const metadata =
          old?.status === 'loaded'
            ? { ...old, refreshing: false, refreshError: message }
            : {
                schemas: [],
                status: 'error' as const,
                error: message,
                isStale: false,
                refreshing: false,
                refreshError: null,
              }
        return {
          metadataByProfileId: {
            ...state.metadataByProfileId,
            [profileId]: metadata,
          },
        }
      })
    } finally {
      inFlight.delete(profileId)
    }
  })()
  inFlight.set(profileId, promise)
  return promise
}
