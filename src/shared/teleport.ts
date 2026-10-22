import type { TeleportPreConnect } from './types.ts'

export const DEFAULT_TUNNEL_TIMEOUT_MS = 20_000
export const DEFAULT_TUNNEL_HOST = '127.0.0.1'

export interface TshStatus {
  loggedIn: boolean
  username?: string
  cluster?: string
  roles: string[]
  /** ISO timestamp of the active certificate, when reported. */
  validUntil?: string
}

/** True when a reported expiry is at or before `now`. */
export function isSessionExpired(
  validUntil: string | undefined,
  now: number,
): boolean {
  if (!validUntil) return false
  const expiry = Date.parse(validUntil)
  return Number.isFinite(expiry) && expiry <= now
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Resolves the binary to spawn. An explicit path wins; otherwise PATH is used. */
export function resolveTshBinary(config: TeleportPreConnect): string {
  const configured = config.tshPath?.trim()
  return configured ? configured : 'tsh'
}

/** Readiness timeout with a floor so a bad value cannot make waits race. */
export function tunnelTimeout(config: TeleportPreConnect): number {
  const value = config.timeoutMs
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 500)
    return DEFAULT_TUNNEL_TIMEOUT_MS
  return value
}

/**
 * Builds the argv for `tsh proxy db`. Values are passed as discrete argv items
 * (never a shell string), so no quoting or injection is possible.
 *
 * `--tunnel` is always set: it is the mode that lets a plain TCP client (pg)
 * connect without client certificates or a database password. The certificate
 * mode only works for clients that can present Teleport's own client certs.
 */
export function buildProxyDbArgs(config: TeleportPreConnect): string[] {
  const args = ['proxy', 'db', '--tunnel', '-p', String(config.tunnelPort)]
  if (config.dbUser?.trim()) args.push('-u', config.dbUser.trim())
  if (config.dbName?.trim()) args.push('-n', config.dbName.trim())
  if (config.cluster?.trim()) args.push('-c', config.cluster.trim())
  if (config.proxy?.trim()) args.push('--proxy', config.proxy.trim())
  if (config.login?.trim()) args.push('-l', config.login.trim())
  args.push(config.dbService.trim())
  return args
}

/** A copyable representation for previews and error messages (never executed). */
export function formatProxyDbCommand(
  config: TeleportPreConnect,
  binary = resolveTshBinary(config),
): string {
  return [binary, ...buildProxyDbArgs(config)].join(' ')
}

/**
 * Parses `tsh status --format=json`. A missing `active` section means the user
 * has no live certificate, which is the case the UI must call out explicitly.
 */
export function parseTshStatus(text: string): TshStatus {
  const root = asRecord(JSON.parse(text))
  const active = root ? asRecord(root.active) : null
  if (!active) return { loggedIn: false, roles: [] }
  return {
    loggedIn: true,
    username: typeof active.username === 'string' ? active.username : undefined,
    cluster: typeof active.cluster === 'string' ? active.cluster : undefined,
    roles: Array.isArray(active.roles)
      ? active.roles.filter((role): role is string => typeof role === 'string')
      : [],
    validUntil:
      typeof active.valid_until === 'string' ? active.valid_until : undefined,
  }
}
export function isValidTunnelPort(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  )
}

export interface TeleportDatabase {
  name: string
}

export type TeleportDiscoverErrorCode =
  'TSH_NOT_FOUND' | 'TSH_NOT_LOGGED_IN' | 'TUNNEL_FAILED'

export type TeleportDiscoverResult =
  | { ok: true; databases: TeleportDatabase[] }
  | { ok: false; error: string; code: TeleportDiscoverErrorCode }

/**
 * Parses `tsh db ls --format=json`, keeping PostgreSQL database services only.
 * Entries without a name or a non-postgres protocol are ignored.
 */
export function parseTeleportDatabases(text: string): TeleportDatabase[] {
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value)) return []
  const names = new Set<string>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const metadata = record.metadata
    const spec = record.spec
    if (!metadata || typeof metadata !== 'object') continue
    if (!spec || typeof spec !== 'object') continue
    const name = (metadata as Record<string, unknown>).name
    const protocol = (spec as Record<string, unknown>).protocol
    if (protocol !== 'postgres') continue
    if (typeof name !== 'string' || !name) continue
    names.add(name)
  }
  return [...names].sort().map((name) => ({ name }))
}
