import { createHash } from 'node:crypto'
import { mkdir, readFile, copyFile, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { DuckDBInstance } from '@duckdb/node-api'

const destination = resolve(
  process.env.DATAKOALA_SQLITE_EXTENSION_PATH ??
  `resources/duckdb-extensions/${process.platform}-${process.arch}/sqlite_scanner.duckdb_extension`
)

async function canLoad(path) {
  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()
  try {
    await connection.run(`LOAD '${path.replaceAll("'", "''")}'`)
    const result = await connection.runAndReadAll("SELECT installed, loaded FROM duckdb_extensions() WHERE extension_name = 'sqlite_scanner'")
    const row = result.getRowObjectsJS()[0]
    return row?.loaded === true
  } catch { return false }
  finally { connection.closeSync(); instance.closeSync() }
}

if (!await canLoad(destination)) {
  const isolatedHome = resolve(tmpdir(), `datakoala-duckdb-extension-${process.pid}`)
  await mkdir(isolatedHome, { recursive: true })
  const oldHome = process.env.HOME
  process.env.HOME = isolatedHome
  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()
  let installedPath
  try {
    await connection.run('FORCE INSTALL sqlite FROM core')
    const result = await connection.runAndReadAll("SELECT install_path FROM duckdb_extensions() WHERE extension_name = 'sqlite_scanner'")
    installedPath = result.getRowObjectsJS()[0]?.install_path
  } finally {
    connection.closeSync(); instance.closeSync()
    process.env.HOME = oldHome ?? homedir()
  }
  if (!installedPath || !await canLoad(String(installedPath))) {
    await rm(isolatedHome, { recursive: true, force: true })
    throw new Error('DuckDB downloaded sqlite_scanner but its signed binary could not be loaded.')
  }
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(String(installedPath), destination)
  await rm(isolatedHome, { recursive: true, force: true })
}

if (!await canLoad(destination)) throw new Error(`Required SQLite extension is absent or incompatible: ${destination}`)
const digest = createHash('sha256').update(await readFile(destination)).digest('hex')
await writeFile(`${destination}.sha256`, `${digest}  sqlite_scanner.duckdb_extension\n`)
console.log(`SQLITE_EXTENSION_OK ${destination} sha256=${digest}`)
