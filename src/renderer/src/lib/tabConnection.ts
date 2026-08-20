import type { DataSourceProfile, TableInfo } from '@shared/types'
import { api } from './api'
import { normalizeDatabaseObjects } from './databaseObjects'
import { selectSession, useStore } from '../store/useStore'
import { defaultQueryModeForDatasource, defaultQueryTextForDatasource, queryLanguageForDatasource } from './queryDefaults'

let switchSequence = 0
let inFlight: { profileId: string; promise: Promise<string | null> } | null = null

function runningOnProfile(profileId: string): boolean {
  return useStore.getState().tabs.some((tab) => tab.connectionProfileId === profileId && tab.running)
}

function confirmConnectionSwitch(previousProfileId: string, nextProfileId: string): boolean {
  if (previousProfileId === nextProfileId || !runningOnProfile(previousProfileId)) return true
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  return window.confirm('A query is still running on the current connection. Running this action on another connection will stop it. Continue?')
}

async function connectForTab(tabId: string, desiredProfileId: string, confirmInterrupt: boolean): Promise<string | null> {
  const initial = useStore.getState()
  const profile = initial.profiles.find((candidate) => candidate.id === desiredProfileId)
  if (!profile) return null

  const previousProfileId = initial.activeProfileId
  if (confirmInterrupt && previousProfileId && previousProfileId !== desiredProfileId && !confirmConnectionSwitch(previousProfileId, desiredProfileId)) return null

  const sequence = ++switchSequence
  if (previousProfileId && previousProfileId !== desiredProfileId) {
    await api.connections.disconnect(previousProfileId, initial.connectionGeneration).catch(() => undefined)
    if (sequence !== switchSequence) return null
  }

  useStore.setState({
    activeProfileId: desiredProfileId,
    connecting: true,
    connected: false,
    connectionStatus: 'connecting',
    connectionError: null,
    serverVersion: null,
    activeReconnectAttempt: null
  })

  try {
    const result = await api.connections.connect(profile)
    if (sequence !== switchSequence) {
      if (result.ok) await api.connections.disconnect(result.id ?? desiredProfileId, result.generation).catch(() => undefined)
      return null
    }

    const session = selectSession(useStore.getState(), tabId)
    if (!session || session.connectionProfileId !== desiredProfileId) {
      if (result.ok) await api.connections.disconnect(result.id ?? desiredProfileId, result.generation).catch(() => undefined)
      useStore.setState({
        activeProfileId: null,
        connecting: false,
        connected: false,
        connectionStatus: 'disconnected',
        connectionError: null,
        serverVersion: null
      })
      return null
    }

    if (!result.ok) {
      useStore.setState({
        activeProfileId: desiredProfileId,
        connected: false,
        connecting: false,
        connectionStatus: 'error',
        connectionError: result.error,
        serverVersion: null
      })
      return null
    }

    const actualId = result.id ?? desiredProfileId
    useStore.setState((state) => ({
      activeProfileId: actualId,
      connected: true,
      connecting: false,
      connectionStatus: 'connected',
      connectionGeneration: result.generation,
      serverVersion: result.serverVersion,
      connectionError: null,
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [actualId]: {
          ...(state.metadataByProfileId[actualId] ?? { schemas: [], status: 'idle', error: null, isStale: false }),
          status: 'loading',
          error: null
        }
      },
      ...(actualId === desiredProfileId ? {} : {
        tabs: state.tabs.map((tab) => tab.connectionProfileId === desiredProfileId ? { ...tab, connectionProfileId: actualId } : tab)
      })
    }))

    if (actualId !== desiredProfileId) void api.connections.list().then((profiles: DataSourceProfile[]) => useStore.getState().setProfiles(profiles))
    void api.connections.listObjects(actualId).then(
      (nodes: TableInfo[]) => useStore.getState().setMetadata(normalizeDatabaseObjects(nodes), 'loaded', null, actualId),
      (error: unknown) => useStore.getState().setMetadata([], 'error', error instanceof Error ? error.message : String(error), actualId)
    )
    return actualId
  } catch (error) {
    if (sequence !== switchSequence) return null
    useStore.setState({
      activeProfileId: desiredProfileId,
      connected: false,
      connecting: false,
      connectionStatus: 'error',
      connectionError: error instanceof Error ? error.message : String(error),
      serverVersion: null
    })
    return null
  }
}

export async function ensureConnectionForTab(tabId: string, options: { confirmInterrupt?: boolean } = {}): Promise<string | null> {
  const state = useStore.getState()
  const session = selectSession(state, tabId)
  const desiredProfileId = session?.connectionProfileId ?? null
  if (!desiredProfileId) return null
  if (state.connected && state.activeProfileId === desiredProfileId) return desiredProfileId
  if (inFlight?.profileId === desiredProfileId) return inFlight.promise

  const promise = connectForTab(tabId, desiredProfileId, options.confirmInterrupt !== false)
  inFlight = { profileId: desiredProfileId, promise }
  try {
    return await promise
  } finally {
    if (inFlight?.promise === promise) inFlight = null
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
