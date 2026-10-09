import type { DatabaseSchemaNode } from '@shared/types'
import {
  selectActiveSession,
  useStore,
  type AppState,
  type ConnectionMetadataState,
  type QuerySession,
} from '@store/useStore'

export function activeTestSession(): QuerySession {
  return selectActiveSession(useStore.getState())
}

export function patchActiveTestSession(patch: Partial<QuerySession>): void {
  const state = useStore.getState()
  if (
    typeof patch.connectionProfileId === 'string' &&
    !state.connectionStateByProfileId[patch.connectionProfileId]
  )
    useStore.setState((current) => ({
      connectionStateByProfileId: {
        ...current.connectionStateByProfileId,
        [patch.connectionProfileId!]: {
          status: 'connected',
          generation: 1,
          error: null,
          serverVersion: null,
        },
      },
    }))
  const latest = useStore.getState()
  useStore.setState({
    tabs: latest.tabs.map((tab) =>
      tab.id === latest.activeTabId ? { ...tab, ...patch } : tab,
    ),
  })
}

export function replaceActiveTestSession(session: QuerySession): void {
  const state = useStore.getState()
  useStore.setState({
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId ? session : tab,
    ),
  })
}

export function setActiveTestMetadata(
  schemas: DatabaseSchemaNode[],
  status: ConnectionMetadataState['status'] = 'loaded',
  error: string | null = null,
  profileId = selectActiveSession(useStore.getState()).connectionProfileId ??
    'test-profile',
): void {
  const state = useStore.getState()
  useStore.setState({
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? { ...tab, connectionProfileId: profileId }
        : tab,
    ),
    metadataByProfileId: {
      ...state.metadataByProfileId,
      [profileId]: { schemas, status, error, isStale: false },
    },
  })
}

export function resetTestStore(patch: Partial<AppState> = {}): void {
  const fresh = useStore.getInitialState()
  useStore.setState({ ...fresh, ...patch }, true)
}
