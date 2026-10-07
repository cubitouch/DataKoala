# Series cardinality performance (#324)

## Implemented strategies

| Provider                                 | Strategy                                                                                                              | Approval   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| PostgreSQL                               | `EXPLAIN (FORMAT JSON)` of the unbounded grouped selection; estimates above 200 reject; otherwise exact bounded probe | Exact only |
| BigQuery                                 | Dedicated structured, validated internal SELECT operation, one execution job and no validation dry run                | Exact only |
| DuckDB / local files / SQLite via DuckDB | Existing bounded grouped query                                                                                        | Exact only |

The renderer makes one cardinality request and retains stale-response protection.
The legacy statistics operation explicitly returns unavailable outside PostgreSQL.
PostgreSQL plans receive the same identifiers and parameters as the exact query,
including time scope and multiple columns; PostgreSQL can use existing extended
statistics without requiring new database objects. Missing/invalid/failed plans
fall back to exact. Estimates above 200 can falsely reject, as the previous
advisory high-estimate path could; the message labels them as estimates. Estimates
never approve, including estimates at or below the previous threshold of 50.

This intentionally prioritizes the brief's hard safety invariant over its
conflicting suggestion to approve low estimates. Removing that shortcut can make
some PostgreSQL low-cardinality checks slower. No general PostgreSQL latency
improvement is claimed without live measurements.

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
new planner-then-exact strategy. Neither modifies existing application tables.
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

No live PostgreSQL/BigQuery server credentials were configured for this work.
PostgreSQL plan timings, live BigQuery latency/bytes, and SQLite file benchmarks
remain unmeasured. Run the supplied PostgreSQL benchmark and local instrumentation
against representative configured connections before declaring the investigation
complete. The PR is deliberately a draft and #324 remains open.

For per-strategy local instrumentation:

```sh
DATAKOALA_DEBUG_CARDINALITY=1 pnpm dev
```

The main-process console emits provider, strategy, column count, whether predicates
exist, duration, accepted/rejected/fallback/error, and BigQuery bytes processed
when available. No identifiers, SQL, values, credentials, or remote telemetry are
included. Timings are per strategy; fallback duration plus exact duration gives
the total database work for one request.

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

- PostgreSQL: select one and multiple dimensions, all-time and scoped ranges;
  confirm genuinely high estimates get the labelled advisory rejection.
- BigQuery: repeat Series selections and inspect debug records/job history;
  ensure normal raw SQL still enforces read-only behavior and billing limits.
- During a pending probe, change table/time scope or disconnect: no obsolete
  response should apply a selection. Retry after a transient error.
- Re-select a formerly accepted dimension after the data changes: a new check
  must occur. Removing a dimension should remain immediate.
- Verify NULL combinations and DATE/DATETIME/TIMESTAMP range boundaries.
