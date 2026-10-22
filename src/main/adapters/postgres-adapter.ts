import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import {
  DATA_SOURCE_CAPABILITIES,
  type DataSourceProfile,
  type PostgresProfile,
} from '../../shared/types.ts'
import {
  testConnection,
  connect as connectPostgres,
  runQuery,
  listObjects,
  describeTable,
  explainQuery,
  disconnect,
  disconnectAll,
  onConnectionStateChanged as onPostgresStateChanged,
} from './postgres.ts'
import {
  SupersededError,
  TeleportTunnelManager,
} from '../preconnect/teleport-manager.ts'
import {
  applyTeleportTunnel,
  resolveTeleportConfig,
} from '../preconnect/effective-profile.ts'

function postgresProfile(profile: DataSourceProfile): PostgresProfile {
  if (profile.kind !== 'postgres')
    throw new Error(`PostgreSQL adapter cannot open ${profile.kind}`)
  return profile
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Shared across profiles; the manager keys tunnels by profile id internally. */
const sharedTunnels = new TeleportTunnelManager()

type TunnelManager = Pick<TeleportTunnelManager, 'start' | 'stop' | 'stopAll'>

/**
 * Test runs against a throwaway tunnel key so it never disturbs a live
 * connection's own tunnel, which is keyed by the plain profile id.
 */
export function testTunnelKey(profileId: string): string {
  return `${profileId}::test`
}

function tunnelReason(error: unknown): string {
  if (error instanceof SupersededError)
    return 'This connection attempt was superseded by a newer connection.'
  return reasonOf(error)
}

export class PostgresAdapter implements DataSourceAdapter {
  readonly kind = 'postgres' as const
  private readonly tunnels: TunnelManager

  constructor(tunnels: TunnelManager = sharedTunnels) {
    this.tunnels = tunnels
  }

  async test(profile: DataSourceProfile) {
    const pgProfile = postgresProfile(profile)
    const preConnect = resolveTeleportConfig(pgProfile)
    const tunnelId = testTunnelKey(pgProfile.id)
    let generation: number | undefined
    if (preConnect) {
      try {
        generation = await this.tunnels.start(tunnelId, preConnect)
      } catch (error) {
        return { ok: false as const, error: tunnelReason(error) }
      }
    }
    try {
      const target = preConnect
        ? applyTeleportTunnel(pgProfile, preConnect)
        : pgProfile
      const result = await testConnection(target)
      return result.ok
        ? {
            ...result,
            sourceInfo: { label: 'PostgreSQL', version: result.serverVersion },
          }
        : result
    } finally {
      if (preConnect) await this.tunnels.stop(tunnelId, generation)
    }
  }

  async connect(profile: DataSourceProfile) {
    const pgProfile = postgresProfile(profile)
    const preConnect = resolveTeleportConfig(pgProfile)
    let tunnelGeneration: number | undefined
    if (preConnect) {
      try {
        tunnelGeneration = await this.tunnels.start(pgProfile.id, preConnect)
      } catch (error) {
        return { result: { ok: false as const, error: tunnelReason(error) } }
      }
    }

    const target = preConnect
      ? applyTeleportTunnel(pgProfile, preConnect)
      : pgProfile
    let postgresResult
    try {
      postgresResult = await connectPostgres(target)
    } catch (error) {
      if (preConnect) await this.tunnels.stop(pgProfile.id, tunnelGeneration)
      return { result: { ok: false as const, error: reasonOf(error) } }
    }
    const result = postgresResult.ok
      ? {
          ...postgresResult,
          sourceInfo: {
            label: 'PostgreSQL',
            version: postgresResult.serverVersion,
          },
        }
      : postgresResult
    if (!result.ok) {
      if (preConnect) await this.tunnels.stop(pgProfile.id, tunnelGeneration)
      return { result }
    }
    const session: DataSourceSession = {
      info: {
        profileId: pgProfile.id,
        provider: 'postgres',
        serverVersion: result.serverVersion,
      },
      capabilities: DATA_SOURCE_CAPABILITIES.postgres,
      query: ({ sql, parameters = [] }) =>
        runQuery(pgProfile.id, sql, parameters),
      listNamespaces: async () => {
        const relations = await listObjects(pgProfile.id)
        return [...new Set(relations.map((relation) => relation.schema))].map(
          (name) => ({ name }),
        )
      },
      listRelations: async (namespace) =>
        (await listObjects(pgProfile.id))
          .filter(
            (relation) => !namespace || relation.schema === namespace.name,
          )
          .map((relation) => ({
            namespace: relation.schema,
            name: relation.name,
            kind:
              relation.kind === 'm'
                ? ('materialized-view' as const)
                : relation.kind === 'v'
                  ? ('view' as const)
                  : ('table' as const),
          })),
      describeRelation: ({ namespace, name }) =>
        describeTable(pgProfile.id, namespace, name).then((columns) =>
          columns.map((column) => ({
            name: column.name,
            nativeType: column.dataTypeName,
            nullable: column.nullable,
          })),
        ),
      explain: (sql, analyze = false) =>
        explainQuery(pgProfile.id, sql, analyze),
      close: async () => {
        await disconnect(pgProfile.id, result.generation)
        if (preConnect) await this.tunnels.stop(pgProfile.id, tunnelGeneration)
      },
    }
    return { result, session }
  }

  onConnectionStateChanged(
    listener: Parameters<typeof onPostgresStateChanged>[0],
  ): void {
    onPostgresStateChanged(listener)
  }

  async cancelConnect(profileId: string): Promise<void> {
    await disconnect(profileId)
    await this.tunnels.stop(profileId)
  }

  async shutdown(): Promise<void> {
    await disconnectAll()
    await this.tunnels.stopAll()
  }
}

export { DatabaseConnectionError, __testing } from './postgres.ts'
