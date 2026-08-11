import type { ConnectionProfile } from '../../../shared/types'

export interface ConnectionDraft {
  id: string
  name: string
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
  readonly: boolean
}

export type ConnectionDraftField = 'name' | 'host' | 'port' | 'database' | 'user'
export type ConnectionDraftErrors = Partial<Record<ConnectionDraftField, string>>

export type BuildConnectionProfileResult =
  | { ok: true; profile: ConnectionProfile }
  | { ok: false; errors: ConnectionDraftErrors }

export function draftFromProfile(profile: ConnectionProfile): ConnectionDraft {
  return { ...profile, port: String(profile.port) }
}

/** The single normalization and validation boundary used by preview, Test, and Save. */
export function buildConnectionProfileDraft(
  draft: ConnectionDraft,
  options: { requireName?: boolean } = {}
): BuildConnectionProfileResult {
  const name = draft.name.trim()
  const host = draft.host.trim()
  const database = draft.database.trim()
  const user = draft.user.trim()
  const portText = draft.port.trim()
  const port = Number(portText)
  const errors: ConnectionDraftErrors = {}

  if (options.requireName && !name) errors.name = 'Profile name is required'
  if (!host) errors.host = 'Host is required'
  if (!portText || !Number.isInteger(port) || port < 1 || port > 65535) {
    errors.port = 'Port must be between 1 and 65535'
  }
  if (!database) errors.database = 'Database is required'
  if (!user) errors.user = 'User is required'
  if (Object.keys(errors).length) return { ok: false, errors }

  return {
    ok: true,
    profile: {
      kind: 'postgres',
      version: 1,
      id: draft.id,
      name,
      host,
      port,
      database,
      user,
      // Passwords are intentionally not trimmed: spaces may be part of a credential.
      password: draft.password,
      ssl: draft.ssl,
      readonly: draft.readonly
    }
  }
}
