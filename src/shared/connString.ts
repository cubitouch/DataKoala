/**
 * Postgres connection string parsing and formatting.
 *
 * Kept free of Node/DOM APIs so both the Electron main process and the renderer
 * can use it. The parsed form is a set of discrete fields; we deliberately do NOT
 * hand a re-serialised connection string to `pg`, because round-tripping through
 * percent-encoding is a known source of bugs with usernames like
 * `demo-reader@tproxy-test.example` (where the `@` must stay encoded).
 */

export interface ParsedConnection {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}

export interface ParseSuccess {
  ok: true
  value: ParsedConnection
  /** Non-fatal things worth telling the user about. */
  warnings: string[]
}

export interface ParseFailure {
  ok: false
  error: string
}

export type ParseResult = ParseSuccess | ParseFailure

export const DEFAULT_PORT = 5432

/** Schemes libpq accepts for URI-style connection strings. */
const URI_SCHEMES = ['postgres://', 'postgresql://']

/**
 * `sslmode` values that mean "encrypt the connection".
 * `prefer` and `allow` are opportunistic; we treat them as on, since falling back
 * silently to plaintext is worse than failing loudly.
 */
const SSL_ON_MODES = new Set(['require', 'verify-ca', 'verify-full', 'prefer', 'allow'])

/** Strip paste artefacts: surrounding whitespace, quotes, and a `psql ` prefix. */
function tidy(raw: string): string {
  let s = raw.trim()
  // People often copy `psql "postgres://..."` straight out of a runbook.
  s = s.replace(/^psql\s+/i, '').trim()
  // JDBC URLs are the same thing with a prefix.
  s = s.replace(/^jdbc:/i, '').trim()
  // Surrounding single or double quotes.
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    s = s.slice(1, -1).trim()
  }
  // Collapse newlines that sneak in from wrapped terminal output.
  s = s.replace(/\s*\n\s*/g, '')
  return s
}

function looksLikeUri(s: string): boolean {
  const lower = s.toLowerCase()
  return URI_SCHEMES.some((p) => lower.startsWith(p))
}

function looksLikeKeyValue(s: string): boolean {
  // libpq keyword/value form, e.g. `host=localhost port=5432 dbname=orders`.
  return /(^|\s)(host|hostaddr|port|dbname|user|password|sslmode)\s*=/i.test(s)
}

function sslFromMode(mode: string | null, warnings: string[]): boolean {
  if (!mode) return false
  const m = mode.toLowerCase()
  if (m === 'disable') return false
  if (SSL_ON_MODES.has(m)) {
    if (m === 'verify-ca' || m === 'verify-full') {
      warnings.push(
        `sslmode=${m} requests certificate verification, which this app does not configure yet; the connection will be encrypted but the server certificate is not verified.`
      )
    }
    return true
  }
  warnings.push(`Unrecognised sslmode "${mode}"; treating the connection as non-SSL.`)
  return false
}

function parseUri(s: string): ParseResult {
  const warnings: string[] = []
  let u: URL
  try {
    u = new URL(s)
  } catch (e) {
    return { ok: false, error: `Not a valid connection URI: ${e instanceof Error ? e.message : String(e)}` }
  }

  // `new URL` leaves userinfo percent-encoded; decode to the real values.
  // This is what keeps `%40` inside a username intact.
  let user = ''
  let password = ''
  try {
    user = decodeURIComponent(u.username)
    password = decodeURIComponent(u.password)
  } catch {
    return { ok: false, error: 'The username or password contains invalid percent-encoding.' }
  }

  // IPv6 hosts arrive bracketed (`[::1]`); pg wants them bare.
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!host) return { ok: false, error: 'Connection string is missing a host.' }

  let port = DEFAULT_PORT
  if (u.port) {
    const n = Number(u.port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return { ok: false, error: `Invalid port "${u.port}".` }
    }
    port = n
  } else {
    warnings.push(`No port in the connection string; defaulting to ${DEFAULT_PORT}.`)
  }

  let database = ''
  try {
    database = decodeURIComponent(u.pathname.replace(/^\//, ''))
  } catch {
    return { ok: false, error: 'The database name contains invalid percent-encoding.' }
  }
  if (!database) warnings.push('No database name in the connection string.')

  // libpq also allows dbname/user/password/host/port as query parameters.
  const q = u.searchParams
  const ssl = sslFromMode(q.get('sslmode'), warnings)
  if (!database && q.get('dbname')) database = q.get('dbname')!
  if (!user && q.get('user')) user = q.get('user')!
  if (!password && q.get('password')) password = q.get('password')!

  if (!user) warnings.push('No username in the connection string.')
  if (!password) {
    warnings.push('No password found — the server must allow passwordless auth (e.g. a proxy, IAM, or .pgpass).')
  }

  return { ok: true, value: { host, port, database, user, password, ssl }, warnings }
}

/** Split a libpq keyword/value string, honouring single-quoted values. */
function splitKeyValue(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|([^\s]*))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    const key = m[1].toLowerCase()
    const value = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : (m[3] ?? '')
    out[key] = value
  }
  return out
}

function parseKeyValue(s: string): ParseResult {
  const warnings: string[] = []
  const kv = splitKeyValue(s)

  const host = kv.host || kv.hostaddr || ''
  if (!host) return { ok: false, error: 'Connection string is missing a host.' }

  let port = DEFAULT_PORT
  if (kv.port) {
    const n = Number(kv.port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) return { ok: false, error: `Invalid port "${kv.port}".` }
    port = n
  } else {
    warnings.push(`No port in the connection string; defaulting to ${DEFAULT_PORT}.`)
  }

  const database = kv.dbname || ''
  if (!database) warnings.push('No database name in the connection string.')
  const user = kv.user || ''
  if (!user) warnings.push('No username in the connection string.')
  const password = kv.password || ''
  if (!password) {
    warnings.push('No password found — the server must allow passwordless auth (e.g. a proxy, IAM, or .pgpass).')
  }
  const ssl = sslFromMode(kv.sslmode ?? null, warnings)

  return { ok: true, value: { host, port, database, user, password, ssl }, warnings }
}

/**
 * Parse either a URI-style (`postgres://…`) or libpq keyword/value
 * (`host=… port=…`) connection string into discrete fields.
 */
export function parseConnectionString(raw: string): ParseResult {
  const s = tidy(raw)
  if (!s) return { ok: false, error: 'Nothing to parse.' }
  if (looksLikeUri(s)) return parseUri(s)
  if (looksLikeKeyValue(s)) return parseKeyValue(s)
  return {
    ok: false,
    error: 'Unrecognised format. Expected postgres://user:pass@host:port/db or host=… port=… dbname=…'
  }
}

/**
 * Render discrete fields back into a URI, correctly percent-encoded.
 * Used for display and for "copy connection string"; the actual connection is made
 * from the discrete fields. `maskPassword` keeps secrets out of the UI and exports.
 */
export function buildConnectionString(
  p: ParsedConnection,
  opts: { maskPassword?: boolean } = {}
): string {
  const user = p.user ? encodeURIComponent(p.user) : ''
  const rawPass = opts.maskPassword && p.password ? '****' : p.password
  const pass = rawPass ? `:${opts.maskPassword && p.password ? rawPass : encodeURIComponent(rawPass)}` : ''
  const userinfo = user ? `${user}${pass}@` : ''
  // Re-bracket IPv6 literals.
  const host = p.host.includes(':') ? `[${p.host}]` : p.host
  const db = p.database ? `/${encodeURIComponent(p.database)}` : '/'
  const query = p.ssl ? '?sslmode=require' : ''
  return `postgresql://${userinfo}${host}:${p.port}${db}${query}`
}
