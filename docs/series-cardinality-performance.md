# Series cardinality performance (#324)

## Final strategy

Series-cardinality preflight validates each newly added Series field independently.
It does not calculate the combined cardinality of the complete Series selection.

> The preflight guard limits individual Series dimensions. It does not guarantee
> that the Cartesian combination of several Series fields is <=100.

| Provider | Strategy | Resolution |
| --- | --- | --- |
| PostgreSQL | Per-field `pg_stats.n_distinct` | <=50 accept; unscoped >200 reject; otherwise exact single-column fallback |
| BigQuery | Per-field `APPROX_COUNT_DISTINCT` | <=50 accept; >200 reject; 51-200 exact single-column fallback |
| DuckDB / local files | Exact bounded single-column `GROUP BY` | 0-100 accept; 101 reject |
| SQLite via DuckDB | Same exact bounded single-column `GROUP BY` through DuckDB | 0-100 accept; 101 reject |

The renderer owns only the interaction semantics: when the selection changes from
`[type]` to `[type, status]`, it submits a cardinality request for `status`.
If several fields are added together, they are validated one at a time before the
candidate selection is committed. Removing or merely reordering already-approved
fields performs no cardinality query.

The structured preflight request is intentionally singular:

```ts
{
  schema,
  table,
  seriesColumn,
  predicates
}
```

Provider strategy selection stays in the main process. The SQL generator no
longer supports cardinality tuples or BigQuery `STRUCT(...)` probes.

## PostgreSQL

Every PostgreSQL field starts with the existing `pg_stats.n_distinct`
interpretation.

For an unscoped field:

```text
estimate <= 50  -> accept
estimate > 200  -> reject
51-200          -> exact fallback
unavailable     -> exact fallback
```

For a scoped/time-filtered field, a table-wide estimate <=50 can still accept,
but any estimate above 50 falls back to the exact scoped single-column query.
A high whole-table estimate never rejects a filtered subset by itself.

The exact fallback uses the same bounded single-column shape as the local
providers. PostgreSQL no longer uses a cardinality `EXPLAIN` path.

Manual testing showed why exact-only approval regressed PostgreSQL performance:
a low-cardinality field on a representative large events table still caused a
parallel sequential scan and aggregation across millions of qualifying rows,
taking about 10 seconds. `LIMIT 101` bounds returned groups, not source work.
Restoring the native `pg_stats` fast path avoids that scan in common cases.

## BigQuery

BigQuery routes directly to BigQuery-native generated operations and never tries
PostgreSQL statistics or planner logic.

The first generated query is equivalent to:

```sql
SELECT APPROX_COUNT_DISTINCT(`status`) AS `count`
FROM `project.dataset.events`
WHERE ...;
```

Decision band:

```text
approx <= 50  -> accept
approx > 200  -> reject
51-200        -> exact fallback
```

The exact fallback is a bounded single-column generated query:

```sql
SELECT count(*) AS `count`
FROM (
  SELECT `status`
  FROM `project.dataset.events`
  WHERE ...
  GROUP BY `status`
  LIMIT 101
) AS `cardinality_probe`;
```

A decisive approximate result therefore uses one BigQuery job. The uncertain
band uses the approximate job plus one exact job.

Both operations are structured and generated internally, runtime validated,
GoogleSQL-quoted, parameterized, and retain configured location, default dataset,
and `maximumBytesBilled`. They do not perform the arbitrary-user-SQL validation
dry run. Ordinary arbitrary BigQuery SQL still uses the existing dry-run and
read-only validation path.

## DuckDB / local files and SQLite via DuckDB

These providers deliberately stay exact-only in this PR. There is no native
statistics or approximate layer.

The generated query shape is:

```sql
SELECT count(*) AS "count"
FROM (
  SELECT "status"
  FROM "schema"."events"
  WHERE ...
  GROUP BY "status"
  LIMIT 101
) AS "cardinality_probe";
```

Only the newly added field is selected and grouped. The query generator cannot
emit `GROUP BY "type", "status"` because the preflight contract contains one
`seriesColumn`, not an array.

SQLite files follow the same path because DataKoala executes them through
DuckDB:

```text
SQLite file
-> DuckDB execution
-> exact bounded single-column cardinality
```

Results are fail-closed:

```text
0-100 -> accept
101   -> reject
anything malformed/out of range -> error
```

The existing GROUP BY shape is retained. The DuckDB benchmark showed mixed
results between GROUP BY and DISTINCT, with GROUP BY clearly faster for the
common low-cardinality synthetic case; there is no evidence here for a generic
query-shape rewrite.

## Cache, lifecycle and instrumentation

Only identical in-flight requests on the same live session are shared. Settled
successes and failures are evicted, so later identical user interactions perform
a fresh check. Reconnected sessions cannot reuse another session's work.

The renderer keeps stale-response protection across table, time-scope and
connection changes. Results from replaced sessions are discarded.

Enable local instrumentation with:

```sh
DATAKOALA_DEBUG_CARDINALITY=1 pnpm dev
```

Strategy labels are:

```text
postgres-pg-stats
postgres-exact
bigquery-approx
bigquery-exact
duckdb-exact
sqlite-duckdb-exact
```

Measurements include provider, strategy, whether predicates exist, duration,
outcome, and BigQuery bytes processed when available. They do not include field
names, table names, SQL, predicate values, file paths, credentials, or remote
telemetry.

## Measurements and reproducibility

Run the synthetic benchmark with Node 24:

```sh
node scripts/benchmarks/series-cardinality.mjs 1000000
# Explicit opt-in; configure standard PG* environment variables first:
node scripts/benchmarks/series-cardinality.mjs --postgres 1000000
```

The application benchmark is now per-field only. DuckDB uses an in-memory
temporary table. PostgreSQL uses a session-local temporary table and optionally
indexes the individual benchmark fields. Neither modifies existing application
tables.

Observed DuckDB baseline medians from the earlier 1,000,000-row synthetic run
(ms; one warm-up plus three measurements):

| Field / scope | GROUP BY (retained) | DISTINCT | Ordered DISTINCT |
| --- | ---: | ---: | ---: |
| 10-value field / all | 3.46 | 11.67 | 8.25 |
| Unique ID / all | 37.75 | 37.00 | 27.83 |
| Unique ID / filtered | 8.92 | 3.86 | 4.42 |

Plans place the limit above aggregation and a sequential scan, so a bounded
result does not imply bounded source scanning. The mixed timings do not justify
changing the generic DuckDB exact shape in this PR.

Live PostgreSQL and BigQuery behavior should still be manually verified against
representative connections before merge. The implementation work for #346 is
otherwise complete; #324 can remain open until that final verification/merge
decision.

## Manual verification before merge

- PostgreSQL: verify a clearly low unscoped field resolves through `pg_stats`;
  verify mid-band/unavailable statistics fall back to exact; verify scoped
  estimates above 50 fall back rather than reject.
- BigQuery: inspect job history for one job on decisive approximate results and
  two jobs for the uncertain band; verify normal arbitrary SQL still performs
  its read-only/dry-run validation.
- DuckDB/local files: add a second Series field and confirm the cardinality SQL
  contains only that newly added field and one bounded exact query.
- SQLite file: repeat the same check and confirm execution remains through
  DuckDB with no provider-specific statistics query.
- For all providers: remove a Series field and confirm no cardinality request;
  change table/time scope during a pending check and confirm the stale response
  cannot apply.
