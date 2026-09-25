import type { DatabaseSchemaNode } from '@shared/types'
import { api } from './api'
import { normalizeDatabaseObjects } from './databaseObjects'

/** The single renderer path for fetching and normalizing provider top-level metadata. */
export async function loadConnectionMetadata(profileId: string): Promise<DatabaseSchemaNode[]> {
  return normalizeDatabaseObjects(await api.connections.listObjects(profileId))
}
