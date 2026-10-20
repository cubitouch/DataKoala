import assert from 'node:assert/strict'
import test from 'node:test'
import type { BigQueryProfile } from '../../shared/types.ts'
import { toIpcSafeQueryResult } from '../ipc-serialization.ts'
import { BigQueryAdapter, type BigQueryClientLike } from './bigquery-adapter.ts'

const profile: BigQueryProfile = {
  kind: 'bigquery',
  version: 1,
  id: 'non07-bigquery',
  name: 'NON-07 BigQuery',
  billingProject: 'test-billing',
  maximumBytesBilled: '1073741824',
  readonly: true,
}

type Fixture = {
  queryStatistics?: Record<string, unknown> | null
  dryRunStatistics?: Record<string, unknown>
  jobStatistics?: Record<string, unknown>
  statementType?: 'SELECT' | 'SCRIPT'
  rows?: Record<string, unknown>[]
  resultStatistics?: Record<string, unknown>
  failure?: 'create' | 'results' | 'metadata'
}

function fakeClient(fixture: Fixture): {
  client: BigQueryClientLike
  calls: Record<string, unknown>[]
  metadataReads: () => number
} {
  const calls: Record<string, unknown>[] = []
  let metadataReads = 0
  const client: BigQueryClientLike = {
    async getDatasets() {
      return [[]]
    },
    dataset() {
      throw new Error('Dataset discovery is not used by NON-07.')
    },
    async createQueryJob(options) {
      calls.push(options)
      if (options.dryRun)
        return [
          {
            metadata: {
              statistics: {
                query: {
                  statementType: fixture.statementType ?? 'SELECT',
                  ...fixture.dryRunStatistics,
                },
              },
            },
          },
        ]
      if (fixture.failure === 'create') throw new Error('execution rejected')
      return [
        {
          async getQueryResults() {
            if (fixture.failure === 'results')
              throw new Error('results unavailable')
            return [
              fixture.rows ?? [{ metric: 1 }],
              null,
              {
                schema: { fields: [{ name: 'metric', type: 'INT64' }] },
                ...fixture.resultStatistics,
              },
            ]
          },
          async getMetadata() {
            metadataReads++
            if (fixture.failure === 'metadata')
              throw new Error('metadata unavailable')
            return [
              {
                statistics: {
                  query: fixture.queryStatistics,
                  ...fixture.jobStatistics,
                },
                jobReference: { jobId: 'mock-job' },
              },
            ]
          },
        },
      ]
    },
  }
  return { client, calls, metadataReads: () => metadataReads }
}

async function execute(fixture: Fixture, sql = 'SELECT 1 AS metric') {
  const fake = fakeClient(fixture)
  const { result, session } = await new BigQueryAdapter(
    () => fake.client,
  ).connect(profile)
  assert.equal(result.ok, true)
  assert.ok(session)
  return {
    result: await session.query({ sql, parameters: [] }),
    ...fake,
  }
}

test('NON07 ordinary SELECT takes processed bytes and cache flag from executed-job metadata, not dry-run metadata or result API', async () => {
  const { result, calls, metadataReads } = await execute({
    queryStatistics: {
      totalBytesProcessed: '1024',
      totalBytesBilled: '2048',
      cacheHit: false,
      totalSlotMs: '300',
    },
    resultStatistics: { totalBytesProcessed: '9999', cacheHit: true },
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].dryRun, true)
  assert.equal(calls[1].dryRun, undefined)
  assert.equal(metadataReads(), 1)
  assert.equal(result.execution?.provider, 'bigquery')
  assert.equal(result.execution?.bytesProcessed, 1024)
  assert.equal(result.execution?.cacheHit, false)
  assert.equal(result.execution?.rowCount, 1)
  assert.equal(result.execution?.truncated, false)
  assert.equal(result.execution?.durationMs, result.durationMs)
  assert.ok(result.durationMs >= 0)
  assert.equal(result.execution?.bytesBilled, 2048)
  assert.equal(result.execution?.slotMs, 300)
  assert.equal(result.execution?.statisticsScope, 'job')
  assert.equal(Object.hasOwn(result.execution!, 'totalSlotMs'), false)

  const ipcResult = toIpcSafeQueryResult(result)
  assert.deepEqual(ipcResult.execution, result.execution)
  assert.deepEqual(structuredClone(ipcResult).execution, result.execution)
})

test('NON07 zero values and both cache-hit booleans remain distinct from missing statistics', async () => {
  for (const cacheHit of [true, false]) {
    const { result } = await execute({
      queryStatistics: { totalBytesProcessed: '0', cacheHit },
    })
    assert.equal(result.execution?.bytesProcessed, 0)
    assert.equal(result.execution?.cacheHit, cacheHit)
  }
  const { result: missing } = await execute({})
  assert.equal(missing.execution?.bytesProcessed, undefined)
  assert.equal(missing.execution?.cacheHit, undefined)
  assert.equal(Object.hasOwn(missing.execution!, 'cacheHit'), true)
})

test('NON07 precision boundary omits unsafe processed byte counts rather than rounding them', async () => {
  for (const [bytes, expected] of [
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['9007199254740992', undefined],
    ['9007199254740993', undefined],
    [undefined, undefined],
  ] as const) {
    const { result } = await execute({
      queryStatistics: { totalBytesProcessed: bytes },
    })
    assert.equal(result.execution?.bytesProcessed, expected)
  }
})

test('NON07 invalid byte statistics remain unavailable through adapter and IPC', async () => {
  for (const bytes of [
    null,
    '',
    ' ',
    undefined,
    'abc',
    '1.5',
    '-1',
    '1e3',
    '0x10',
    true,
    {},
    [],
    NaN,
    Infinity,
    1.5,
    -1,
    '9007199254740993',
    9007199254740992,
  ]) {
    const { result } = await execute({
      queryStatistics: { totalBytesProcessed: bytes },
    })
    assert.equal(result.execution?.bytesProcessed, undefined)
    assert.equal(
      structuredClone(toIpcSafeQueryResult(result)).execution?.bytesProcessed,
      undefined,
    )
    const fake = fakeClient({
      dryRunStatistics: { totalBytesProcessed: bytes },
    })
    const { session } = await new BigQueryAdapter(() => fake.client).connect(
      profile,
    )
    assert.ok(session?.estimateQuery)
    assert.deepEqual(structuredClone(await session.estimateQuery('SELECT 1')), {
      bytesProcessed: undefined,
    })
  }
})

test('NON07 SCRIPT uses parent job statistics and final statement rows without child-job aggregation', async () => {
  const sql = 'DECLARE x INT64 DEFAULT 1; SET x = 1; SELECT x AS metric;'
  const { result, calls, metadataReads } = await execute(
    {
      statementType: 'SCRIPT',
      rows: [{ metric: 1 }],
      queryStatistics: {
        statementType: 'SCRIPT',
        totalBytesProcessed: '4096',
        cacheHit: false,
      },
      jobStatistics: { numChildJobs: '3' },
    },
    sql,
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[0].query, sql)
  assert.equal(calls[1].query, sql)
  assert.equal(metadataReads(), 1)
  assert.deepEqual(result.rows, [{ metric: 1 }])
  assert.equal(result.execution?.bytesProcessed, 4096)
  assert.equal(result.execution?.cacheHit, false)
  assert.equal(result.execution?.statisticsScope, 'script')
  assert.equal(Object.hasOwn(result.execution!, 'numChildJobs'), false)
})

test('NON07 execution failures produce no successful statistics-bearing result', async () => {
  for (const [failure, message] of [
    ['create', 'execution rejected'],
    ['results', 'results unavailable'],
    ['metadata', 'metadata unavailable'],
  ] as const) {
    const fake = fakeClient({ failure })
    const { session } = await new BigQueryAdapter(() => fake.client).connect(
      profile,
    )
    assert.ok(session)
    await assert.rejects(
      session.query({ sql: 'SELECT 1', parameters: [] }),
      (error: unknown) =>
        error instanceof Error && error.message.includes(message),
    )
  }
})

test('NON07 valid estimates preserve zero and the safe integer boundary', async () => {
  for (const bytes of ['0', 0, '1024', '9007199254740991']) {
    const fake = fakeClient({
      dryRunStatistics: { totalBytesProcessed: bytes },
    })
    const { session } = await new BigQueryAdapter(() => fake.client).connect(
      profile,
    )
    assert.ok(session?.estimateQuery)
    assert.deepEqual(await session.estimateQuery('SELECT 1'), {
      bytesProcessed: Number(bytes),
    })
  }
})

test('batch4 billing, slot time, total rows and elapsed job duration survive production serialization exactly', async () => {
  const { result, calls } = await execute({
    queryStatistics: {
      totalBytesProcessed: '0',
      totalBytesBilled: '9007199254740991',
      totalSlotMs: '0',
      cacheHit: false,
    },
    jobStatistics: { startTime: '100', endTime: '140' },
    resultStatistics: { totalRows: '9007199254740991', pageToken: 'more' },
  })
  const safe = toIpcSafeQueryResult(result)
  assert.equal(safe.execution?.bytesBilled, Number.MAX_SAFE_INTEGER)
  assert.equal(safe.execution?.slotMs, 0)
  assert.equal(safe.execution?.totalRows, Number.MAX_SAFE_INTEGER)
  assert.equal(safe.execution?.providerDurationMs, 40)
  assert.equal(safe.execution?.truncated, true)
  assert.equal(safe.execution?.rowCount, 1)
  assert.equal(
    calls.length,
    2,
    'one validation dry run and one execution; no cosmetic jobs',
  )
})

test('batch4 invalid billing/slot/total row statistics are unavailable instead of fabricated', async () => {
  for (const value of [
    undefined,
    null,
    '',
    ' ',
    '1.2',
    '-1',
    -1,
    false,
    NaN,
    Infinity,
    '1e3',
    {},
    [],
    '9007199254740993',
    9007199254740992,
  ]) {
    const { result } = await execute({
      queryStatistics: {
        totalBytesBilled: value,
        totalSlotMs: value,
        cacheHit: value,
      },
      resultStatistics: { totalRows: value },
      jobStatistics: { startTime: value, endTime: '200' },
    })
    const execution = toIpcSafeQueryResult(result).execution!
    assert.equal(execution.bytesBilled, undefined)
    assert.equal(execution.slotMs, undefined)
    assert.equal(execution.totalRows, undefined)
    assert.equal(execution.providerDurationMs, undefined)
    assert.equal(execution.cacheHit, value === false ? false : undefined)
  }
})

test('batch4 zero job duration is real; reversed/partial timestamps remain unavailable', async () => {
  for (const [startTime, endTime, expected] of [
    ['0', '0', 0],
    ['10', '9', undefined],
    [undefined, '9', undefined],
    ['10', null, undefined],
  ] as const) {
    const { result } = await execute({ jobStatistics: { startTime, endTime } })
    assert.equal(result.execution?.providerDurationMs, expected)
  }
})

test('batch4 script scope survives absent executed statement type; final rows never adopt parent counts', async () => {
  const { result, calls } = await execute(
    {
      statementType: 'SCRIPT',
      queryStatistics: { totalBytesBilled: '1024', totalSlotMs: '300' },
      jobStatistics: { numChildJobs: '5', totalRows: '999' },
      resultStatistics: { totalRows: '2' },
      rows: [{ metric: 1 }, { metric: 2 }],
    },
    'DECLARE x INT64 DEFAULT 1; SELECT x AS metric;',
  )
  assert.equal(result.execution?.statisticsScope, 'script')
  assert.equal(result.execution?.bytesBilled, 1024)
  assert.equal(result.execution?.totalRows, 2)
  assert.equal(result.rowCount, 2)
  assert.equal(calls.length, 2)
})
