import type { DataSourceProfile } from '@shared/types'
import { api } from './api'
import { loadConnectionMetadata } from './connectionMetadata'
import { selectSession, useStore } from '@store/useStore'
import {
  defaultQueryModeForDatasource,
  defaultQueryTextForDatasource,
  queryLanguageForDatasource,
} from './queryDefaults'

const inFlight = new Map<string, Promise<string | null>>()

function runningOnProfile(profileId: string): boolean {
  return useStore
    .getState()
    .tabs.some((tab) => tab.connectionProfileId === profileId && tab.running)
}

function confirmConnectionSwitch(
  previousProfileId: string,
  nextProfileId: string,
): boolean {
  if (
    previousProfileId === nextProfileId ||
    !runningOnProfile(previousProfileId)
  )
    return true
  if (typeof window === 'undefined' || typeof window.confirm !== 'function')
    return false
  return window.confirm(
    'A query is still running on the current connection. Running this action on another connection will stop it. Continue?',
  )
}

async function connectForTab(
  desiredProfileId: string,
  confirmInterrupt: boolean,
): Promise<string | null> {
  const initial = useStore.getState()
  const profile = initial.profiles.find(
    (candidate) => candidate.id === desiredProfileId,
  )
  if (!profile) return null

  const previousProfileId =
    selectSession(initial, initial.activeTabId)?.connectionProfileId ?? null
  if (
    confirmInterrupt &&
    previousProfileId &&
    previousProfileId !== desiredProfileId &&
    !confirmConnectionSwitch(previousProfileId, desiredProfileId)
  )
    return null

  const startingGeneration =
    initial.connectionStateByProfileId[desiredProfileId]?.generation ?? 0
  useStore.setState((state) => ({
    connectionStateByProfileId: {
      ...state.connectionStateByProfileId,
      [desiredProfileId]: {
        status: 'connecting',
        generation:
          state.connectionStateByProfileId[desiredProfileId]?.generation ?? 0,
        error: null,
        serverVersion: null,
      },
    },
  }))

  try {
    const result = await api.connections.connect(profile)
    if (!result.ok) {
      useStore.setState((state) => ({
        connectionStateByProfileId:
          (state.connectionStateByProfileId[desiredProfileId]?.generation ??
            0) > startingGeneration ||
          state.connectionStateByProfileId[desiredProfileId]?.status ===
            'connected'
            ? state.connectionStateByProfileId
            : {
                ...state.connectionStateByProfileId,
                [desiredProfileId]: {
                  status: 'error',
                  generation:
                    state.connectionStateByProfileId[desiredProfileId]
                      ?.generation ?? startingGeneration,
                  error: result.error,
                  serverVersion: null,
                },
              },
      }))
      return null
    }

    const actualId = result.id ?? desiredProfileId
    const latestConnection =
      useStore.getState().connectionStateByProfileId[actualId]
    if (latestConnection && latestConnection.generation > result.generation)
      return latestConnection.status === 'connected' ||
        latestConnection.status === 'idle'
        ? actualId
        : null
    useStore.setState((state) => ({
      connectionStateByProfileId: {
        ...state.connectionStateByProfileId,
        [actualId]: {
          status: 'connected',
          generation: result.generation,
          error: null,
          serverVersion: result.serverVersion ?? null,
        },
      },
      metadataByProfileId: {
        ...state.metadataByProfileId,
        [actualId]: {
          ...(state.metadataByProfileId[actualId] ?? {
            schemas: [],
            status: 'idle',
            error: null,
            isStale: false,
          }),
          status: 'loading',
          error: null,
          refreshing: false,
          refreshError: null,
        },
      },
      ...(actualId === desiredProfileId
        ? {}
        : {
            tabs: state.tabs.map((tab) =>
              tab.connectionProfileId === desiredProfileId
                ? { ...tab, connectionProfileId: actualId }
                : tab,
            ),
          }),
    }))

    if (actualId !== desiredProfileId)
      void api.connections
        .list()
        .then((profiles: DataSourceProfile[]) =>
          useStore.getState().setProfiles(profiles),
        )
    const generation = result.generation
    void loadConnectionMetadata(actualId).then(
      (nodes) => {
        const latest = useStore.getState().connectionStateByProfileId[actualId]
        if (
          latest?.generation === generation &&
          (latest.status === 'connected' || latest.status === 'idle')
        )
          useStore.getState().setMetadata(nodes, 'loaded', null, actualId)
      },
      (error: unknown) => {
        const latest = useStore.getState().connectionStateByProfileId[actualId]
        if (
          latest?.generation === generation &&
          (latest.status === 'connected' || latest.status === 'idle')
        )
          useStore
            .getState()
            .setMetadata(
              [],
              'error',
              error instanceof Error ? error.message : String(error),
              actualId,
            )
      },
    )
    return actualId
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useStore.setState((state) => ({
      connectionStateByProfileId:
        (state.connectionStateByProfileId[desiredProfileId]?.generation ?? 0) >
          startingGeneration ||
        state.connectionStateByProfileId[desiredProfileId]?.status ===
          'connected'
          ? state.connectionStateByProfileId
          : {
              ...state.connectionStateByProfileId,
              [desiredProfileId]: {
                status: 'error',
                generation:
                  state.connectionStateByProfileId[desiredProfileId]
                    ?.generation ?? startingGeneration,
                error: message,
                serverVersion: null,
              },
            },
    }))
    return null
  }
}

export async function ensureConnectionForTab(
  tabId: string,
  options: { confirmInterrupt?: boolean } = {},
): Promise<string | null> {
  const state = useStore.getState()
  const session = selectSession(state, tabId)
  const desiredProfileId = session?.connectionProfileId ?? null
  if (!desiredProfileId) return null
  const connection = state.connectionStateByProfileId[desiredProfileId]
  if (connection?.status === 'connected' || connection?.status === 'idle')
    return desiredProfileId
  if (
    connection?.status === 'connecting' ||
    connection?.status === 'reconnecting'
  )
    return null
  // Missing state means restoration has not yet confirmed whether a main-process
  // session is already live. A confirmed disconnected entry still connects on demand.
  if (!connection) return null
  const pending = inFlight.get(desiredProfileId)
  if (pending) return pending

  const promise = connectForTab(
    desiredProfileId,
    options.confirmInterrupt !== false,
  )
  inFlight.set(desiredProfileId, promise)
  try {
    return await promise
  } finally {
    if (inFlight.get(desiredProfileId) === promise)
      inFlight.delete(desiredProfileId)
  }
}

/** Prevent an async operation from crossing tabs, profiles, or connection generations. */
export function isProfileConnectionCurrent(
  profileId: string,
  generation: number,
): boolean {
  const connection = useStore.getState().connectionStateByProfileId[profileId]
  return (
    connection?.generation === generation &&
    (connection.status === 'connected' || connection.status === 'idle')
  )
}

export function isTabConnectionCurrent(
  tabId: string,
  profileId: string,
  generation?: number,
): boolean {
  const state = useStore.getState()
  return (
    selectSession(state, tabId)?.connectionProfileId === profileId &&
    (generation === undefined ||
      isProfileConnectionCurrent(profileId, generation))
  )
}

export function bindTabConnection(
  tabId: string,
  profileId: string | null,
): void {
  useStore.setState((state) => ({
    ...(profileId && !state.connectionStateByProfileId[profileId]
      ? {
          connectionStateByProfileId: {
            ...state.connectionStateByProfileId,
            [profileId]: {
              status: 'disconnected' as const,
              generation: 0,
              error: null,
              serverVersion: null,
            },
          },
        }
      : {}),
    tabs: state.tabs.map((tab) => {
      if (tab.id !== tabId || tab.connectionProfileId === profileId) return tab
      const profile = state.profiles.find(
        (candidate) => candidate.id === profileId,
      )
      const previousProfile = state.profiles.find(
        (candidate) => candidate.id === tab.connectionProfileId,
      )
      const languageChanged = Boolean(
        previousProfile &&
        profile &&
        queryLanguageForDatasource(previousProfile.kind) !==
          queryLanguageForDatasource(profile.kind),
      )
      const hasUntouchedDefault =
        tab.manualQueryPristine &&
        tab.sql === defaultQueryTextForDatasource(previousProfile?.kind)
      const resetPlainQuery = languageChanged || hasUntouchedDefault
      const freshDefaults = resetPlainQuery
        ? {
            sql: defaultQueryTextForDatasource(profile?.kind),
            manualQueryPristine: true,
            queryMode: defaultQueryModeForDatasource(profile?.kind),
          }
        : {}
      return {
        ...tab,
        ...freshDefaults,
        connectionProfileId: profileId,
        running: false,
        queryError: null,
        repairableQueryError: null,
        result: null,
        pendingResult: null,
        resultRevision: 0,
        lastSuccessfulResultRevision: 0,
        isResultStale: false,
        builderHasRun: false,
        sqlResultFilters: [],
        builderResultFilters: tab.builderResultFilters.filter(
          (filter) => filter.execution === 'query',
        ),
        explainText: null,
        explainTree: null,
        explainSnapshot: null,
        showExplain: false,
        activeExplainRequest: null,
        seriesVisibility: {},
      }
    }),
  }))
}
