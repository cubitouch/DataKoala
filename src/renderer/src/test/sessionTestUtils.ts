import type { DatabaseSchemaNode } from '@shared/types'
import { selectActiveSession, useStore, type AppState, type ConnectionMetadataState, type QuerySession } from '../store/useStore'

export function activeTestSession(): QuerySession {
  return selectActiveSession(useStore.getState())
}

export function patchActiveTestSession(patch: Partial<QuerySession>): void {
  const state = useStore.getState()
  useStore.setState({
    tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? { ...tab, ...patch } : tab)
  })
}

export function replaceActiveTestSession(session: QuerySession): void {
  const state = useStore.getState()
  useStore.setState({
    tabs: state.tabs.map((tab) => tab.id === state.activeTabId ? session : tab)
  })
}

export function setActiveTestMetadata(
  schemas: DatabaseSchemaNode[],
  status: ConnectionMetadataState['status'] = 'loaded',
  error: string | null = null,
  profileId = useStore.getState().activeProfileId ?? 'test-profile'
): void {
  const state = useStore.getState()
  useStore.setState({
    activeProfileId: profileId,
    metadataByProfileId: {
      ...state.metadataByProfileId,
      [profileId]: { schemas, status, error, isStale: false }
    }
  })
}

export function resetTestStore(patch: Partial<AppState> = {}): void {
  const fresh = useStore.getInitialState()
  useStore.setState({ ...fresh, ...patch }, true)
}
