import type { DatabaseColumnNode, DatabaseRelationNode } from '@shared/types'
import { api } from './api'
import { useStore } from '@store/useStore'

const pending = new Map<string, Promise<DatabaseColumnNode[] | undefined>>()

function cachedRelation(
  profileId: string,
  qualifiedName: string,
): DatabaseRelationNode | undefined {
  return useStore
    .getState()
    .metadataByProfileId[profileId]?.schemas.flatMap(
      (schema) => schema.relations,
    )
    .find((relation) => relation.qualifiedName === qualifiedName)
}

/** Shared, profile-scoped and request-deduplicated lazy column loader. */
export function ensureRelationColumns(
  profileId: string,
  relation: DatabaseRelationNode,
  retry = false,
): Promise<DatabaseColumnNode[] | undefined> {
  const current = cachedRelation(profileId, relation.qualifiedName)
  if (current?.columnsStatus === 'loaded')
    return Promise.resolve(current.columns ?? [])
  if (current?.columnsStatus === 'error' && !retry)
    return Promise.resolve(undefined)
  const key = `${profileId}\0${relation.qualifiedName}`
  const existing = pending.get(key)
  if (existing) return existing

  const request = (async () => {
    const initialConnection =
      useStore.getState().connectionStateByProfileId[profileId]
    if (
      !initialConnection ||
      (initialConnection.status !== 'connected' &&
        initialConnection.status !== 'idle')
    )
      return undefined
    const generation = initialConnection.generation
    useStore
      .getState()
      .setRelationColumns(
        relation.qualifiedName,
        undefined,
        'loading',
        undefined,
        profileId,
      )
    try {
      const columns = (await api.connections.describeTable(
        profileId,
        relation.schema,
        relation.name,
      )) as DatabaseColumnNode[]
      const currentConnection =
        useStore.getState().connectionStateByProfileId[profileId]
      if (
        currentConnection?.generation !== generation ||
        (currentConnection.status !== 'connected' &&
          currentConnection.status !== 'idle')
      )
        return undefined
      // The profile id is explicit: a tab/profile switch cannot write into the
      // newly active profile's metadata.
      useStore
        .getState()
        .setRelationColumns(
          relation.qualifiedName,
          columns,
          'loaded',
          undefined,
          profileId,
        )
      return columns
    } catch (error) {
      const currentConnection =
        useStore.getState().connectionStateByProfileId[profileId]
      if (
        currentConnection?.generation !== generation ||
        (currentConnection.status !== 'connected' &&
          currentConnection.status !== 'idle')
      )
        return undefined
      useStore
        .getState()
        .setRelationColumns(
          relation.qualifiedName,
          undefined,
          'error',
          error instanceof Error ? error.message : String(error),
          profileId,
        )
      return undefined
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, request)
  return request
}
