import type { DataSourceProfile } from '@shared/types'
import { api } from './api'
import { loadConnectionMetadata } from './connectionMetadata'
import { selectSession, useStore } from '@store/useStore'
import { defaultQueryModeForDatasource, defaultQueryTextForDatasource, queryLanguageForDatasource } from './queryDefaults'

const inFlight = new Map<string, Promise<string | null>>()

function runningOnProfile(profileId: string): boolean {
  return useStore.getState().tabs.some((tab) => tab.connectionProfileId === profileId && tab.running)
}

function confirmConnectionSwitch(previousProfileId: string, nextProfileId: string): boolean {
  if (previousProfileId === nextProfileId || !runningOnProfile(previousProfileId)) return true
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  return window.confirm('A query is still running on the current connection. Running this action on another connection will stop it. Continue?')
}

async function connectForTab(desiredProfileId: string, confirmInterrupt: boolean): Promise<string | null> {
  const initial = useStore.getState()
  const profile = initial.profiles.find((candidate) => candidate.id === desiredProfileId)
  if (!profile) return null

  const previousProfileId = initial.activeProfileId
  if (confirmInterrupt && previousProfileId && previousProfileId !== desiredProfileId && !confirmConnectionSwitch(previousProfileId, desiredProfileId)) return null

  useStore.setState((state) => ({
    activeProfileId: desiredProfileId,
    connecting: true,
    connected: false,
    connectionStatus: 'connecting',
    connectionError: null,
    serverVersion: null,
    activeReconnectAttempt: null,
    connectionStateByProfileId: { ...state.connectionStateByProfileId, [desiredProfileId]: {
      status: 'connecting', generation: state.connectionStateByProfileId[desiredProfileId]?.generation ?? 0, error: null, serverVersion: null
    } }
  }))

  try {
    const result = await api.connections.connect(profile)
    if (!result.ok) {
      useStore.setState((state) => ({
        ...(state.activeProfileId === desiredProfileId ? { connected: false, connecting: false, connectionStatus: 'error' as const, connectionError: result.error, serverVersion: null } : {}),
        connectionStateByProfileId: { ...state.connectionStateByProfileId, [desiredProfileId]: { status: 'error', generation: state.connectionStateByProfileId[desiredProfileId]?.generation ?? 0, error: result.error, serverVersion: null } }
      }))
      return null
    }

    const actualId = result.id ?? desiredProfileId
    useStore.setState((state) => ({
      ...(selectSession(state, state.activeTabId)?.connectionProfileId === desiredProfileId ? {
        activeProfileId: actualId, connected: true, connecting: false, connectionStatus: 'connected' as const,
        connectionGeneration: result.generation, serverVersion: result.serverVersion, connectionError: null
      } : {}),
      connectionStateByProfileId: { ...state.connectionStateByProfileId, [actualId]: { status: 'connected', generation: result.generation, error: null, serverVersion: result.serverVersion ?? null } },
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [actualId]: {
          ...(state.metadataByProfileId[actualId] ?? { schemas: [], status: 'idle', error: null, isStale: false }),
          status: 'loading',
          error: null,
          refreshing: false,
          refreshError: null
        }
      },
      ...(actualId === desiredProfileId ? {} : {
        tabs: state.tabs.map((tab) => tab.connectionProfileId === desiredProfileId ? { ...tab, connectionProfileId: actualId } : tab)
      })
    }))

    if (actualId !== desiredProfileId) void api.connections.list().then((profiles: DataSourceProfile[]) => useStore.getState().setProfiles(profiles))
    void loadConnectionMetadata(actualId).then(
      (nodes) => useStore.getState().setMetadata(nodes, 'loaded', null, actualId),
      (error: unknown) => useStore.getState().setMetadata([], 'error', error instanceof Error ? error.message : String(error), actualId)
    )
    return actualId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useStore.setState((state) => ({
      ...(state.activeProfileId === desiredProfileId ? { connected: false, connecting: false, connectionStatus: 'error' as const, connectionError: message, serverVersion: null } : {}),
      connectionStateByProfileId: { ...state.connectionStateByProfileId, [desiredProfileId]: { status: 'error', generation: state.connectionStateByProfileId[desiredProfileId]?.generation ?? 0, error: message, serverVersion: null } }
    }))
    return null
  }
}

export async function ensureConnectionForTab(tabId: string, options: { confirmInterrupt?: boolean } = {}): Promise<string | null> {
  const state = useStore.getState()
  const session = selectSession(state, tabId)
  const desiredProfileId = session?.connectionProfileId ?? null
  if (!desiredProfileId) return null
  const connection = state.connectionStateByProfileId[desiredProfileId]
  if (connection?.status === 'connected' || connection?.status === 'idle') return desiredProfileId
  // Compatibility for restored/older state snapshots; new connections are always profile-scoped.
  if (state.activeProfileId === desiredProfileId && state.connected) return desiredProfileId
  const pending = inFlight.get(desiredProfileId)
  if (pending) return pending

  const promise = connectForTab(desiredProfileId, options.confirmInterrupt !== false)
  inFlight.set(desiredProfileId, promise)
  try {
    return await promise
  } finally {
    if (inFlight.get(desiredProfileId) === promise) inFlight.delete(desiredProfileId)
  }
}

export function bindTabConnection(tabId: string, profileId: string | null): void {
  useStore.setState((state) => ({
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId || tab.connectionProfileId === profileId) return tab
      const profile = state.profiles.find((candidate) => candidate.id === profileId)
      const previousProfile = state.profiles.find((candidate) => candidate.id === tab.connectionProfileId)
      const languageChanged = Boolean(previousProfile && profile && queryLanguageForDatasource(previousProfile.kind) !== queryLanguageForDatasource(profile.kind))
      const hasUntouchedDefault = tab.manualQueryPristine && tab.sql === defaultQueryTextForDatasource(previousProfile?.kind)
      const resetPlainQuery = languageChanged || hasUntouchedDefault
      const freshDefaults = resetPlainQuery ? {
        sql: defaultQueryTextForDatasource(profile?.kind),
        manualQueryPristine: true,
        queryMode: defaultQueryModeForDatasource(profile?.kind)
      } : {}
      return {
        ...tab,
        ...freshDefaults,
        connectionProfileId: profileId,
        running: false,
        queryError: null,
        result: null,
        pendingResult: null,
        resultRevision: 0,
        lastSuccessfulResultRevision: 0,
        isResultStale: false,
        builderHasRun: false,
        sqlResultFilters: [],
        builderResultFilters: tab.builderResultFilters.filter((filter) => filter.execution === 'query'),
        explainText: null,
        showExplain: false,
        activeExplainRequest: null,
        seriesVisibility: {}
      }
    })
  }))
}
