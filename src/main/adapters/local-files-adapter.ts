import { extname, basename } from 'node:path'
import { realpath } from 'node:fs/promises'
import { DuckDBInstance, StatementType, type DuckDBConnection, type DuckDBResultReader, type DuckDBValue } from '@duckdb/node-api'
import type { DataSourceAdapter, DataSourceSession } from '../data-source.ts'
import type { ColumnMeta, DataSourceCapabilities, DataSourceProfile, LocalFilesProfile, LogicalType, QueryResult } from '../../shared/types.ts'

export const MAX_LOCAL_FILE_RESULT_ROWS = 10_000

export const LOCAL_FILES_CAPABILITIES: DataSourceCapabilities = {
  builder: true, explain: false, analyze: false, queryCancellation: false,
  parameterizedQueries: true, costEstimate: false, serverReadOnly: true, schemaAutocomplete: true
}

/** Runtime smoke seam: proves Electron can load the host DuckDB addon and query it. */
export async function smokeDuckDB(): Promise<unknown> {
  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()
  try {
    const result = await connection.runAndReadAll('SELECT 42 AS answer')
    return result.getRowObjectsJS()[0]?.answer
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

function localProfile(profile: DataSourceProfile): LocalFilesProfile {
  if (profile.kind !== 'local-files') throw new Error(`Local files adapter cannot open ${profile.kind}`)
  if (!profile.files.length) throw new Error('Choose at least one data file.')
  return profile
}

export function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"` }
export function quoteLiteral(value: string): string { return `'${value.replaceAll("'", "''")}'` }

export function defaultFileAlias(path: string): string {
  const stem = basename(path, extname(path)).replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^\d/, '_$&')
  return stem || 'data'
}

export function validateFiles(profile: LocalFilesProfile): void {
  const aliases = new Set<string>()
  for (const file of profile.files) {
    if (!file.alias.trim()) throw new Error('Every file needs a table alias.')
    const folded = file.alias.toLocaleLowerCase()
    if (aliases.has(folded)) throw new Error(`Duplicate table alias: ${file.alias}`)
    aliases.add(folded)
  }
}

function hintedReaderSql(path: string): string[] {
  const extension = extname(path).toLowerCase()
  const literal = quoteLiteral(path)
  const parquet = `read_parquet(${literal})`
  const json = `read_json_auto(${literal})`
  const delimited = `read_csv_auto(${literal}${extension === '.tsv' ? ", delim = '\\t'" : ''}, header = true)`
  if (extension === '.parquet') return [parquet, json, delimited]
  // JSON must precede the CSV sniffer: valid JSON can otherwise be accepted as
  // a misleading one-column delimited file.
  if (extension === '.json' || extension === '.jsonl' || extension === '.ndjson') return [json, parquet, delimited]
  if (extension === '.csv' || extension === '.tsv') return [json, delimited, parquet]
  return [parquet, json, delimited]
}

async function registerFileView(connection: DuckDBConnection, path: string, alias: string): Promise<void> {
  for (const reader of hintedReaderSql(path)) {
    try {
      await connection.run(`CREATE VIEW ${quoteIdentifier(alias)} AS SELECT * FROM ${reader}`)
      return
    } catch { /* Try the next tabular reader against the same allowlisted path. */ }
  }
  throw new Error(`Unsupported tabular file: ${basename(path)}. Expected Parquet, JSON/NDJSON, or delimited text.`)
}

async function configureFileSandbox(connection: DuckDBConnection, paths: string[]): Promise<void> {
  await connection.run(`SET allowed_paths = [${paths.map(quoteLiteral).join(', ')}]`)
  await connection.run('SET allow_community_extensions = false')
  await connection.run('SET autoinstall_known_extensions = false')
  await connection.run('SET autoload_known_extensions = false')
  await connection.run('SET allow_persistent_secrets = false')
  await connection.run('SET enable_external_access = false')
}

export function logicalType(native: string): LogicalType {
  const type = native.toUpperCase()
  if (/^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|U?TINYINT|U?SMALLINT|U?INTEGER|U?BIGINT|FLOAT|DOUBLE|DECIMAL)/.test(type)) return 'number'
  if (type === 'BOOLEAN') return 'boolean'
  if (type === 'DATE') return 'date'
  if (type.includes('TIMESTAMP') || type.startsWith('TIME')) return 'timestamp'
  if (type.endsWith('[]')) return 'list'
  if (type.startsWith('STRUCT') || type.startsWith('MAP') || type.startsWith('UNION')) return 'struct'
  if (type === 'BLOB' || type === 'BIT') return 'binary'
  if (type === 'JSON') return 'json'
  if (type.includes('CHAR') || type === 'VARCHAR' || type === 'UUID' || type === 'ENUM') return 'string'
  return 'unknown'
}

export async function assertDuckDBReadOnlyQuery(connection: DuckDBConnection, sql: string, label = 'Local file connections'): Promise<void> {
  const extracted = await connection.extractStatements(sql)
  if (extracted.count !== 1) throw new Error('Run exactly one read-only query at a time.')
  const statement = await extracted.prepare(0)
  try {
    if (statement.statementType !== StatementType.SELECT && statement.statementType !== StatementType.EXPLAIN) {
      throw new Error(`${label} are read-only. Run a SELECT or EXPLAIN query.`)
    }
  } finally {
    statement.destroySync()
  }
}

export function queryResultFromDuckDBReader(reader: DuckDBResultReader, started: number, truncated = false): QueryResult {
  const names = reader.columnNames()
  const nativeTypes = reader.columnTypes().map(String)
  const columns: ColumnMeta[] = names.map((name, index) => ({
    name, nativeType: nativeTypes[index], logicalType: logicalType(nativeTypes[index]),
    nativeTypeId: nativeTypes[index], dataTypeID: 0, dataTypeName: nativeTypes[index].toLowerCase()
  }))
  const rows = (reader.getRowObjectsJson() as Record<string, unknown>[]).slice(0, MAX_LOCAL_FILE_RESULT_ROWS)
  const durationMs = Math.round(performance.now() - started)
  return { columns, rows, rowCount: rows.length, durationMs, execution: { provider: 'duckdb', durationMs, rowCount: rows.length, truncated } }
}

async function resultFrom(connection: DuckDBConnection, sql: string): Promise<QueryResult> {
  const started = performance.now()
  const reader = await connection.runAndReadAll(sql)
  return queryResultFromDuckDBReader(reader, started)
}

async function boundedUserQuery(connection: DuckDBConnection, sql: string, parameters: unknown[]): Promise<QueryResult> {
  const started = performance.now()
  const reader = await connection.streamAndReadUntil(sql, MAX_LOCAL_FILE_RESULT_ROWS + 1, parameters as DuckDBValue[])
  return queryResultFromDuckDBReader(reader, started, reader.currentRowCount > MAX_LOCAL_FILE_RESULT_ROWS)
}

async function open(profile: LocalFilesProfile): Promise<{ instance: DuckDBInstance; connection: DuckDBConnection }> {
  validateFiles(profile)
  // Canonical paths make the allowlist match what the local filesystem resolves,
  // including files selected through symlinks, without granting their directory.
  const paths = await Promise.all(profile.files.map((file) => realpath(file.path)))
  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()
  try {
    await configureFileSandbox(connection, paths)
    for (const [index, file] of profile.files.entries()) {
      await registerFileView(connection, paths[index], file.alias)
    }
    // User SQL cannot relax the filesystem or extension restrictions after the
    // selected-file views have been registered.
    await connection.run('SET lock_configuration = true')
    return { instance, connection }
  } catch (error) {
    connection.closeSync(); instance.closeSync(); throw error
  }
}

export class LocalFilesAdapter implements DataSourceAdapter {
  readonly kind = 'local-files' as const
  private generation = 0

  async test(profile: DataSourceProfile) {
    try {
      const opened = await open(localProfile(profile))
      opened.connection.closeSync(); opened.instance.closeSync()
      return { ok: true as const, sourceInfo: { label: 'Local files (DuckDB)' } }
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) } }
  }

  async connect(profile: DataSourceProfile) {
    const files = localProfile(profile)
    try {
      const { instance, connection } = await open(files)
      const session: DataSourceSession = {
        info: { profileId: files.id, provider: 'local-files', serverVersion: 'DuckDB' },
        capabilities: LOCAL_FILES_CAPABILITIES,
        query: async ({ sql, parameters = [] }) => {
          await assertDuckDBReadOnlyQuery(connection, sql)
          return boundedUserQuery(connection, sql, parameters)
        },
        listNamespaces: async () => [{ name: 'main' }],
        listRelations: async () => files.files.map((file) => ({ namespace: 'main', name: file.alias, kind: 'view' as const })),
        describeRelation: async ({ name }) => {
          const result = await resultFrom(connection, `DESCRIBE ${quoteIdentifier(name)}`)
          return result.rows.map((row) => ({ name: String(row.column_name), nativeType: String(row.column_type), nullable: String(row.null).toUpperCase() !== 'NO' }))
        },
        close: async () => { connection.closeSync(); instance.closeSync() }
      }
      return { result: { ok: true as const, generation: ++this.generation, sourceInfo: { label: 'Local files (DuckDB)' } }, session }
    } catch (error) { return { result: { ok: false as const, error: error instanceof Error ? error.message : String(error) } } }
  }
}
