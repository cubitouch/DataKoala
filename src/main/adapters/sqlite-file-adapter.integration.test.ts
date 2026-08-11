import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { SqliteFileProfile } from '../../shared/types.ts'
import { SqliteFileAdapter } from './sqlite-file-adapter.ts'
import { generateBuilderQuery } from '../../renderer/src/lib/builderSql.ts'

async function fingerprint(path: string) {
  const info = await stat(path, { bigint: true })
  return { hash: createHash('sha256').update(await readFile(path)).digest('hex'), size: info.size, mtimeNs: info.mtimeNs }
}

async function assertNoSidecars(database: string) {
  for (const suffix of ['-wal', '-shm', '-journal']) await assert.rejects(stat(`${database}${suffix}`), /ENOENT/)
}

test('real SQLite adapter attaches the source read-only, remains bounded, browsable, and Builder-compatible', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'datakoala-sqlite-integration-'))
  const database = join(dir, 'fixture.sqlite3')
  const unrelated = join(dir, 'secret.csv')
  try {
    execFileSync('python3', ['-c', `
import sqlite3, sys
p=sys.argv[1]
c=sqlite3.connect(p)
c.executescript('''
CREATE TABLE events ("when" TIMESTAMP, category TEXT, amount REAL, enabled INTEGER, note TEXT, payload BLOB);
CREATE TABLE empty_table (id INTEGER, weak_column MYSTERY_TYPE);
CREATE TABLE "quoted table ☃" ("odd column" TEXT);
CREATE VIEW event_totals AS SELECT category, SUM(amount) AS total FROM events GROUP BY category;
''')
c.executemany('INSERT INTO events VALUES (?,?,?,?,?,?)', [
 ('2024-01-01T00:00:00Z','alpha',1.5,1,None,b'\\x00\\xff'),
 ('2024-01-02T00:00:00Z','beta',2.5,0,'café',b'blob')])
c.execute('INSERT INTO "quoted table ☃" VALUES (?)', ('Unicode ✓',))
c.execute('CREATE TABLE many_rows (id INTEGER, mixed)')
c.executemany('INSERT INTO many_rows VALUES (?,?)', ((i, i if i%2 else str(i)) for i in range(10001)))
c.commit(); c.close()
`, database])
    await writeFile(unrelated, 'private\nvalue\n')
    const before = await fingerprint(database)
    const profile: SqliteFileProfile = { kind: 'sqlite-file', version: 1, id: 'sqlite-integration', name: 'fixture', path: database, readonly: true }
    const adapter = new SqliteFileAdapter()
    const tested = await adapter.test(profile)
    assert.deepEqual(await fingerprint(database), before)
    assert.equal(tested.ok, true, tested.ok ? undefined : tested.error)

    const connected = await adapter.connect(profile)
    assert.equal(connected.result.ok, true, connected.result.ok ? undefined : connected.result.error)
    assert.ok(connected.session)
    const session = connected.session!

    const attached = await session.query({ sql: "SELECT readonly FROM duckdb_databases() WHERE database_name = 'sqlite'" })
    assert.deepEqual(attached.rows, [{ readonly: true }])

    const relations = await session.listRelations()
    assert.ok(relations.some((r) => r.name === 'events' && r.kind === 'table'))
    assert.ok(relations.some((r) => r.name === 'event_totals' && r.kind === 'view'))
    assert.ok(relations.some((r) => r.name === 'empty_table'))
    assert.ok(relations.some((r) => r.name === 'quoted table ☃'))
    const columns = await session.describeRelation({ namespace: 'sqlite', name: 'events' })
    assert.ok(columns.some((c) => c.name === 'amount'))

    const normalized = await session.query({ sql: 'SELECT * FROM sqlite.events ORDER BY category' })
    assert.equal(normalized.rowCount, 2)
    assert.equal(normalized.rows[0].note, null)
    assert.equal(typeof normalized.rows[0].payload, 'string')
    const categorical = generateBuilderQuery({
      dialect: 'duckdb', table: { schema: 'sqlite', name: 'events' },
      xColumn: 'category', xColumnDataType: 'text', valueColumn: 'amount', aggregation: 'sum'
    })
    const categoricalResult = await session.query(categorical)
    assert.deepEqual(categoricalResult.rows.map((r) => r.category), ['alpha', 'beta'])

    const temporal = generateBuilderQuery({
      dialect: 'duckdb', table: { schema: 'sqlite', name: 'events' },
      xColumn: 'when', xColumnDataType: 'timestamp', timeColumn: 'when', timeColumnDataType: 'timestamp',
      timeBucket: 'day', timeRange: { kind: 'all' }, valueColumn: 'amount', aggregation: 'sum'
    })
    const temporalResult = await session.query(temporal)
    assert.equal(temporalResult.rowCount, 2)

    const independentlyFiltered = generateBuilderQuery({
      dialect: 'duckdb', table: { schema: 'sqlite', name: 'events' },
      xColumn: 'category', xColumnDataType: 'text', timeColumn: 'when', timeColumnDataType: 'timestamp',
      timeRange: { kind: 'rolling', amount: 7, unit: 'day' }, aggregation: 'count'
    })
    assert.match(independentlyFiltered.sql, /"when" >= CURRENT_TIMESTAMP/)
    await session.query(independentlyFiltered)

    const parameterized = generateBuilderQuery({
      dialect: 'duckdb', table: { schema: 'sqlite', name: 'events' },
      xColumn: 'category', xColumnDataType: 'text', timeColumn: 'when', timeColumnDataType: 'timestamp',
      timeRange: { kind: 'custom', startDate: '2024-01-01', startTime: '00:00', endDate: '2024-01-03', endTime: '00:00', recurringWindows: [] },
      valueColumn: 'amount', aggregation: 'average',
      filters: [{ id: 'category-alpha', column: 'category', operator: 'equals', value: 'alpha', execution: 'query' }]
    })
    assert.ok(parameterized.parameters.length >= 3)
    const parameterizedResult = await session.query(parameterized)
    assert.equal(parameterizedResult.rowCount, 1)

    const bounded = await session.query({ sql: 'SELECT * FROM sqlite.many_rows ORDER BY id' })
    assert.equal(bounded.rowCount, 10_000)
    assert.equal(bounded.execution?.truncated, true)

    for (const sql of [
      'DELETE FROM sqlite.events',
      `ATTACH '${unrelated.replaceAll("'", "''")}' AS unrelated`,
      `SELECT * FROM read_csv('${unrelated.replaceAll("'", "''")}')`,
      "LOAD 'httpfs'",
      `COPY (SELECT 1) TO '${join(dir, 'written.csv').replaceAll("'", "''")}'`
    ]) await assert.rejects(session.query({ sql }), /read.only|external|permission|allowed|configuration/i)

    assert.deepEqual(await fingerprint(database), before)
    await assertNoSidecars(database)
    await session.close()
    assert.deepEqual(await fingerprint(database), before)
    await assertNoSidecars(database)

    execFileSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute(\"insert into events values ('2024-01-03T00:00:00Z','gamma',3.5,1,NULL,X'01')\"); c.commit(); c.close()", database])

    const reconnected = await adapter.connect(profile)
    assert.equal(reconnected.result.ok, true)
    const changed = await reconnected.session!.query({ sql: 'SELECT COUNT(*) AS count FROM sqlite.events' })
    assert.equal(Number(changed.rows[0].count), 3)
    await reconnected.session!.close()
    await assertNoSidecars(database)

    const corrupt = join(dir, 'corrupt.sqlite')
    execFileSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table damaged(value text)'); c.executemany('insert into damaged values (?)', [('payload',)] * 1000); c.commit(); c.close()", corrupt])
    await truncate(corrupt, 512)
    const corruptProfile = { ...profile, path: corrupt }
    const corruptTest = await adapter.test(corruptProfile)
    assert.equal(corruptTest.ok, false)
    if (!corruptTest.ok) assert.match(corruptTest.error, /Unable to open SQLite database|invalid|malformed|corrupt/i)
    const corruptConnection = await adapter.connect(corruptProfile)
    assert.equal(corruptConnection.result.ok, false)
    if (!corruptConnection.result.ok) assert.match(corruptConnection.result.error, /Unable to open SQLite database|invalid|malformed|corrupt/i)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
