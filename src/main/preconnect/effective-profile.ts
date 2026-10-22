import type { PostgresProfile, TeleportPreConnect } from '../../shared/types.ts'
import { DEFAULT_TUNNEL_HOST } from '../../shared/teleport.ts'

/**
 * Resolves a profile's Teleport settings, filling db-user/db-name from the
 * profile's own user/database so they stay in one place. Returns null when the
 * profile has no Teleport pre-connect configured.
 */
export function resolveTeleportConfig(
  profile: PostgresProfile,
): TeleportPreConnect | null {
  const pre = profile.preConnect
  if (!pre || pre.mode !== 'teleport') return null
  const dbUser = (pre.dbUser ?? '').trim() || profile.user.trim()
  const dbName = (pre.dbName ?? '').trim() || profile.database.trim()
  return {
    ...pre,
    ...(dbUser ? { dbUser } : {}),
    ...(dbName ? { dbName } : {}),
  }
}

/**
 * Rewrites a profile to connect through the local tunnel. The Teleport tunnel
 * serves plain TCP on loopback and authenticates the database on the client's
 * behalf, so TLS is disabled and no password is sent. The database user must
 * match the `--db-user` the tunnel started with, hence the derived values.
 */
export function applyTeleportTunnel(
  profile: PostgresProfile,
  config: TeleportPreConnect,
): PostgresProfile {
  return {
    ...profile,
    host: DEFAULT_TUNNEL_HOST,
    port: config.tunnelPort,
    user: (config.dbUser ?? '').trim() || profile.user,
    database: (config.dbName ?? '').trim() || profile.database,
    tlsMode: 'disable',
    password: '',
  }
}
