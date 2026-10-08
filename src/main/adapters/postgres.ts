import { Pool } from 'pg'
import type { PoolClient, PoolConfig, QueryResult as PgQueryResult } from 'pg'
import type {
  ConnectionId,
  ConnectionProfile,
  QueryResult,
  ColumnMeta,
  ConnectionStateEvent,
  ConnectionErrorCode,
  ExplainNode,
  ExplainResult,
} from '../../shared/types'
import { QueryConnectionError, QueryValidationError } from '../query-failure.ts'

interface ManagedPool {
  pool: Pool
  profile: ConnectionProfile
  generation: number
  state:
    | 'connecting'
    | 'connected'
    | 'idle'
    | 'disconnecting'
    | 'disconnected'
    | 'failed'
  terminalHandled: boolean
  activeQueries: number
  checkedOut: Set<PoolClient>
}

const pools = new Map<ConnectionId, ManagedPool>()
const observedClients = new WeakSet<PoolClient>()
let nextGeneration = 0
let connectionIntent = 0
const connectionIntents = new Map<ConnectionId, number>()
let stateListener: (event: ConnectionStateEvent) => void = () => undefined
let createPool = (config: PoolConfig): Pool => new Pool(config)

export class DatabaseConnectionError extends QueryConnectionError {
  readonly code: ConnectionErrorCode

  constructor(code: ConnectionErrorCode, message: string) {
    super(message)
    this.name = 'DatabaseConnectionError'
    this.code = code
  }
}

export function onConnectionStateChanged(
  listener: (event: ConnectionStateEvent) => void,
): void {
  stateListener = listener
}

function safeRelease(client: PoolClient, destroy = false): void {
  try {
    client.release(destroy)
  } catch {
    /* cleanup is best effort */
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || 'Connection terminated unexpectedly')
}

function emitUsableState(
  managed: ManagedPool,
  state: 'idle' | 'connected',
  source: string,
): void {
  stateListener({
    profileId: managed.profile.id,
    state,
    expected: false,
    code: null,
    message: state === 'idle' ? 'Idle' : 'Connected',
    generation: managed.generation,
    timestamp: Date.now(),
    recoverable: true,
    recoverability: 'transient',
    source,
    activeOperationAffected: false,
  })
}

/** Converges pool/client error and end events into one generation-scoped transition. */
function handleUnexpectedDisconnect(
  id: ConnectionId,
  generation: number,
  error: unknown,
  source: string,
  code: ConnectionErrorCode = 'CONNECTION_LOST',
): void {
  const managed = pools.get(id)
  if (
    !managed ||
    managed.generation !== generation ||
    managed.terminalHandled ||
    managed.state === 'disconnecting'
  )
    return
  managed.terminalHandled = true
  managed.state = 'failed'
  const detail = reasonOf(error)
  pools.delete(id)
  console.error('[database] unexpected disconnect', {
    profileId: id,
    generation,
    source,
    activeQuery: managed.activeQueries > 0,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      code:
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : undefined,
      message: detail,
    },
  })
  for (const client of managed.checkedOut) safeRelease(client, true)
  managed.checkedOut.clear()
  void managed.pool.end().catch(() => undefined)
  try {
    stateListener({
      profileId: id,
      state: 'failed',
      expected: false,
      message: `Disconnected — ${detail}`,
      code,
      technicalDetail: detail,
      generation,
      timestamp: Date.now(),
      recoverable: true,
      recoverability: 'transient',
      source,
      activeOperationAffected: managed.activeQueries > 0,
    })
  } catch (notifyError) {
    console.error('[database] connection-state listener failed', {
      profileId: id,
      generation,
      message: reasonOf(notifyError),
    })
  }
}

function attachClientLifecycle(managed: ManagedPool, client: PoolClient): void {
  if (observedClients.has(client)) return
  observedClients.add(client)
  const handle = (error: unknown, source: string) => {
    // A released client remains an EventEmitter. Its later socket failure belongs
    // to the pool, not to an operation, and node-postgres will evict it.
    if (!managed.checkedOut.has(client)) return
    handleUnexpectedDisconnect(
      managed.profile.id,
      managed.generation,
      error,
      source,
    )
  }
  client.on('error', (error) => handle(error, 'client:active-query-error'))
  client.on('end', () =>
    handle(new Error('Connection terminated unexpectedly'), 'client:end'),
  )
}

/**
 * Read-only enforcement is delegated to Postgres itself via the
 * `default_transaction_read_only` startup option (see buildPoolConfig). The server
 * then rejects any write with a clear error, which cannot be fooled by SQL text.
 *
 * This function only adds a friendlier, earlier error for the obvious cases. It
 * deliberately inspects ONLY the leading keyword, so words like "update" appearing
 * inside string literals or identifiers can never trigger a false positive.
 */
const READ_ONLY_STARTERS = new Set([
  'select',
  'with',
  'explain',
  'show',
  'table',
  'values',
  'fetch',
  'close',
  'declare',
])

function leadingKeyword(sql: string): string {
  // Drop leading comments and whitespace, then read the first bare word.
  let s = sql.trim()
  for (;;) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n')
      if (nl === -1) return ''
      s = s.slice(nl + 1).trim()
      continue
    }
    if (s.startsWith('/*')) {
      const end = s.indexOf('*/')
      if (end === -1) return ''
      s = s.slice(end + 2).trim()
      continue
    }
    break
  }
  return (s.match(/^([a-zA-Z_]+)/)?.[1] ?? '').toLowerCase()
}

function assertReadonly(p: ConnectionProfile, sql: string): void {
  if (!p.readonly) return
  const kw = leadingKeyword(sql)
  if (kw && !READ_ONLY_STARTERS.has(kw)) {
    throw new QueryValidationError(
      `Connection is read-only, so "${kw.toUpperCase()}" is not allowed. ` +
        'Toggle "read-only" off in the connection profile if you really mean to write.',
    )
  }
}

function postgresTlsConfig(profile: ConnectionProfile): PoolConfig['ssl'] {
  switch (profile.tlsMode) {
    case 'disable':
      return false
    case 'require':
      return { rejectUnauthorized: false }
    case 'verify-ca':
      return {
        rejectUnauthorized: true,
        ...(profile.tlsCa ? { ca: profile.tlsCa } : {}),
        checkServerIdentity: () => undefined,
      }
    case 'verify-full':
      return {
        rejectUnauthorized: true,
        ...(profile.tlsCa ? { ca: profile.tlsCa } : {}),
      }
  }
}

/**
 * Pool options shared by every connection we open for a profile.
 *
 * Discrete fields are passed to `pg` rather than a serialised connection string:
 * usernames like `demo-reader@tproxy-test.example` contain characters that
 * would need percent-encoding, and round-tripping them through a URI is an easy
 * way to corrupt credentials. `pg` takes these verbatim.
 */
function buildPoolConfig(profile: ConnectionProfile, max: number): PoolConfig {
  return {
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    // An empty string would be sent as an empty password; omit it entirely so
    // passwordless auth (proxy, IAM, .pgpass, trust) works as intended.
    password: profile.password === '' ? undefined : profile.password,
    ssl: postgresTlsConfig(profile),
    max,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    // Authoritative read-only enforcement, applied at connection startup so there
    // is no window where a write could slip through.
    ...(profile.readonly
      ? { options: '-c default_transaction_read_only=on' }
      : {}),
  }
}

export async function testConnection(
  profile: ConnectionProfile,
): Promise<{ ok: true; serverVersion: string } | { ok: false; error: string }> {
  const pool = createPool({
    ...buildPoolConfig(profile, 1),
    idleTimeoutMillis: 1000,
  })
  pool.on('error', () => undefined)
  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    client.on('error', () => undefined)
    const v = await client.query('SHOW server_version')
    return {
      ok: true,
      serverVersion: String(v.rows[0]?.server_version ?? 'unknown'),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

async function closeAllPools(): Promise<void> {
  await Promise.allSettled([...pools.keys()].map((id) => disconnect(id)))
}

export async function connect(
  profile: ConnectionProfile,
): Promise<
  | { ok: true; serverVersion: string; generation: number }
  | { ok: false; error: string }
> {
  const intent = ++connectionIntent
  connectionIntents.set(profile.id, intent)
  await disconnect(profile.id)
  // disconnect invalidates an older intent; restore ownership for this attempt.
  connectionIntents.set(profile.id, intent)

  const pool = createPool({
    ...buildPoolConfig(profile, 4),
    statement_timeout: 30000,
    query_timeout: 30000,
  })
  const managed: ManagedPool = {
    pool,
    profile,
    generation: ++nextGeneration,
    state: 'connecting',
    terminalHandled: false,
    activeQueries: 0,
    checkedOut: new Set(),
  }
  // Track connecting pools as well as established pools so a profile switch or app
  // shutdown can close an in-flight attempt instead of waiting for it to finish.
  pools.set(profile.id, managed)
  // pg emits pool errors for idle clients. Install this before the first connect.
  pool.on('error', (error, client) => {
    // A separate idle socket may fail while another client is healthy and active;
    // in that case the profile remains Connected. Idle is emitted only for the
    // first idle-client-loss transition with no operation in progress.
    if (
      pools.get(profile.id)?.generation !== managed.generation ||
      managed.activeQueries > 0 ||
      managed.state === 'idle'
    )
      return
    // node-postgres reserves this event for an idle client. The pool evicts that
    // client itself; losing an unused socket is not a profile-wide disconnect.
    console.debug('[database] connection lifecycle', {
      profileId: profile.id,
      generation: managed.generation,
      event: 'idle-client-lost',
      managedState: managed.state,
      activeQueries: managed.activeQueries,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      message: reasonOf(error),
    })
    if (client) observedClients.add(client)
    managed.state = 'idle'
    emitUsableState(managed, 'idle', 'pool:idle-client-error')
  })
  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    attachClientLifecycle(managed, client)
    const v = await client.query('SHOW server_version')
    if (
      connectionIntents.get(profile.id) !== intent ||
      pools.get(profile.id)?.generation !== managed.generation
    ) {
      throw new DatabaseConnectionError(
        'CONNECTION_LOST',
        'This connection attempt was superseded by a newer connection.',
      )
    }
    managed.state = 'connected'
    return {
      ok: true,
      serverVersion: String(v.rows[0]?.server_version ?? 'unknown'),
      generation: managed.generation,
    }
  } catch (e) {
    if (client) {
      safeRelease(client, true)
      client = undefined
    }
    await pool.end().catch(() => undefined)
    if (pools.get(profile.id)?.generation === managed.generation)
      pools.delete(profile.id)
    return { ok: false, error: reasonOf(e) }
  } finally {
    // Validation must not permanently reserve one of the pool's sockets.
    if (client) safeRelease(client)
  }
}

export async function disconnect(
  id: ConnectionId,
  generation?: number,
): Promise<void> {
  const m = pools.get(id)
  if (!m || (generation !== undefined && m.generation !== generation)) return
  connectionIntents.delete(id)
  m.state = 'disconnecting'
  m.terminalHandled = true
  pools.delete(id)
  try {
    for (const client of m.checkedOut) safeRelease(client, true)
    m.checkedOut.clear()
    await m.pool.end()
  } catch {
    /* an already broken pool is still disconnected */
  }
  m.state = 'disconnected'
}

export async function disconnectAll(): Promise<void> {
  // Invalidate an in-flight connect before closing tracked pools so it cannot add a
  // fresh pool after an explicit disconnect-all (notably during app shutdown).
  connectionIntents.clear()
  await closeAllPools()
}

function getPool(id: ConnectionId): ManagedPool {
  const m = pools.get(id)
  if (!m || (m.state !== 'connected' && m.state !== 'idle'))
    throw new DatabaseConnectionError(
      'NOT_CONNECTED',
      'This profile is not connected.',
    )
  return m
}

async function withClient<T>(
  id: ConnectionId,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const managed = getPool(id)
  const generation = managed.generation
  let client: PoolClient | undefined
  managed.activeQueries++
  try {
    try {
      client = await managed.pool.connect()
    } catch (error) {
      handleUnexpectedDisconnect(
        id,
        generation,
        error,
        'pool:connect-failed',
        'RECONNECT_FAILED',
      )
      throw new DatabaseConnectionError('RECONNECT_FAILED', reasonOf(error))
    }
    managed.checkedOut.add(client)
    attachClientLifecycle(managed, client)
    if (managed.state === 'idle') {
      managed.state = 'connected'
      console.debug('[database] connection lifecycle', {
        profileId: id,
        generation,
        event: 'idle-client-recovered',
        managedState: managed.state,
        activeQueries: managed.activeQueries,
        pool: {
          total: managed.pool.totalCount,
          idle: managed.pool.idleCount,
          waiting: managed.pool.waitingCount,
        },
      })
      emitUsableState(managed, 'connected', 'pool:client-acquired')
    }
    const value = await operation(client)
    if (
      pools.get(id)?.generation !== generation ||
      managed.state !== 'connected'
    ) {
      throw new DatabaseConnectionError(
        'CONNECTION_LOST',
        'The connection was lost before the operation completed.',
      )
    }
    return value
  } catch (error) {
    if (error instanceof DatabaseConnectionError) throw error
    if (
      pools.get(id)?.generation !== generation ||
      managed.state === 'failed'
    ) {
      throw new DatabaseConnectionError('CONNECTION_LOST', reasonOf(error))
    }
    throw error
  } finally {
    if (managed.activeQueries > 0) managed.activeQueries--
    if (client) {
      managed.checkedOut.delete(client)
      safeRelease(
        client,
        managed.state === 'failed' || managed.state === 'disconnecting',
      )
    }
  }
}

/** Narrow dependency seam and read-only diagnostics for lifecycle tests. */
export const __testing = {
  assertReadonly(profile: ConnectionProfile, sql: string): void {
    assertReadonly(profile, sql)
  },
  postgresTlsConfig,
  buildPoolConfig,
  setPoolFactory(factory: (config: PoolConfig) => Pool): void {
    createPool = factory
  },
  snapshot(
    id: ConnectionId,
  ):
    | { generation: number; state: ManagedPool['state']; activeQueries: number }
    | undefined {
    const managed = pools.get(id)
    return managed
      ? {
          generation: managed.generation,
          state: managed.state,
          activeQueries: managed.activeQueries,
        }
      : undefined
  },
  activePoolIds(): ConnectionId[] {
    return [...pools.keys()]
  },
  async reset(): Promise<void> {
    await disconnectAll()
    nextGeneration = 0
    connectionIntent = 0
    connectionIntents.clear()
    createPool = (config) => new Pool(config)
    stateListener = () => undefined
  },
}

interface PostgresField {
  name: string
  dataTypeID: number
}

function toColumnMeta(fields: readonly PostgresField[]): ColumnMeta[] {
  return fields.map((f) => ({
    name: f.name,
    dataTypeID: f.dataTypeID,
    dataTypeName:
      f.dataTypeID in OID_NAMES
        ? OID_NAMES[f.dataTypeID]
        : guessTypeName(f.dataTypeID),
    logicalType: logicalTypeForOid(f.dataTypeID),
    nativeType:
      f.dataTypeID in OID_NAMES
        ? OID_NAMES[f.dataTypeID]
        : guessTypeName(f.dataTypeID),
    nativeTypeId: f.dataTypeID,
  }))
}

/** Convert pg array-mode output without losing columns that share a name. */
export function normalizePostgresResult(
  fields: readonly PostgresField[],
  positionalRows: readonly (readonly unknown[])[],
): Pick<QueryResult, 'columns' | 'rows' | 'rowCount'> {
  const reservedKeys = new Set(fields.map((field) => field.name))
  const assignedKeys = new Set<string>()
  const columns = toColumnMeta(fields).map((column, index) => {
    let key = column.name
    if (assignedKeys.has(key)) {
      let candidateIndex = index
      do {
        key = `__datakoala_column_${candidateIndex}`
        candidateIndex += 1
      } while (reservedKeys.has(key) || assignedKeys.has(key))
    }
    assignedKeys.add(key)
    return key === column.name ? column : { ...column, key }
  })
  const rows = positionalRows.map((values) =>
    Object.fromEntries(
      columns.map((column, index) => [
        column.key ?? column.name,
        values[index],
      ]),
    ),
  )
  return { columns, rows, rowCount: rows.length }
}

function logicalTypeForOid(oid: number): ColumnMeta['logicalType'] {
  if ([20, 21, 23, 700, 701, 790, 1700].includes(oid)) return 'number'
  if (oid === 16) return 'boolean'
  if (oid === 17) return 'binary'
  if (oid === 1082) return 'date'
  if ([1114, 1184].includes(oid)) return 'timestamp'
  if ([114, 3802].includes(oid)) return 'json'
  if (oid >= 10000) return 'list'
  if ([18, 19, 25, 26, 1042, 1043, 2950].includes(oid)) return 'string'
  return 'unknown'
}

/* Minimal OID -> name map covering the common PG types we care about. */
const OID_NAMES: Record<number, string> = {
  16: 'bool',
  17: 'bytea',
  18: 'char',
  19: 'name',
  20: 'int8',
  21: 'int2',
  23: 'int4',
  25: 'text',
  26: 'oid',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1184: 'timestamptz',
  1186: 'interval',
  1700: 'numeric',
  2950: 'uuid',
  3802: 'jsonb',
  114: 'json',
  1042: 'bpchar',
  1043: 'varchar',
  790: 'money',
  700: 'float4',
  701: 'float8',
}

function guessTypeName(oid: number): string {
  if (oid >= 10000) return 'array'
  return `oid:${oid}`
}

export async function runQuery(
  id: ConnectionId,
  sql: string,
  parameters: unknown[] = [],
): Promise<QueryResult> {
  const m = getPool(id)
  assertReadonly(m.profile, sql)
  return withClient(id, async (client) => {
    const start = performance.now()
    const r: PgQueryResult<unknown[]> = await client.query({
      text: sql,
      values: parameters,
      rowMode: 'array',
    })
    const durationMs = Math.round(performance.now() - start)
    const normalized = normalizePostgresResult(r.fields, r.rows)
    return {
      columns: normalized.columns,
      rows: normalized.rows,
      rowCount: r.rowCount ?? r.rows.length,
      durationMs,
      execution: {
        provider: 'postgres',
        durationMs,
        rowCount: r.rowCount ?? r.rows.length,
      },
    }
  })
}

export async function listObjects(
  id: ConnectionId,
): Promise<{ schema: string; name: string; kind: 'r' | 'v' | 'm' }[]> {
  return withClient(id, async (client) => {
    const r = await client.query<{
      schema: string
      name: string
      table_type: string
    }>(
      `select table_schema as schema, table_name as name, table_type
       from information_schema.tables
       order by table_schema, table_name`,
    )
    return r.rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      kind:
        row.table_type === 'VIEW'
          ? 'v'
          : row.table_type === 'FOREIGN'
            ? 'v'
            : 'r',
    }))
  })
}

export async function describeTable(
  id: ConnectionId,
  schema: string,
  table: string,
): Promise<{ name: string; dataTypeName: string; nullable: boolean }[]> {
  return withClient(id, async (client) => {
    const r = await client.query(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = $1 and table_name = $2
       order by ordinal_position`,
      [schema, table],
    )
    return r.rows.map((row: Record<string, string>) => ({
      name: row.column_name,
      dataTypeName: row.data_type,
      nullable: row.is_nullable === 'YES',
    }))
  })
}

type PostgresExplainRecord = Record<string, unknown>

function explainRecord(value: unknown): PostgresExplainRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as PostgresExplainRecord)
    : null
}

function explainNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function explainString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function explainStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter(
    (item): item is string => typeof item === 'string',
  )
  return strings.length === value.length ? strings : undefined
}

function explainPlanLabel(node: PostgresExplainRecord): string {
  const nodeType = explainString(node['Node Type']) ?? 'Unknown'
  const schema = explainString(node.Schema)
  const relation = explainString(node['Relation Name'])
  const index = explainString(node['Index Name'])
  const target = relation ? `${schema ? `${schema}.` : ''}${relation}` : ''
  return [nodeType, target, index ? `using ${index}` : '']
    .filter(Boolean)
    .join(' · ')
}

function normalizeExplainNode(value: unknown, id: string): ExplainNode {
  const node = explainRecord(value)
  if (!node)
    throw new Error('PostgreSQL returned an invalid execution-plan node.')

  const rawChildren = Array.isArray(node.Plans) ? node.Plans : []
  const children = rawChildren.map((child, index) =>
    normalizeExplainNode(child, `${id}.${index}`),
  )

  return {
    id,
    plan: explainPlanLabel(node),
    nodeType: explainString(node['Node Type']) ?? 'Unknown',
    relation: explainString(node['Relation Name']),
    schema: explainString(node.Schema),
    alias: explainString(node.Alias),
    index: explainString(node['Index Name']),
    joinType: explainString(node['Join Type']),
    parentRelationship: explainString(node['Parent Relationship']),
    startupCost: explainNumber(node['Startup Cost']),
    totalCost: explainNumber(node['Total Cost']),
    planRows: explainNumber(node['Plan Rows']),
    planWidth: explainNumber(node['Plan Width']),
    actualRows: explainNumber(node['Actual Rows']),
    actualStartupTime: explainNumber(node['Actual Startup Time']),
    actualTotalTime: explainNumber(node['Actual Total Time']),
    loops: explainNumber(node['Actual Loops']),
    filter: explainString(node.Filter),
    indexCond: explainString(node['Index Cond']),
    hashCond: explainString(node['Hash Cond']),
    mergeCond: explainString(node['Merge Cond']),
    joinFilter: explainString(node['Join Filter']),
    sortKey: explainStrings(node['Sort Key']),
    groupKey: explainStrings(node['Group Key']),
    rowsRemovedByFilter: explainNumber(node['Rows Removed by Filter']),
    sharedHitBlocks: explainNumber(node['Shared Hit Blocks']),
    sharedReadBlocks: explainNumber(node['Shared Read Blocks']),
    tempReadBlocks: explainNumber(node['Temp Read Blocks']),
    tempWrittenBlocks: explainNumber(node['Temp Written Blocks']),
    ...(children.length ? { children } : {}),
  }
}

function formatExplainTree(node: ExplainNode, depth = 0): string[] {
  const estimate =
    node.startupCost !== undefined || node.totalCost !== undefined
      ? `cost=${node.startupCost ?? '?'}..${node.totalCost ?? '?'} rows=${node.planRows ?? '?'}`
      : ''
  const actual =
    node.actualRows !== undefined
      ? `actual rows=${node.actualRows} loops=${node.loops ?? '?'} time=${node.actualTotalTime ?? '?'}ms`
      : ''
  const metrics = [estimate, actual].filter(Boolean).join(' · ')
  const line = `${'  '.repeat(depth)}${node.plan}${
    metrics ? `  (${metrics})` : ''
  }`
  return [
    line,
    ...(node.children ?? []).flatMap((child) =>
      formatExplainTree(child, depth + 1),
    ),
  ]
}

export function normalizePostgresExplain(
  value: unknown,
  analyze: boolean,
): ExplainResult {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      throw new Error('PostgreSQL returned invalid JSON for EXPLAIN.')
    }
  }
  const envelope = explainRecord(Array.isArray(parsed) ? parsed[0] : parsed)
  const rawPlan = envelope ? envelope.Plan : undefined
  if (!rawPlan)
    throw new Error('PostgreSQL returned EXPLAIN JSON without a plan tree.')

  const tree = normalizeExplainNode(rawPlan, '0')
  return {
    text: formatExplainTree(tree).join('\n'),
    tree,
    analyze,
    planningTimeMs: explainNumber(envelope?.['Planning Time']),
    executionTimeMs: explainNumber(envelope?.['Execution Time']),
  }
}

export async function explainQuery(
  id: ConnectionId,
  sql: string,
  analyze: boolean,
): Promise<ExplainResult> {
  const m = getPool(id)
  assertReadonly(m.profile, sql)
  return withClient(id, async (client) => {
    const prefix = analyze
      ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'
      : 'EXPLAIN (FORMAT JSON)'
    const result = await client.query({ text: `${prefix} ${sql}` })
    const row = result.rows[0] as Record<string, unknown> | undefined
    const value =
      row?.['QUERY PLAN'] ?? (row ? Object.values(row)[0] : undefined)
    return normalizePostgresExplain(value, analyze)
  })
}
