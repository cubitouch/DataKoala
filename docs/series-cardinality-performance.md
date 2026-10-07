# Series cardinality performance (#324)

## Implemented strategies

| Provider                                 | Strategy                                                                                      | Approval                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| PostgreSQL                               | Per-field `pg_stats`; scoped/high-or-uncertain estimates fall back to exact single-column SQL | Native estimate or exact |
| BigQuery                                 | Per-field `APPROX_COUNT_DISTINCT`; uncertain estimates fall back to one exact generated probe | Native estimate or exact |
| DuckDB / local files / SQLite via DuckDB | Existing bounded grouped query                                                                | Exact only               |

The renderer validates newly added Series fields independently and retains
stale-response protection for the complete proposed selection. PostgreSQL probes
therefore contain exactly one Series field. Provider strategy selection stays in
the main process.

For every PostgreSQL field, table-wide `pg_stats.n_distinct` is the first step.
An estimate at or below 50 accepts immediately. For an unscoped field, an
estimate above 200 rejects immediately; 51-200 and unavailable/malformed
statistics fall back to exact single-column SQL. For a time-scoped/filtered field,
a whole-table estimate above 50 never rejects the filtered subset: it falls back
to the exact scoped single-column probe instead.

PostgreSQL no longer uses a grouped `EXPLAIN` cardinality strategy in this
iteration, and the main process rejects multi-column PostgreSQL probe requests
before generating SQL. Adding `status` to an existing `type` Series selection
checks `status` only; it never asks PostgreSQL for the cardinality of
`(type, status)`.

Manual testing showed why an exact-only policy is not appropriate for PostgreSQL.
On a representative large events table, an exact grouped probe for a
low-cardinality field performed a parallel sequential scan across millions of
qualifying rows and took about 10 seconds. `LIMIT 101` bounds the returned
groups, not the amount of source scanning or aggregation PostgreSQL may need to
perform first. Restoring `pg_stats` for each individual field avoids that work
for the common clearly-low unscoped case, while scoped requests still fall back
to exact when whole-table statistics are not sufficiently informative.

BigQuery arbitrary SQL retains its dry-run/read-only validation. Series
cardinality uses two structured generated operations instead: a per-field
`APPROX_COUNT_DISTINCT` preflight and, only for the 51-200 advisory band, the
existing bounded exact probe. Estimates at or below 50 accept and estimates above
200 reject. Both operations validate the structured request again, generate their
own SQL, quote identifiers using GoogleSQL escapes, bind predicate values, and
preserve location/default dataset/maximum bytes billed. Neither performs the
arbitrary-user-SQL dry run and there is no raw SQL safety bypass. The execution
results continue to expose bytes processed and cache status.

BigQuery also enforces a single Series field before query generation. Adding
`status` to an existing `type` Series selection probes `status` only; neither
the approximate nor exact operation generates `STRUCT(type, status)` or another
combined cardinality expression.

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
then the actual probe: three `createQueryJob` calls. The provider now routes
directly to BigQuery-native work: a decisive approximate result uses one execution
job; an estimate in the 51-200 band uses the approximate job plus one exact job.
There are zero PostgreSQL statistics/EXPLAIN attempts and zero validation dry runs
for these internally generated operations. Adapter tests cover approximate counts
20, 500, and 75 with expected job counts 1, 1, and 2 respectively. This is a
round-trip/strategy improvement; live latency and bytes-scanned measurements are
still pending.

Run the synthetic benchmark with Node 24:

```sh
node scripts/benchmarks/series-cardinality.mjs 1000000
# Explicit opt-in; configure standard PG* environment variables first:
node scripts/benchmarks/series-cardinality.mjs --postgres 1000000
```

DuckDB uses an in-memory temporary table. PostgreSQL uses a session-local temporary
table, compares unindexed/indexed cases, prints JSON plans, and exercises the
per-field PostgreSQL dispatcher for single-column cases. Neither modifies existing
application tables. The raw query-shape benchmark can still compare one/multiple
columns, but application-level PostgreSQL cardinality preflight is now per-field.
Each shape has one warm-up and three measurements.

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
when available. PostgreSQL strategy values are `postgres-pg-stats` and
`postgres-exact`; BigQuery uses `bigquery-approx` and `bigquery-exact`.
No identifiers, SQL, values, credentials, or remote telemetry are included.
Timings are per strategy; fallback duration plus exact duration gives the total
database work for one request.

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

- PostgreSQL: verify one unfiltered field resolves through `pg_stats` for
  clearly low/high estimates; verify mid-band/unavailable stats fall back to exact.
  With a time scope, verify estimates above 50 fall back to exact rather than
  rejecting. Add a second Series field and confirm only the newly added field is
  probed and no multi-column PostgreSQL cardinality SQL is generated.
- BigQuery: verify approximate counts <=50 and >200 resolve in one job, while
  51-200 produces exactly one additional exact job. Add a second Series field and
  confirm only the newly added field is referenced; inspect job SQL for no STRUCT,
  pg_stats, EXPLAIN, or validation dry run. Ensure normal raw SQL still enforces
  read-only behavior and billing limits.
- During a pending probe, change table/time scope or disconnect: no obsolete
  response should apply a selection. Retry after a transient error.
- Re-select a formerly accepted dimension after the data changes: a new check
  must occur. Removing a dimension should remain immediate.
- Verify NULL combinations and DATE/DATETIME/TIMESTAMP range boundaries.
