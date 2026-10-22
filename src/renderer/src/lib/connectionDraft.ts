import type { ConnectionProfile, PostgresTlsMode } from '@shared/types'
import { DEFAULT_PORT } from '@shared/connString'
import { isValidTunnelPort } from '@shared/teleport'

export const DEFAULT_TUNNEL_PORT = 5433

export interface ConnectionDraft {
  id: string
  name: string
  host: string
  port: string
  database: string
  user: string
  password: string
  hasPassword?: boolean
  credentialState?: 'none' | 'secure' | 'legacy-plaintext'
  tlsMode: PostgresTlsMode
  tlsCa?: string
  readonly: boolean
  teleportEnabled: boolean
  teleportDbService: string
  teleportTunnelPort: string
  teleportTshPath: string
}

export type ConnectionDraftField =
  | 'name'
  | 'host'
  | 'port'
  | 'database'
  | 'user'
  | 'teleportDbService'
  | 'teleportTunnelPort'
  | 'teleportTshPath'

export type ConnectionDraftErrors = Partial<
  Record<ConnectionDraftField, string>
>

export type BuildConnectionProfileResult =
  | { ok: true; profile: ConnectionProfile }
  | { ok: false; errors: ConnectionDraftErrors }

export function draftFromProfile(profile: ConnectionProfile): ConnectionDraft {
  const pre = profile.preConnect
  return {
    ...profile,
    port: String(profile.port),
    hasPassword: profile.hasPassword ?? false,
    credentialState: profile.credentialState ?? 'none',
    teleportEnabled: pre?.mode === 'teleport',
    teleportDbService: pre?.dbService ?? '',
    teleportTunnelPort: String(pre?.tunnelPort ?? DEFAULT_TUNNEL_PORT),
    teleportTshPath: pre?.tshPath ?? '',
  }
}

function trimmed(value: string | undefined): string {
  return (value ?? '').trim()
}

/** The single normalization and validation boundary used by preview, Test, and Save. */
export function buildConnectionProfileDraft(
  draft: ConnectionDraft,
  options: { requireName?: boolean } = {},
): BuildConnectionProfileResult {
  const name = draft.name.trim()
  const host = draft.host.trim()
  const database = draft.database.trim()
  const user = draft.user.trim()
  const portText = draft.port.trim()
  const port = Number(portText)
  const tlsCa = draft.tlsCa?.trim()
  const errors: ConnectionDraftErrors = {}

  const dbService = trimmed(draft.teleportDbService)
  const tshPath = trimmed(draft.teleportTshPath)
  const tunnelPort = Number(draft.teleportTunnelPort.trim())

  if (options.requireName && !name) errors.name = 'Profile name is required'

  // User and database are shared with the tunnel (tsh --db-user/--db-name), so
  // they are always required.
  if (!database) errors.database = 'Database is required'
  if (!user) errors.user = 'User is required'

  if (draft.teleportEnabled) {
    // A tunnel fixes the host to loopback, replaces the port, disables TLS and
    // supplies its own password, so those connection fields are not required.
    if (!dbService)
      errors.teleportDbService = 'Teleport database service is required'
    if (!isValidTunnelPort(tunnelPort))
      errors.teleportTunnelPort = 'Tunnel port must be between 1 and 65535'
  } else {
    if (!host) errors.host = 'Host is required'
    if (!portText || !Number.isInteger(port) || port < 1 || port > 65535) {
      errors.port = 'Port must be between 1 and 65535'
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors }

  return {
    ok: true,
    profile: {
      kind: 'postgres',
      version: 2,
      id: draft.id,
      name,
      host,
      // A tunnel ignores the profile port; fall back to the default rather than
      // persisting NaN when the connection-tab port is blank or invalid.
      port:
        Number.isInteger(port) && port >= 1 && port <= 65535
          ? port
          : DEFAULT_PORT,
      database,
      user,
      // Passwords are intentionally not trimmed: spaces may be part of a credential.
      password: draft.password,
      ...(draft.hasPassword === undefined
        ? {}
        : { hasPassword: draft.hasPassword }),
      ...(draft.credentialState === undefined
        ? {}
        : { credentialState: draft.credentialState }),
      tlsMode: draft.tlsMode,
      ...(tlsCa ? { tlsCa } : {}),
      ...(draft.teleportEnabled
        ? {
            preConnect: {
              mode: 'teleport' as const,
              dbService,
              ...(tshPath ? { tshPath } : {}),
              tunnelPort,
            },
          }
        : {}),
      readonly: draft.readonly,
    },
  }
}
