import { constants } from 'node:fs'
import { access, open as openFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from '@duckdb/node-api'
import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { DataSourceCapabilities, DataSourceProfile, QueryResult, SqliteFileProfile } from '../../shared/types.ts'
import { MAX_LOCAL_FILE_RESULT_ROWS, assertDuckDBReadOnlyQuery, queryResultFromDuckDBReader, quoteIdentifier, quoteLiteral } from './local-files-adapter.ts'

export const SQLITE_CATALOG = 'sqlite'
export const SQLITE_FILE_CAPABILITIES: DataSourceCapabilities = {
  builder: true, explain: false, analyze: false, queryCancellation: false,
  parameterizedQueries: true, costEstimate: false, serverReadOnly: true, schemaAutocomplete: true
}

function sqliteProfile(profile: DataSourceProfile): SqliteFileProfile {
  if (profile.kind !== 'sqlite-file') throw new Error(`SQLite adapter cannot open ${profile.kind}`)
  if (!profile.path.trim()) throw new Error('Choose one SQLite database file.')
  return profile
}

/** The binary is a build input, never downloaded by the running application. */
export function packagedSqliteExtensionPath(): string {
  if (process.env.DATAKOALA_SQLITE_EXTENSION_PATH) return resolve(process.env.DATAKOALA_SQLITE_EXTENSION_PATH)
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string; defaultApp?: boolean }
  if (electronProcess.resourcesPath && !electronProcess.defaultApp) return resolve(electronProcess.resourcesPath, 'duckdb-extensions', `${process.platform}-${process.arch}`, 'sqlite_scanner.duckdb_extension')
  const root = process.env.APP_ROOT ?? resolve(dirname(new URL(import.meta.url).pathname), '../../..')
  return resolve(root, 'resources', 'duckdb-extensions', `${process.platform}-${process.arch}`, 'sqlite_scanner.duckdb_extension')
}

export async function validateSqliteOriginal(path: string): Promise<string> {
  let canonical: string
  try { canonical = await realpath(path) } catch { throw new Error(`SQLite database is missing: ${basename(path)}`) }
  try { await access(canonical, constants.R_OK) } catch { throw new Error(`SQLite database is not readable: ${basename(path)}`) }
  const info = await stat(canonical)
  if (!info.isFile()) throw new Error('The selected SQLite database is not a regular file.')
  if (info.size === 0) throw new Error('The selected SQLite database is empty.')
  const handle = await openFile(canonical, 'r')
  try {
    const header = Buffer.alloc(16); await handle.read(header, 0, 16, 0)
    if (header.toString('binary') !== 'SQLite format 3\u0000') throw new Error('The selected file is not a valid SQLite database (invalid header).')
  } finally { await handle.close() }
  const wal = `${canonical}-wal`
  try {
    if ((await stat(wal)).size > 0) {
      throw new Error('This SQLite database has an active WAL. Close its writer and checkpoint it (PRAGMA wal_checkpoint) before connecting.')
    }
  } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
  }
  return canonical
}

interface Opened { instance: DuckDBInstance; connection: DuckDBConnection }
async function openDatabase(profile: SqliteFileProfile): Promise<Opened> {
  const original = await validateSqliteOriginal(profile.path)
  const extension = packagedSqliteExtensionPath()
  try { await access(extension, constants.R_OK) } catch { throw new Error(`Packaged DuckDB SQLite extension is missing: ${extension}`) }
  let instance: DuckDBInstance | undefined; let connection: DuckDBConnection | undefined
  try {
    instance = await DuckDBInstance.create(':memory:'); connection = await instance.connect()
    await connection.run(`LOAD ${quoteLiteral(extension)}`)
    await connection.run('SET allow_community_extensions = false')
    await connection.run('SET autoinstall_known_extensions = false')
    await connection.run('SET autoload_known_extensions = false')
    await connection.run('SET allow_persistent_secrets = false')
    await connection.run(`SET allowed_paths = [${quoteLiteral(original)}]`)
    await connection.run(`ATTACH ${quoteLiteral(original)} AS ${quoteIdentifier(SQLITE_CATALOG)} (TYPE SQLITE, READ_ONLY)`)
    await connection.run('SET enable_external_access = false')
    await connection.run('SET lock_configuration = true')
    await connection.runAndReadAll(`SELECT table_name FROM information_schema.tables WHERE table_catalog = ${quoteLiteral(SQLITE_CATALOG)} LIMIT 1`)
    return { instance, connection }
  } catch (error) {
    connection?.closeSync(); instance?.closeSync()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(/sqlite|database|malformed/i.test(message) ? `Unable to open SQLite database: ${message}` : message)
  }
}

async function boundedQuery(connection: DuckDBConnection, sql: string, parameters: unknown[]): Promise<QueryResult> {
  const started = performance.now()
  const reader = await connection.streamAndReadUntil(sql, MAX_LOCAL_FILE_RESULT_ROWS + 1, parameters as DuckDBValue[])
  return queryResultFromDuckDBReader(reader, started, reader.currentRowCount > MAX_LOCAL_FILE_RESULT_ROWS)
}

export class SqliteFileAdapter implements DataSourceAdapter {
  readonly kind = 'sqlite-file' as const
  private generation = 0
  async test(profile: DataSourceProfile) {
    try {
      const opened = await openDatabase(sqliteProfile(profile)); opened.connection.closeSync(); opened.instance.closeSync()
      return { ok: true as const, sourceInfo: { label: 'SQLite file (DuckDB)' } }
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
  }
  async connect(profile: DataSourceProfile) {
    const sqlite = sqliteProfile(profile)
    try {
      const opened = await openDatabase(sqlite); const { connection, instance } = opened
      const session: DataSourceSession = {
        info: { profileId: sqlite.id, provider: 'sqlite-file', serverVersion: 'DuckDB + SQLite' },
        capabilities: SQLITE_FILE_CAPABILITIES,
        query: async ({ sql, parameters = [] }) => { await assertDuckDBReadOnlyQuery(connection, sql, 'SQLite connections'); return boundedQuery(connection, sql, parameters) },
        listNamespaces: async () => [{ name: SQLITE_CATALOG }],
        listRelations: async () => {
          const r = await connection.runAndReadAll(`SELECT table_name, table_type FROM information_schema.tables WHERE table_catalog = ${quoteLiteral(SQLITE_CATALOG)} ORDER BY table_name`)
          return r.getRowObjectsJson().map((row) => ({ namespace: SQLITE_CATALOG, name: String(row.table_name), kind: String(row.table_type).toUpperCase() === 'VIEW' ? 'view' as const : 'table' as const }))
        },
        describeRelation: async ({ name }) => {
          const r = await connection.runAndReadAll(`DESCRIBE SELECT * FROM ${quoteIdentifier(SQLITE_CATALOG)}.${quoteIdentifier(name)}`)
          return r.getRowObjectsJson().map((row) => ({ name: String(row.column_name), nativeType: String(row.column_type), nullable: String(row.null).toUpperCase() !== 'NO' }))
        },
        close: async () => { connection.closeSync(); instance.closeSync() }
      }
      return { result: { ok: true as const, generation: ++this.generation, sourceInfo: { label: 'SQLite file (DuckDB)' } }, session }
    } catch (error) { return { result: { ok: false as const, error: error instanceof Error ? error.message : String(error) } } }
  }
}
