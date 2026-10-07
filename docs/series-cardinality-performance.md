# Series cardinality performance (#324)

## Implemented strategies

| Provider                                 | Strategy                                                                                                      | Approval                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ |
| PostgreSQL                               | Unfiltered single column: `pg_stats`; scoped/multi-column: planner; inconclusive estimates fall back to exact | Native estimate or exact |
| BigQuery                                 | Dedicated structured, validated internal SELECT operation, one execution job and no validation dry run        | Exact only               |
| DuckDB / local files / SQLite via DuckDB | Existing bounded grouped query                                                                                | Exact only               |

The renderer makes one cardinality request and retains stale-response protection.
Provider strategy selection stays in the main process. PostgreSQL uses table-wide
`pg_stats.n_distinct` only for one unfiltered Series column. Estimates at or
below 50 accept, estimates above 200 reject, and the 51-200 advisory band falls
back to the exact bounded probe. Missing or malformed statistics also fall back
to exact.

Filtered/time-scoped or multi-column PostgreSQL selections skip table-wide
`pg_stats` and use `EXPLAIN (FORMAT JSON)` on the grouped selection instead.
The same conservative band applies: planner estimates at or below 50 accept,
estimates above 200 reject, and uncertain/missing estimates fall back to exact.
These native estimates are intentionally advisory product decisions rather than
proofs of exact cardinality.

Manual testing showed why an exact-only policy is not appropriate for PostgreSQL.
On a representative large events table, the planner estimated roughly three
groups in under a millisecond, while the exact grouped probe performed a parallel
sequential scan across millions of qualifying rows and took about 10 seconds.
`LIMIT 101` bounds the returned groups, not the amount of source scanning or
aggregation PostgreSQL may need to perform first.

BigQuery arbitrary SQL retains its dry-run/read-only validation. The special
operation accepts a structured request, validates it again, generates its own SQL,
quotes identifiers using GoogleSQL escapes, binds predicate values, and preserves
location/default dataset/maximum bytes billed. There is no raw SQL safety bypass.
The execution result still exposes bytes processed and cache status.

Only identical _in-flight_ requests on the same live session are shared. Settled
successes and failures are removed; reconnects cannot reuse another session's
work. No completed positive approval cache remains. Connection setup and probe
responses are guarded against stale Builder state, and results from replaced
sessions are discarded. Removing dimensions still avoids probing.

Different fingerprints can still execute concurrently. The current SQL provider
sessions do not expose usable per-probe cancellation IDs. No generic cancellation
framework was added, and cross-fingerprint cancellation/coalescing remains a
follow-up. Ordinary Series selection stays disabled while checking.

## Measurements and reproducibility

On the original main implementation, a first single-column BigQuery selection
could run a failing PostgreSQL statistics dry run, then an exact-probe dry run,
then the actual probe: three `createQueryJob` calls. The new path has one execution
job. Adapter tests verify the trusted path's job count and continued validation
of ordinary queries. This is a round-trip improvement, not a measured reduction
in bytes scanned. Exact probe SQL is unchanged except for corrected GoogleSQL
identifier escaping.

Run the synthetic benchmark with Node 24:

```sh
node scripts/benchmarks/series-cardinality.mjs 1000000
# Explicit opt-in; configure standard PG* environment variables first:
node scripts/benchmarks/series-cardinality.mjs --postgres 1000000
```

DuckDB uses an in-memory temporary table. PostgreSQL uses a session-local temporary
table, compares unindexed/indexed cases, prints JSON plans, and exercises the
provider strategy dispatcher. Neither modifies existing application tables.
Both compare GROUP BY, DISTINCT, and ordered DISTINCT, with one/multiple columns
and filtered/unfiltered scopes. Each shape has one warm-up and three measurements.

Observed DuckDB baseline query-shape medians in this development container,
1,000,000 rows (ms; synthetic data, not production before/after claims):

| Dimensions / scope    | GROUP BY (retained) | DISTINCT | Ordered DISTINCT |
| --------------------- | ------------------: | -------: | ---------------: |
| 10-value column / all |                3.46 |    11.67 |             8.25 |
| Unique ID / all       |               37.75 |    37.00 |            27.83 |
| Two columns / all     |               11.01 |    11.85 |            11.45 |
| Unique ID / filtered  |                8.92 |     3.86 |             4.42 |

Plans place the limit above hash aggregation and a sequential scan. A bounded
result does not imply bounded source scanning. Low-cardinality GROUP BY used a
perfect hash aggregation, whereas DISTINCT used general hash aggregation. These
mixed results do not justify changing the generic query shape.

The PostgreSQL regression above was observed during manual testing on a
representative configured database. Broader PostgreSQL timings, live BigQuery
latency/bytes, and SQLite file benchmarks remain incomplete. Run the supplied
benchmark and local instrumentation against representative connections before
declaring the overall investigation complete. The PR remains deliberately scoped
and #324 stays open.

For per-strategy local instrumentation:

```sh
DATAKOALA_DEBUG_CARDINALITY=1 pnpm dev
```

The main-process console emits provider, strategy, column count, whether predicates
exist, duration, accepted/rejected/fallback/error, and BigQuery bytes processed
when available. Strategy values distinguish `postgres-pg-stats`,
`postgres-planner`, `bigquery-exact`, and generic `exact`. No identifiers,
SQL, values, credentials, or remote telemetry are included. Timings are per
strategy; fallback duration plus exact duration gives the total database work for
one request.

## Deferred sampling

Sampling is rejection-only: finding 101 distinct combinations proves the full
scope is too large; finding fewer proves nothing. Not implemented without evidence
that it beats the single-job exact path. BigQuery SYSTEM samples storage blocks,
can read an entire small table, is not cached, and has restrictions including
views and row-level security. PostgreSQL SYSTEM likewise samples blocks; percent
sampling is not a strict byte budget. Capability checks, real byte/latency results,
and selective-filter behavior should precede adding the extra round trip.

References:

- <https://www.postgresql.org/docs/current/using-explain.html>
- <https://www.postgresql.org/docs/current/sql-select.html>
- <https://cloud.google.com/bigquery/docs/table-sampling>
- <https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical>

## Manual review

- PostgreSQL: verify one unfiltered dimension resolves through `pg_stats` for
  clearly low/high estimates; verify mid-band/unavailable stats fall back to exact.
  Then verify scoped and multi-column selections use planner estimates first and
  preserve time/filter semantics.
- BigQuery: repeat Series selections and inspect debug records/job history;
  ensure normal raw SQL still enforces read-only behavior and billing limits.
- During a pending probe, change table/time scope or disconnect: no obsolete
  response should apply a selection. Retry after a transient error.
- Re-select a formerly accepted dimension after the data changes: a new check
  must occur. Removing a dimension should remain immediate.
- Verify NULL combinations and DATE/DATETIME/TIMESTAMP range boundaries.
