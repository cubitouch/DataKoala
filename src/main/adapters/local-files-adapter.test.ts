import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DuckDBInstance } from '@duckdb/node-api'
import { LOCAL_FILES_CAPABILITIES, LocalFilesAdapter, MAX_LOCAL_FILE_RESULT_ROWS, defaultFileAlias, smokeDuckDB, validateFiles } from './local-files-adapter.ts'
import type { LocalFilesProfile } from '../../shared/types.ts'
import { generateBuilderQuery } from '../../renderer/src/lib/builderSql.ts'
import { createResultFilter, type BuilderFilterProvenance } from '../../renderer/src/lib/resultFilters.ts'
import { encodeBuilderSeriesTuple } from '../../renderer/src/lib/resultVisualization.ts'
import { buildSeriesCardinalityProbe } from '../../shared/seriesCardinality.ts'

const pad2 = (value: number) => String(value).padStart(2, '0')
const localDate = (value: Date) => `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
const localTime = (value: Date) => `${pad2(value.getHours())}:${pad2(value.getMinutes())}`

test('local file aliases are safe and duplicate aliases are rejected', () => {
  assert.equal(LOCAL_FILES_CAPABILITIES.builder, true)
  assert.equal(LOCAL_FILES_CAPABILITIES.parameterizedQueries, true)
  assert.equal(defaultFileAlias('/tmp/2026 sales-data.csv'), '_2026_sales_data')
  const profile: LocalFilesProfile = { kind: 'local-files', version: 1, id: 'files', name: 'files', readonly: true,
    files: [{ path: '/tmp/a.csv', alias: 'sales' }, { path: '/tmp/b.csv', alias: 'SALES' }] }
  assert.throws(() => validateFiles(profile), /Duplicate table alias/)
})

test('DuckDB native addon opens an in-memory instance', async () => {
  assert.equal(await smokeDuckDB(), 42)
})

test('DuckDB session queries selected files and sandboxes every unselected file reader', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'datakoala-files-'))
  const path = join(directory, 'sales.csv')
  const unselectedCsv = join(directory, 'private.csv')
  const unselectedParquet = join(directory, 'private.parquet')
  await writeFile(path, 'day,region,amount\n2026-01-01,eu,12.5\n2026-01-02,us,7.5\n')
  await writeFile(unselectedCsv, 'secret\nnot-selected\n')
  const fixtureInstance = await DuckDBInstance.create(':memory:')
  const fixtureConnection = await fixtureInstance.connect()
  await fixtureConnection.run(`COPY (SELECT 'not-selected' AS secret) TO '${unselectedParquet}' (FORMAT PARQUET)`)
  fixtureConnection.closeSync()
  fixtureInstance.closeSync()
  const profile: LocalFilesProfile = { kind: 'local-files', version: 1, id: 'files', name: 'files', readonly: true, files: [{ path, alias: 'sales' }] }
  const adapter = new LocalFilesAdapter()
  try {
    assert.deepEqual(await adapter.test(profile), { ok: true, sourceInfo: { label: 'Local files (DuckDB)' } })
    const connected = await adapter.connect(profile)
    assert.equal(connected.result.ok, true)
    assert.ok(connected.session)
    assert.deepEqual(await connected.session.listRelations(), [{ namespace: 'main', name: 'sales', kind: 'view' }])
    const columns = await connected.session.describeRelation({ namespace: 'main', name: 'sales' })
    assert.deepEqual(columns.map(({ name }) => name), ['day', 'region', 'amount'])
    const result = await connected.session.query({ sql: 'select region, sum(amount) total from sales group by region order by region' })
    assert.equal(result.rowCount, 2)
    assert.equal(result.execution?.provider, 'duckdb')
    assert.deepEqual(result.rows, [{ region: 'eu', total: 12.5 }, { region: 'us', total: 7.5 }])
    for (const [total, truncated] of [
      [MAX_LOCAL_FILE_RESULT_ROWS - 1, false],
      [MAX_LOCAL_FILE_RESULT_ROWS, false],
      [MAX_LOCAL_FILE_RESULT_ROWS + 1, true]
    ] as const) {
      const bounded = await connected.session.query({ sql: `SELECT range AS value FROM range(${total})` })
      assert.equal(bounded.rows.length, Math.min(total, MAX_LOCAL_FILE_RESULT_ROWS))
      assert.equal(bounded.rowCount, bounded.rows.length)
      assert.equal(bounded.execution?.rowCount, bounded.rows.length)
      assert.equal(bounded.execution?.truncated, truncated)
    }
    const selectedDirectly = await connected.session.query({ sql: `SELECT count(*) AS count FROM read_csv_auto('${path}')` })
    assert.equal(selectedDirectly.rows[0]?.count, '2')
    for (const sql of [
      `SELECT * FROM read_csv('${unselectedCsv}')`,
      `SELECT * FROM read_csv_auto('${unselectedCsv}')`,
      `SELECT * FROM read_text('${unselectedCsv}')`,
      `SELECT * FROM read_parquet('${unselectedParquet}')`,
      `SELECT * FROM read_blob('${unselectedCsv}')`,
      `SELECT * FROM read_csv_auto('${join(directory, '*.csv')}')`
    ]) await assert.rejects(connected.session.query({ sql }), /file system operations are disabled/i)
    const securitySettings = await connected.session.query({
      sql: "SELECT name, value FROM duckdb_settings() WHERE name IN ('enable_external_access', 'allow_community_extensions', 'autoinstall_known_extensions', 'autoload_known_extensions', 'allow_persistent_secrets', 'lock_configuration')"
    })
    assert.deepEqual(Object.fromEntries(securitySettings.rows.map((row) => [row.name, row.value])), {
      allow_community_extensions: 'false', allow_persistent_secrets: 'false',
      autoinstall_known_extensions: 'false', autoload_known_extensions: 'false',
      enable_external_access: 'false', lock_configuration: 'true'
    })
    const keywordResult = await connected.session.query({ sql: "select 'delete' as action, amount as updated_value from sales limit 1" })
    assert.deepEqual(keywordResult.rows, [{ action: 'delete', updated_value: 12.5 }])
    await assert.rejects(connected.session.query({ sql: `COPY (SELECT 1) TO '${join(directory, 'leak.csv')}'` }), /read-only|file system operations are disabled/i)
    await assert.rejects(connected.session.query({ sql: 'SELECT 1; SELECT 2' }), /exactly one/)
    await connected.session.close()
    const reconnected = await adapter.connect(profile)
    assert.equal(reconnected.result.ok, true)
    if (connected.result.ok && reconnected.result.ok) assert.ok(reconnected.result.generation > connected.result.generation)
    await reconnected.session?.close()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('local-file sessions execute Builder SQL and parameterized cardinality probes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'datakoala-builder-files-'))
  const path = join(directory, 'events.csv')
  const now = new Date()
  const recentA = new Date(now.getTime() - 60 * 60_000)
  const recentB = new Date(now.getTime() - 2 * 60 * 60_000)
  const old = new Date(now.getTime() - 48 * 60 * 60_000)
  await writeFile(path, [
    'created_at,category,amount,region,status',
    `${recentA.toISOString()},alpha,10,eu,paid`,
    `${recentB.toISOString()},alpha,20,us,paid`,
    `${old.toISOString()},beta,5,eu,pending`
  ].join('\n'))
  const profile: LocalFilesProfile = { kind: 'local-files', version: 1, id: 'builder-files', name: 'builder files', readonly: true, files: [{ path, alias: 'events' }] }
  const connected = await new LocalFilesAdapter().connect(profile)
  assert.equal(connected.result.ok, true)
  assert.ok(connected.session)
  const run = (input: Parameters<typeof generateBuilderQuery>[0]) => {
    const query = generateBuilderQuery({ ...input, dialect: 'duckdb' })
    return connected.session!.query({ sql: query.sql, parameters: query.parameters })
  }
  try {
    const categorical = await run({ table: { schema: 'main', name: 'events' }, xColumn: 'category', aggregation: 'count', timeRange: { kind: 'all' } })
    assert.deepEqual(categorical.rows.map((row) => [row.category, row.count]), [['alpha', '2'], ['beta', '1']])

    const numeric = await run({ table: { schema: 'main', name: 'events' }, xColumn: 'category', valueColumn: 'amount', aggregation: 'sum', timeRange: { kind: 'all' } })
    assert.deepEqual(numeric.rows.map((row) => [row.category, row.value]), [['alpha', '30'], ['beta', '5']])
    const average = await run({ table: { schema: 'main', name: 'events' }, xColumn: 'category', valueColumn: 'amount', aggregation: 'average', timeRange: { kind: 'all' } })
    assert.deepEqual(average.rows.map((row) => [row.category, row.value]), [['alpha', 15], ['beta', 5]])

    const temporalBase = { table: { schema: 'main', name: 'events' }, xColumn: 'created_at', xColumnDataType: 'timestamptz', timeColumn: 'created_at', timeColumnDataType: 'timestamptz', timeBucket: 'day' as const, aggregation: 'count' as const }
    const temporal = await run({ ...temporalBase, timeRange: { kind: 'all' } })
    assert.ok(temporal.rows.every((row) => typeof row.time_bucket === 'string'))
    for (const bucket of ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'] as const) {
      const bucketed = await run({ ...temporalBase, timeBucket: bucket, timeRange: bucket === 'minute' ? { kind: 'rolling', amount: 24, unit: 'hour' } : { kind: 'all' } })
      assert.ok(bucketed.rows.length > 0, `${bucket} should execute and return a bucket`)
    }

    const rolling = await run({ ...temporalBase, timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } })
    assert.equal(rolling.rows.reduce((sum, row) => sum + Number(row.count), 0), 2)
    const categoricalWithTime = await run({ table: temporalBase.table, xColumn: 'category', xColumnDataType: 'VARCHAR', timeColumn: 'created_at', timeColumnDataType: 'timestamptz', aggregation: 'count', timeRange: { kind: 'rolling', amount: 24, unit: 'hour' } })
    assert.deepEqual(categoricalWithTime.rows.map((row) => [row.category, row.count]), [['alpha', '2']])

    // Custom-range form fields are local wall-clock values, not UTC ISO fragments.
    const start = new Date(recentB.getTime() - 60_000)
    const end = new Date(recentA.getTime() + 60_000)
    const custom = await run({ ...temporalBase, timeRange: { kind: 'custom', startDate: localDate(start), startTime: localTime(start), endDate: localDate(end), endTime: localTime(end) } })
    assert.equal(custom.rows.reduce((sum, row) => sum + Number(row.count), 0), 2)
    const from = localTime(new Date(recentB.getTime() - 5 * 60_000))
    const to = localTime(new Date(recentA.getTime() + 5 * 60_000))
    const recurring = await run({ ...temporalBase, timeRange: { kind: 'custom', startDate: localDate(old), startTime: '00:00', endDate: localDate(new Date(now.getTime() + 24 * 60 * 60_000)), endTime: '00:00', recurringWindows: [{ id: 'recent-window', from, to }] } })
    assert.equal(recurring.rows.reduce((sum, row) => sum + Number(row.count), 0), 2)

    const provenance: BuilderFilterProvenance = { mode: 'builder', resultAlias: 'series', table: temporalBase.table, sourceColumns: ['region'], sourceColumn: 'region', timeColumn: 'created_at', timeBucket: 'day', sourceKind: 'single-column', targetKind: 'source-column', displayLabel: 'region' }
    const seriesFilter = { ...createResultFilter('series', 'equals', encodeBuilderSeriesTuple({ region: 'eu' }, ['region'])), execution: 'query' as const, provenance }
    const series = await run({ ...temporalBase, seriesColumns: ['region'], timeRange: { kind: 'all' }, filters: [seriesFilter] })
    assert.ok(series.rows.length > 0)
    assert.ok(series.rows.every((row) => row.region === 'eu'))
    const multipleSeries = await run({ table: temporalBase.table, xColumn: 'category', xColumnDataType: 'VARCHAR', aggregation: 'count', seriesColumns: ['region', 'status'], timeRange: { kind: 'all' } })
    assert.ok(multipleSeries.rows.every((row) => typeof row.region === 'string' && typeof row.status === 'string'))
    assert.equal(multipleSeries.columns.filter((column) => column.name === 'region' || column.name === 'status').length, 2)

    const probe = buildSeriesCardinalityProbe({ schema: 'main', table: 'events', seriesColumns: ['region'], predicates: [{ column: 'status', operator: 'equals', value: 'paid' }] })
    const cardinality = await connected.session.query({ sql: probe.sql, parameters: probe.parameters })
    assert.equal(cardinality.rows[0]?.count, '2')
  } finally {
    await connected.session.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('local-file results are lossless structured-clone and JSON-safe values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'datakoala-values-'))
  const path = join(directory, 'selected.csv')
  await writeFile(path, 'value\n1\n')
  const profile: LocalFilesProfile = { kind: 'local-files', version: 1, id: 'values', name: 'values', readonly: true, files: [{ path, alias: 'selected' }] }
  const connected = await new LocalFilesAdapter().connect(profile)
  assert.ok(connected.session)
  try {
    const result = await connected.session.query({ sql: `SELECT
      9007199254740993::BIGINT AS bigint_value,
      170141183460469231731687303715884105727::HUGEINT AS hugeint_value,
      1234567890123456.78::DECIMAL(18,2) AS decimal_value,
      DATE '2026-01-02' AS date_value,
      TIMESTAMP '2026-01-02 03:04:05.123456' AS timestamp_value,
      TIMESTAMP_S '2026-01-02 03:04:05' AS timestamp_s_value,
      TIMESTAMP_MS '2026-01-02 03:04:05.123' AS timestamp_ms_value,
      TIMESTAMP_NS '2026-01-02 03:04:05.123456789' AS timestamp_ns_value,
      [1, 2] AS list_value,
      {'answer': 42, 'label': 'safe'} AS struct_value,
      MAP {'key': 3} AS map_value,
      union_value(number := 42)::UNION(number INTEGER, label VARCHAR) AS union_value,
      blob 'a\\x00b' AS blob_value,
      NULL AS null_value,
      TRUE AS boolean_value,
      12.5::DOUBLE AS number_value` })
    assert.doesNotThrow(() => structuredClone(result.rows))
    assert.doesNotThrow(() => JSON.stringify(result.rows))
    assert.deepEqual(result.rows[0], {
      bigint_value: '9007199254740993', hugeint_value: '170141183460469231731687303715884105727', decimal_value: '1234567890123456.78',
      date_value: '2026-01-02', timestamp_value: '2026-01-02 03:04:05.123456', timestamp_s_value: '2026-01-02 03:04:05',
      timestamp_ms_value: '2026-01-02 03:04:05.123', timestamp_ns_value: '2026-01-02 03:04:05.123456789',
      list_value: [1, 2], struct_value: { answer: 42, label: 'safe' }, map_value: [{ key: 'key', value: 3 }],
      union_value: { tag: 'number', value: 42 }, blob_value: 'a\\x00b', null_value: null, boolean_value: true, number_value: 12.5
    })
  } finally {
    await connected.session.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('local-file detection accepts extension-mismatched tabular files and rejects binary data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'datakoala-detection-'))
  const textPath = join(directory, 'metrics.txt')
  const jsonPath = join(directory, 'events-data')
  const parquetPath = join(directory, 'archive-data')
  const binaryPath = join(directory, 'unsupported.bin')
  await writeFile(textPath, 'name\tvalue\nalpha\t12.5\n')
  await writeFile(jsonPath, '{"kind":"alpha","count":2}\n{"kind":"beta","count":3}\n')
  await writeFile(binaryPath, new Uint8Array([0, 255, 0, 254, 1, 2, 3]))
  const fixture = await DuckDBInstance.create(':memory:')
  const fixtureConnection = await fixture.connect()
  await fixtureConnection.run(`COPY (SELECT 7 AS value) TO '${parquetPath}' (FORMAT PARQUET)`)
  fixtureConnection.closeSync(); fixture.closeSync()
  const adapter = new LocalFilesAdapter()
  const profile: LocalFilesProfile = { kind: 'local-files', version: 1, id: 'detect', name: 'detect', readonly: true, files: [
    { path: textPath, alias: 'text_data' }, { path: jsonPath, alias: 'json_data' }, { path: parquetPath, alias: 'parquet_data' }
  ] }
  try {
    const connected = await adapter.connect(profile)
    assert.ok(connected.session)
    assert.deepEqual((await connected.session.query({ sql: 'SELECT * FROM text_data' })).rows, [{ name: 'alpha', value: 12.5 }])
    assert.deepEqual((await connected.session.query({ sql: 'SELECT * FROM json_data ORDER BY kind' })).rows, [{ kind: 'alpha', count: '2' }, { kind: 'beta', count: '3' }])
    assert.deepEqual((await connected.session.query({ sql: 'SELECT * FROM parquet_data' })).rows, [{ value: 7 }])
    await connected.session.close()
    const rejected = await adapter.test({ ...profile, id: 'binary', files: [{ path: binaryPath, alias: 'binary_data' }] })
    assert.equal(rejected.ok, false)
    if (!rejected.ok) assert.match(rejected.error, /Unsupported tabular file: unsupported\.bin/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
