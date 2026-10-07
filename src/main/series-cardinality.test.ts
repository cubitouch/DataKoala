import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SeriesCardinalityProbes,
  groupedPlanEstimate,
  seriesStatistics,
  type ProbeMeasurement,
} from './series-cardinality.ts'
import type { DataSourceSession, QueryRequest } from './data-source.ts'
import {
  DATA_SOURCE_CAPABILITIES,
  type DataSourceKind,
  type QueryResult,
} from '../shared/types.ts'

const request = {
  schema: 'public',
  table: 'events',
  seriesColumns: ['region'],
  predicates: [],
}
const result = (rows: Record<string, unknown>[]): QueryResult => ({
  rows,
  columns: [],
  rowCount: rows.length,
  durationMs: 0,
})
function fake(
  provider: DataSourceKind,
  query: (request: QueryRequest) => Promise<QueryResult>,
): DataSourceSession {
  return {
    info: { profileId: 'one', provider },
    capabilities: DATA_SOURCE_CAPABILITIES[provider],
    query,
    listNamespaces: async () => [],
    listRelations: async () => [],
    describeRelation: async () => [],
    close: async () => {},
  }
}
for (const provider of ['bigquery', 'local-files', 'sqlite-file'] as const) {
  test(`${provider} never runs PostgreSQL statistics/plans`, async () => {
    const calls: string[] = []
    const session = fake(provider, async ({ sql }) => {
      calls.push(sql)
      return result([{ count: 3 }])
    })
    assert.equal(
      (
        await seriesStatistics(session, {
          schema: 'public',
          table: 'events',
          column: 'region',
        })
      ).available,
      false,
    )
    assert.equal(
      (await new SeriesCardinalityProbes().probe(session, request))
        .exceedsHardLimit,
      false,
    )
    assert.equal(calls.length, 1)
    assert.doesNotMatch(calls[0], /pg_stats|EXPLAIN/)
  })
}
for (const estimate of [0, 50, 100, 200, 201, undefined, -1, Infinity, 'bad']) {
  test(`planner estimate ${estimate} cannot falsely approve an exact 101`, async () => {
    const calls: QueryRequest[] = []
    const measurements: ProbeMeasurement[] = []
    const session = fake('postgres', async (q) => {
      calls.push(q)
      return q.sql.startsWith('EXPLAIN')
        ? result([{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': estimate } }] }])
        : result([{ count: 101 }])
    })
    const response = await new SeriesCardinalityProbes((m) =>
      measurements.push(m),
    ).probe(session, request)
    assert.equal(response.exceedsHardLimit, true)
    assert.equal(calls.length, estimate === 201 ? 1 : 2)
    assert.equal(measurements.at(-1)?.result, 'rejected')
  })
}
for (const columns of [['region'], ['region', 'service']]) {
  test(`planner includes ${columns.length} dimensions and parameterized predicates`, async () => {
    const session = fake('postgres', async ({ sql, parameters }) => {
      assert.match(sql, /WHERE "region" = \$1/)
      assert.deepEqual(parameters, ['eu'])
      if (sql.startsWith('EXPLAIN')) {
        assert.doesNotMatch(sql, /LIMIT|ANALYZE/)
        assert.match(
          sql,
          new RegExp(`GROUP BY ${columns.map((c) => `"${c}"`).join(', ')}`),
        )
        throw new Error('explain unavailable')
      }
      return result([{ count: '100' }])
    })
    assert.deepEqual(
      await new SeriesCardinalityProbes().probe(session, {
        ...request,
        seriesColumns: columns,
        predicates: [{ column: 'region', operator: 'equals', value: 'eu' }],
      }),
      { distinctCount: 100, exceedsHardLimit: false },
    )
  })
}
for (const count of [undefined, null, '', false, -1, 102, NaN, 1.5, 'bad']) {
  test(`invalid exact result ${String(count)} fails closed`, async () => {
    await assert.rejects(
      new SeriesCardinalityProbes().probe(
        fake('local-files', async () => result([{ count }])),
        request,
      ),
      /Invalid cardinality/,
    )
  })
}
test('deduplicates only in-flight identical requests and isolates session identities', async () => {
  let resolve!: (value: QueryResult) => void
  let calls = 0
  const query = async () => {
    calls++
    return new Promise<QueryResult>((r) => {
      resolve = r
    })
  }
  const session = fake('local-files', query)
  const probes = new SeriesCardinalityProbes()
  const first = probes.probe(session, request)
  assert.equal(probes.probe(session, { ...request }), first)
  assert.equal(calls, 1)
  resolve(result([{ count: 80 }]))
  await first
  const next = probes.probe(session, request)
  assert.equal(calls, 2)
  resolve(result([{ count: 101 }]))
  assert.equal((await next).exceedsHardLimit, true)
  const reconnect = probes.probe(fake('local-files', query), request)
  assert.equal(calls, 3)
  resolve(result([{ count: 100 }]))
  await reconnect
})
test('failed operations are evicted and can be retried', async () => {
  let calls = 0
  const session = fake('local-files', async () => {
    if (++calls === 1) throw new Error('offline')
    return result([{ count: 0 }])
  })
  const probes = new SeriesCardinalityProbes()
  await assert.rejects(probes.probe(session, request), /offline/)
  assert.equal((await probes.probe(session, request)).distinctCount, 0)
})
test('malformed plans are unavailable, including invalid JSON', () => {
  for (const input of [null, {}, [], 'bad', [{ Plan: {} }]])
    assert.equal(groupedPlanEstimate(input), undefined)
  assert.equal(groupedPlanEstimate('[{"Plan":{"Plan Rows":42}}]'), 42)
})
