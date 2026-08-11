import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SQLITE_CATALOG, SQLITE_FILE_CAPABILITIES, validateSqliteOriginal } from './sqlite-file-adapter.ts'

test('SQLite datasource advertises only supported read-only capabilities', () => {
  assert.equal(SQLITE_CATALOG, 'sqlite')
  assert.deepEqual(SQLITE_FILE_CAPABILITIES, {
    builder: true, explain: false, analyze: false, queryCancellation: false,
    parameterizedQueries: true, costEstimate: false, serverReadOnly: true, schemaAutocomplete: true
  })
})

test('SQLite file validation reports missing, empty, corrupt, and active-WAL files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datakoala-sqlite-validation-'))
  try {
    await assert.rejects(validateSqliteOriginal(join(dir, 'missing.db')), /missing/i)
    const path = join(dir, 'fixture.sqlite3')
    await writeFile(path, '')
    await assert.rejects(validateSqliteOriginal(path), /empty/i)
    await writeFile(path, 'not a database')
    await assert.rejects(validateSqliteOriginal(path), /invalid header/i)
    await writeFile(path, Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.alloc(100)]))
    await writeFile(`${path}-wal`, 'active')
    await assert.rejects(validateSqliteOriginal(path), /checkpoint/i)
    assert.equal((await stat(path)).size, 116)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('SQLite file validation identifies databases by content regardless of extension', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datakoala-sqlite-content-validation-'))
  try {
    for (const name of ['extensionless', 'fixture.db3']) {
      const path = join(dir, name)
      execFileSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table valid(value text)'); c.commit(); c.close()", path])
      // macOS exposes /var through the /private/var realpath; validation is
      // intentionally canonical so compare canonical paths on every platform.
      assert.equal(await validateSqliteOriginal(path), await realpath(path))
    }
    const text = join(dir, 'looks-like-data.anything')
    await writeFile(text, 'This is readable and non-empty, but it is not SQLite.')
    await assert.rejects(validateSqliteOriginal(text), /invalid header/i)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
