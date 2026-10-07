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
const isPgStats = (sql: string) => sql.includes('pg_catalog.pg_stats')

for (const provider of ['bigquery', 'local-files', 'sqlite-file'] as const) {
  test(`${provider} statistics lookup never queries pg_stats`, async () => {
    let calls = 0
    const session = fake(provider, async () => {
      calls++
      return result([])
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
    assert.equal(calls, 0)
  })
}

for (const provider of ['local-files', 'sqlite-file'] as const) {
  test(`${provider} uses one exact cardinality probe`, async () => {
    const calls: QueryRequest[] = []
    const measurements: ProbeMeasurement[] = []
    const session = fake(provider, async (query) => {
      calls.push(query)
      return result([{ count: 3 }])
    })
    assert.deepEqual(
      await new SeriesCardinalityProbes((measurement) =>
        measurements.push(measurement),
      ).probe(session, request),
      { distinctCount: 3, exceedsHardLimit: false },
    )
    assert.equal(calls.length, 1)
    assert.doesNotMatch(calls[0].sql, /pg_stats|EXPLAIN/)
    assert.equal(measurements.at(-1)?.strategy, 'exact')
  })
}

test('BigQuery uses one generated exact operation', async () => {
  let genericCalls = 0
  let generatedCalls = 0
  const measurements: ProbeMeasurement[] = []
  const session: DataSourceSession = {
    ...fake('bigquery', async () => {
      genericCalls++
      throw new Error('generic query path must not run')
    }),
    querySeriesCardinality: async () => {
      generatedCalls++
      return result([{ count: 3 }])
    },
  }
  assert.deepEqual(
    await new SeriesCardinalityProbes((measurement) =>
      measurements.push(measurement),
    ).probe(session, request),
    { distinctCount: 3, exceedsHardLimit: false },
  )
  assert.equal(genericCalls, 0)
  assert.equal(generatedCalls, 1)
  assert.equal(measurements.at(-1)?.strategy, 'bigquery-exact')
})

for (const [label, nDistinct, expected] of [
  ['low', 3, { distinctCount: 3, exceedsHardLimit: false, estimated: true }],
  [
    'high',
    500,
    { distinctCount: 500, exceedsHardLimit: true, estimated: true },
  ],
] as const) {
  test(`PostgreSQL pg_stats ${label} estimate is decisive`, async () => {
    const calls: QueryRequest[] = []
    const measurements: ProbeMeasurement[] = []
    const session = fake('postgres', async (query) => {
      calls.push(query)
      assert.equal(isPgStats(query.sql), true)
      assert.deepEqual(query.parameters, ['public', 'events', 'region'])
      return result([{ n_distinct: nDistinct, reltuples: 1_000_000 }])
    })
    assert.deepEqual(
      await new SeriesCardinalityProbes((measurement) =>
        measurements.push(measurement),
      ).probe(session, request),
      expected,
    )
    assert.equal(calls.length, 1)
    assert.doesNotMatch(calls[0].sql, /EXPLAIN/)
    assert.deepEqual(
      measurements.map((measurement) => measurement.strategy),
      ['postgres-pg-stats'],
    )
    assert.equal(
      measurements[0].result,
      label === 'low' ? 'accepted' : 'rejected',
    )
  })
}

test('PostgreSQL pg_stats mid-band falls back directly to exact', async () => {
  const calls: QueryRequest[] = []
  const measurements: ProbeMeasurement[] = []
  const session = fake('postgres', async (query) => {
    calls.push(query)
    if (isPgStats(query.sql)) {
      return result([{ n_distinct: 100, reltuples: 1_000_000 }])
    }
    assert.doesNotMatch(query.sql, /^EXPLAIN/)
    return result([{ count: 24 }])
  })
  assert.deepEqual(
    await new SeriesCardinalityProbes((measurement) =>
      measurements.push(measurement),
    ).probe(session, request),
    { distinctCount: 24, exceedsHardLimit: false },
  )
  assert.equal(calls.length, 2)
  assert.equal(isPgStats(calls[0].sql), true)
  assert.doesNotMatch(calls[1].sql, /pg_stats|EXPLAIN/)
  assert.deepEqual(
    measurements.map(({ strategy, result: outcome }) => [strategy, outcome]),
    [
      ['postgres-pg-stats', 'fallback'],
      ['exact', 'accepted'],
    ],
  )
})

for (const statsRows of [
  [],
  [{ n_distinct: null, reltuples: 1_000_000 }],
  [{ n_distinct: 'bad', reltuples: 1_000_000 }],
]) {
  test('PostgreSQL unavailable pg_stats falls back to exact', async () => {
    const calls: QueryRequest[] = []
    const session = fake('postgres', async (query) => {
      calls.push(query)
      if (isPgStats(query.sql)) return result(statsRows)
      assert.doesNotMatch(query.sql, /^EXPLAIN/)
      return result([{ count: 5 }])
    })
    assert.deepEqual(
      await new SeriesCardinalityProbes().probe(session, request),
      { distinctCount: 5, exceedsHardLimit: false },
    )
    assert.equal(calls.length, 2)
    assert.equal(isPgStats(calls[0].sql), true)
    assert.doesNotMatch(calls[1].sql, /pg_stats|EXPLAIN/)
  })
}

const plannerRequests = [
  {
    label: 'filtered single-column',
    seriesColumns: ['region'],
    predicates: [{ column: 'region', operator: 'equals', value: 'eu' }],
  },
  {
    label: 'unfiltered multi-column',
    seriesColumns: ['region', 'service'],
    predicates: [],
  },
  {
    label: 'filtered multi-column',
    seriesColumns: ['region', 'service'],
    predicates: [{ column: 'region', operator: 'equals', value: 'eu' }],
  },
] as const

for (const plannerRequest of plannerRequests) {
  for (const [estimate, expectedCalls, expected] of [
    [3, 1, { distinctCount: 3, exceedsHardLimit: false, estimated: true }],
    [201, 1, { distinctCount: 201, exceedsHardLimit: true, estimated: true }],
    [100, 2, { distinctCount: 24, exceedsHardLimit: false }],
  ] as const) {
    test(`${plannerRequest.label} planner estimate ${estimate} routes correctly`, async () => {
      const calls: QueryRequest[] = []
      const measurements: ProbeMeasurement[] = []
      const session = fake('postgres', async (query) => {
        calls.push(query)
        assert.equal(isPgStats(query.sql), false)
        if (query.sql.startsWith('EXPLAIN')) {
          assert.doesNotMatch(query.sql, /ANALYZE/)
          return result([
            { 'QUERY PLAN': [{ Plan: { 'Plan Rows': estimate } }] },
          ])
        }
        return result([{ count: 24 }])
      })
      assert.deepEqual(
        await new SeriesCardinalityProbes((measurement) =>
          measurements.push(measurement),
        ).probe(session, {
          ...request,
          seriesColumns: [...plannerRequest.seriesColumns],
          predicates: [...plannerRequest.predicates],
        }),
        expected,
      )
      assert.equal(calls.length, expectedCalls)
      assert.match(calls[0].sql, /^EXPLAIN/)
      assert.equal(isPgStats(calls[0].sql), false)
      if (plannerRequest.predicates.length) {
        assert.match(calls[0].sql, /WHERE "region" = \$1/)
        assert.deepEqual(calls[0].parameters, ['eu'])
      }
      assert.match(
        calls[0].sql,
        new RegExp(
          `GROUP BY ${plannerRequest.seriesColumns
            .map((column) => `"${column}"`)
            .join(', ')}`,
        ),
      )
      assert.equal(measurements[0].strategy, 'postgres-planner')
      const plannerOutcome =
        estimate <= 50 ? 'accepted' : estimate > 200 ? 'rejected' : 'fallback'
      assert.equal(measurements[0].result, plannerOutcome)
      if (estimate === 100) {
        assert.equal(measurements[1].strategy, 'exact')
        assert.equal(measurements[1].result, 'accepted')
      }
    })
  }
}

test('malformed PostgreSQL planner result falls back to exact', async () => {
  const calls: QueryRequest[] = []
  const session = fake('postgres', async (query) => {
    calls.push(query)
    assert.equal(isPgStats(query.sql), false)
    if (query.sql.startsWith('EXPLAIN')) {
      return result([{ 'QUERY PLAN': [{ Plan: {} }] }])
    }
    return result([{ count: 9 }])
  })
  assert.deepEqual(
    await new SeriesCardinalityProbes().probe(session, {
      ...request,
      predicates: [{ column: 'region', operator: 'equals', value: 'eu' }],
    }),
    { distinctCount: 9, exceedsHardLimit: false },
  )
  assert.equal(calls.length, 2)
})

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

test('deduplicates only in-flight identical requests by session', async () => {
  let resolve!: (value: QueryResult) => void
  let calls = 0
  const query = async () => {
    calls++
    return new Promise<QueryResult>((complete) => {
      resolve = complete
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
  for (const input of [null, {}, [], 'bad', [{ Plan: {} }]]) {
    assert.equal(groupedPlanEstimate(input), undefined)
  }
  assert.equal(groupedPlanEstimate('[{"Plan":{"Plan Rows":42}}]'), 42)
})
