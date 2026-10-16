import assert from 'node:assert/strict'
import test from 'node:test'
import type { BigQueryProfile, PostgresProfile } from '../../shared/types.ts'
import { BigQueryAdapter, type BigQueryClientLike } from './bigquery-adapter.ts'
import { assertReadOnlyBigQueryQuery } from './bigquery-script.ts'
import { __testing as postgresGuards } from './postgres.ts'
import { queryFailureKind } from '../query-failure.ts'

const bigqueryProfile: BigQueryProfile = {
  kind: 'bigquery',
  version: 1,
  id: 'non04-bq',
  name: 'NON-04 fixture',
  billingProject: 'synthetic-billing',
  maximumBytesBilled: '2048',
  readonly: true,
}

function fakeBigQuery(dryStatementType: string) {
  const jobs: Record<string, unknown>[] = []
  const client: BigQueryClientLike = {
    async getDatasets() {
      return [[]]
    },
    dataset() {
      throw new Error('Dataset discovery is not used by these tests.')
    },
    async createQueryJob(options) {
      jobs.push(options)
      if (options.dryRun)
        return [
          {
            metadata: {
              statistics: { query: { statementType: dryStatementType } },
            },
          },
        ]
      return [
        {
          async getQueryResults() {
            return [
              [{ final_value: 'last SELECT only' }],
              null,
              {
                schema: {
                  fields: [{ name: 'final_value', type: 'STRING' }],
                },
              },
            ]
          },
          async getMetadata() {
            return [
              {
                statistics: {
                  query: { totalBytesProcessed: '16', cacheHit: false },
                },
              },
            ]
          },
        },
      ]
    },
  }
  return { client, jobs }
}

test('NON-04: BigQuery scripts dry-run before executing and return the final SELECT result', async () => {
  const fake = fakeBigQuery('SCRIPT')
  const { session } = await new BigQueryAdapter(() => fake.client).connect(
    bigqueryProfile,
  )
  assert.ok(session)
  const sql =
    'DECLARE threshold INT64 DEFAULT 1; SET threshold = 2; SELECT 0; SELECT threshold AS final_value'
  const result = await session.query({ sql })
  assert.equal(fake.jobs.length, 2)
  assert.equal(fake.jobs[0].dryRun, true)
  assert.equal(fake.jobs[1].dryRun, undefined)
  for (const job of fake.jobs) {
    assert.equal(job.query, sql)
    assert.equal(job.maximumBytesBilled, '2048')
    assert.equal(job.useLegacySql, false)
  }
  assert.deepEqual(result.rows, [{ final_value: 'last SELECT only' }])
  assert.equal(result.execution?.provider, 'bigquery')
})

test('NON-04: BigQuery rejects unsupported script phases before any provider job', async () => {
  const fake = fakeBigQuery('SCRIPT')
  const { session } = await new BigQueryAdapter(() => fake.client).connect(
    bigqueryProfile,
  )
  assert.ok(session)
  for (const sql of [
    'SELECT 1; DELETE FROM synthetic_table; SELECT 2',
    'DECLARE x INT64; SET @@dataset_id = "other"; SELECT x',
    "EXECUTE IMMEDIATE 'SELECT 1'; SELECT 2",
    'SELECT 1; CREATE TABLE synthetic_table (id INT64); SELECT 2',
    'SELECT 1; SET x = 3',
  ]) {
    await assert.rejects(
      session.query({ sql }),
      (error) => queryFailureKind(error) === 'validation',
      sql,
    )
  }
  assert.equal(fake.jobs.length, 0)
})

test('NON-04: BigQuery dry-run statement-type rejection never starts the execution job', async () => {
  const fake = fakeBigQuery('INSERT')
  const { session } = await new BigQueryAdapter(() => fake.client).connect(
    bigqueryProfile,
  )
  assert.ok(session)
  await assert.rejects(
    session.query({ sql: 'SELECT 1' }),
    (error) => queryFailureKind(error) === 'validation',
  )
  assert.equal(fake.jobs.length, 1)
  assert.equal(fake.jobs[0].dryRun, true)
})

test('NON-04: BigQuery scanner treats comments and quoted semicolons as data', () => {
  assert.doesNotThrow(() =>
    assertReadOnlyBigQueryQuery(
      "-- INSERT; ignored\nDECLARE x INT64; SET x = 1; SELECT '; DELETE' AS message; SELECT x",
    ),
  )
  assert.throws(
    () =>
      assertReadOnlyBigQueryQuery(
        "SELECT ';' AS punctuation; /* SELECT */ DROP TABLE synthetic_table; SELECT 2",
      ),
    /read-only/,
  )
})

const postgresProfile: PostgresProfile = {
  kind: 'postgres',
  version: 2,
  id: 'non04-pg',
  name: 'NON-04 fixture',
  host: 'localhost',
  port: 5432,
  database: 'synthetic',
  user: 'synthetic',
  password: '',
  tlsMode: 'disable',
  readonly: true,
}

test('NON-04: PostgreSQL read-only is configured at connection startup only when selected', () => {
  assert.equal(
    postgresGuards.buildPoolConfig(postgresProfile, 1).options,
    '-c default_transaction_read_only=on',
  )
  assert.equal(
    postgresGuards.buildPoolConfig({ ...postgresProfile, readonly: false }, 1)
      .options,
    undefined,
  )
  assert.throws(
    () =>
      postgresGuards.assertReadonly(
        postgresProfile,
        'DELETE FROM synthetic_table',
      ),
    /read-only/,
  )
  assert.doesNotThrow(() =>
    postgresGuards.assertReadonly(
      postgresProfile,
      "/* harmless comment */ SELECT 'UPDATE' AS literal",
    ),
  )
})

test('NON-04: PostgreSQL leading-keyword precheck does not classify following statements', () => {
  // Characterization ONLY: no SQL is sent to a provider. Startup-level
  // read-only and database-role permissions require separate assessment.
  assert.doesNotThrow(() =>
    postgresGuards.assertReadonly(
      postgresProfile,
      'SELECT 1; DELETE FROM synthetic_table',
    ),
  )
})
