import type { DataSourceProfile } from '@shared/types'
import { api } from './api'
import { loadConnectionMetadata } from './connectionMetadata'
import {
  beginConnectionIntent,
  isConnectionIntentCurrent,
  isUsableProfileConnection,
} from './connectionLifecycle'
import {
  beginQueryOperation,
  selectSession,
  useStore,
  type QueryOperation,
} from '@store/useStore'
import {
  defaultQueryModeForDatasource,
  defaultQueryTextForDatasource,
  queryLanguageForDatasource,
} from './queryDefaults'

const inFlight = new Map<string, Promise<string | null>>()

async function connectForTab(desiredProfileId: string): Promise<string | null> {
  const initial = useStore.getState()
  const profile = initial.profiles.find(
    (candidate) => candidate.id === desiredProfileId,
  )
  if (!profile) return null

  const intent = beginConnectionIntent(desiredProfileId)
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
    if (!isConnectionIntentCurrent(desiredProfileId, intent)) {
      if (!result.ok) return null
      const latest =
        useStore.getState().connectionStateByProfileId[desiredProfileId]
      return latest?.status === 'connected' || latest?.status === 'idle'
        ? desiredProfileId
        : null
    }
    if (!result.ok) {
      useStore
        .getState()
        .applyConnectionFailure(
          desiredProfileId,
          startingGeneration,
          result.error,
          startingGeneration,
        )
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
          isConnectionIntentCurrent(desiredProfileId, intent) &&
          isUsableProfileConnection(latest, generation)
        )
          useStore.getState().setMetadata(nodes, 'loaded', null, actualId)
      },
      (error: unknown) => {
        const latest = useStore.getState().connectionStateByProfileId[actualId]
        if (
          isConnectionIntentCurrent(desiredProfileId, intent) &&
          isUsableProfileConnection(latest, generation)
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
    if (!isConnectionIntentCurrent(desiredProfileId, intent)) return null
    const message = error instanceof Error ? error.message : String(error)
    useStore
      .getState()
      .applyConnectionFailure(
        desiredProfileId,
        startingGeneration,
        message,
        startingGeneration,
      )
    return null
  }
}

export async function ensureConnectionForTab(
  tabId: string,
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

  const promise = connectForTab(desiredProfileId)
  inFlight.set(desiredProfileId, promise)
  try {
    return await promise
  } finally {
    if (inFlight.get(desiredProfileId) === promise)
      inFlight.delete(desiredProfileId)
  }
}

/** Shared Run preflight: connection awaits must not cross a session transition. */
export async function beginConnectedQueryOperation(
  tabId: string,
  profileId: string,
  onConnectionError?: (message: string) => void,
): Promise<QueryOperation | null> {
  const initial = useStore.getState()
  const session = selectSession(initial, tabId)
  if (!session || session.connectionProfileId !== profileId) return null
  const connection = initial.connectionStateByProfileId[profileId]
  const connectedId = await ensureConnectionForTab(tabId)
  const current = useStore.getState()
  const currentSession = selectSession(current, tabId)
  if (
    !currentSession ||
    currentSession.queryContextId !== session.queryContextId ||
    currentSession.connectionProfileId !== profileId
  )
    return null
  if (!connectedId) {
    // A failed preflight must not overwrite execution accepted while it awaited.
    if (
      currentSession.queryOperation?.token === session.queryOperation?.token
    ) {
      const failed = current.connectionStateByProfileId[profileId]
      onConnectionError?.(
        failed?.error ??
          (failed
            ? 'This connection is not ready to run a query.'
            : 'Connection status is still being restored.'),
      )
    }
    return null
  }
  const generation = current.connectionStateByProfileId[connectedId]?.generation
  if (
    generation === undefined ||
    ((connection?.status === 'connected' || connection?.status === 'idle') &&
      generation !== connection.generation)
  )
    return null
  return beginQueryOperation(tabId, connectedId, generation)
}

/** Prevent an async operation from crossing tabs, profiles, or connection generations. */
export function isProfileConnectionCurrent(
  profileId: string,
  generation: number,
): boolean {
  const connection = useStore.getState().connectionStateByProfileId[profileId]
  return isUsableProfileConnection(connection, generation)
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
        queryOperation: null,
        explainOperation: null,
        pendingQueryOperations: [],
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
