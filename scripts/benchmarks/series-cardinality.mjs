// In-memory DuckDB by default. --postgres uses standard PG* environment variables
// and a session-local temporary table only. No production relation is modified.
import { DuckDBInstance } from '@duckdb/node-api'
import pg from 'pg'
import { buildSeriesCardinalityProbe } from '../../src/shared/seriesCardinality.ts'
import { SeriesCardinalityProbes } from '../../src/main/series-cardinality.ts'

const postgres = process.argv.includes('--postgres')
const rows = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 1000000)
if (!Number.isSafeInteger(rows) || rows < 1)
  throw new Error('Invalid row count')
const instance = postgres ? null : await DuckDBInstance.create(':memory:')
const connection = postgres ? new pg.Client() : await instance.connect()
if (postgres) await connection.connect()
const query = async (sql, parameters = []) => {
  if (postgres) return (await connection.query(sql, parameters)).rows
  const reader = await connection.runAndReadAll(sql, parameters)
  return reader.getRowObjectsJson()
}
try {
  await query(
    `CREATE TEMP TABLE cardinality_benchmark AS SELECT i AS id, i % 10 AS low, i % 1000 AS medium FROM ${postgres ? `generate_series(0, ${rows - 1})` : `range(${rows})`} t(i)`,
  )
  if (postgres) await query('ANALYZE cardinality_benchmark')
  const postgresSchema = postgres
    ? (
        await query(
          "SELECT n.nspname AS schema FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = 'cardinality_benchmark'::regclass",
        )
      )[0].schema
    : 'main'
  for (const indexed of postgres ? [false, true] : [false]) {
    if (indexed) {
      await query('CREATE INDEX ON cardinality_benchmark (id)')
      await query('CREATE INDEX ON cardinality_benchmark (low)')
    }
    for (const seriesColumn of ['low', 'id']) {
      for (const filtered of [false, true]) {
        const request = {
          schema: postgresSchema,
          table: 'cardinality_benchmark',
          seriesColumn,
          predicates: filtered
            ? [{ column: 'low', operator: 'equals', value: 1 }]
            : [],
        }
        const probe = buildSeriesCardinalityProbe(
          request,
          postgres ? 'postgres' : 'duckdb',
        )
        const columnList = `"${seriesColumn}"`
        const source = `FROM ${request.schema}.cardinality_benchmark${filtered ? ' WHERE "low" = $1' : ''}`
        for (const strategy of ['group', 'distinct', 'distinct-ordered']) {
          const sql =
            strategy === 'group'
              ? probe.sql
              : `SELECT count(*) AS count FROM (SELECT DISTINCT ${columnList} ${source}${strategy === 'distinct-ordered' ? ` ORDER BY ${columnList}` : ''} LIMIT 101) q`
          const ms = []
          let count
          for (let i = 0; i < 4; i++) {
            const started = performance.now()
            count = (await query(sql, probe.parameters))[0].count
            if (i) ms.push(performance.now() - started)
          }
          console.log(
            JSON.stringify({
              provider: postgres ? 'postgres' : 'duckdb',
              rows,
              indexed,
              seriesColumn,
              filtered,
              strategy,
              ms,
              count,
            }),
          )
          console.log(
            JSON.stringify({
              plan: await query(
                `${postgres ? 'EXPLAIN (FORMAT JSON)' : 'EXPLAIN'} ${sql}`,
                probe.parameters,
              ),
            }),
          )
        }
        if (postgres) {
          const session = {
            info: { provider: 'postgres' },
            query: async ({ sql, parameters }) => ({
              rows: await query(sql, parameters),
            }),
          }
          const started = performance.now()
          const response = await new SeriesCardinalityProbes((m) =>
            console.log(JSON.stringify(m)),
          ).probe(session, request)
          console.log(
            JSON.stringify({
              strategy: 'postgres-per-field',
              seriesColumn,
              filtered,
              indexed,
              durationMs: performance.now() - started,
              response,
            }),
          )
        }
      }
    }
  }
} finally {
  if (postgres) await connection.end()
  else {
    connection.closeSync()
    instance.closeSync()
  }
}
