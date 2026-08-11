import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { DataSourceCapabilities, DataSourceProfile, PostgresProfile } from '../../shared/types.ts'
import { testConnection, connect as connectPostgres, runQuery, listObjects, describeTable, explainQuery, disconnect, disconnectAll, onConnectionStateChanged as onPostgresStateChanged } from './postgres.ts'

export const POSTGRES_CAPABILITIES: DataSourceCapabilities = {
  builder: true,
  explain: true,
  analyze: true,
  queryCancellation: false,
  parameterizedQueries: true,
  costEstimate: false,
  serverReadOnly: true,
  schemaAutocomplete: true
}

function postgresProfile(profile: DataSourceProfile): PostgresProfile {
  if (profile.kind !== 'postgres') throw new Error(`PostgreSQL adapter cannot open ${profile.kind}`)
  return profile
}

export class PostgresAdapter implements DataSourceAdapter {
  readonly kind = 'postgres' as const

  test(profile: DataSourceProfile) {
    return testConnection(postgresProfile(profile)).then((result) => result.ok
      ? { ...result, sourceInfo: { label: 'PostgreSQL', version: result.serverVersion } }
      : result)
  }

  async connect(profile: DataSourceProfile) {
    const pgProfile = postgresProfile(profile)
    const postgresResult = await connectPostgres(pgProfile)
    const result = postgresResult.ok
      ? { ...postgresResult, sourceInfo: { label: 'PostgreSQL', version: postgresResult.serverVersion } }
      : postgresResult
    if (!result.ok) return { result }
    const session: DataSourceSession = {
      info: { profileId: pgProfile.id, provider: 'postgres', serverVersion: result.serverVersion },
      capabilities: POSTGRES_CAPABILITIES,
      query: ({ sql, parameters = [] }) => runQuery(pgProfile.id, sql, parameters),
      listNamespaces: async () => {
        const relations = await listObjects(pgProfile.id)
        return [...new Set(relations.map((relation) => relation.schema))].map((name) => ({ name }))
      },
      listRelations: async (namespace) => (await listObjects(pgProfile.id))
        .filter((relation) => !namespace || relation.schema === namespace.name)
        .map((relation) => ({
          namespace: relation.schema,
          name: relation.name,
          kind: relation.kind === 'm' ? 'materialized-view' as const : relation.kind === 'v' ? 'view' as const : 'table' as const
        })),
      describeRelation: ({ namespace, name }) => describeTable(pgProfile.id, namespace, name)
        .then((columns) => columns.map((column) => ({ name: column.name, nativeType: column.dataTypeName, nullable: column.nullable }))),
      explain: (sql, analyze = false) => explainQuery(pgProfile.id, sql, analyze),
      close: () => disconnect(pgProfile.id, result.generation)
    }
    return { result, session }
  }

  onConnectionStateChanged(listener: Parameters<typeof onPostgresStateChanged>[0]): void {
    onPostgresStateChanged(listener)
  }

  cancelConnect(profileId: string): Promise<void> { return disconnect(profileId) }
  shutdown(): Promise<void> { return disconnectAll() }
}

export { DatabaseConnectionError, __testing } from './postgres.ts'
