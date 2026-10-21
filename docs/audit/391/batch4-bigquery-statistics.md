# Batch 4 truthful BigQuery statistics — #491

**Implementation merged:** PR #508, `cff67567263123d6ad86a65289d24c4536d2d6de`, 2026-10-21 (Europe/Paris). **All consolidated manual acceptance remains Pending.**

Base: `09df6c957f7db113ed04f8a9a48f9affb872d628`. Implemented independently in PR #508, with no unmerged prerequisites. No additional provider requests, implicit retries, billing changes or persistence format changes.

## Inventory and metric mapping

Before: the BigQuery adapter already attached measured request duration, returned row count, truncation, safely parsed processed bytes and cache-hit metadata to `QueryExecutionInfo`. Table/chart headers displayed only returned rows, columns and duration, identically to PostgreSQL/DuckDB/SQLite. The missing exposure is requested convergence, not missing adapter support for every field.

| Display label                    | Unit / representation                                   | Provider field / source                                                                | Availability and script attribution                                                                                            |
| -------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Returned rows                    | Safe local row count                                    | Capped normalized `rows.length`, `result.rowCount`; local filtering can show X of Y    | Final executed statement's rows for a script; never parent aggregate counts                                                    |
| Total rows                       | Unsigned safe integer number                            | `jobs.getQueryResults` response `totalRows`                                            | Omitted if unavailable/invalid/unsafe; script label explicitly says final-statement rows                                       |
| Capped · more rows available     | Boolean notice                                          | Row cap, next-page/query token, or valid total rows greater than returned rows         | The returned result set, not all script statements                                                                             |
| Request                          | Integer milliseconds                                    | Local `Date.now()` interval around executed-job creation, result fetching and metadata | Excludes the preceding read-only dry run; includes client/network/polling/transfer; never described as provider execution time |
| Job / Script job: elapsed        | Safe integer milliseconds                               | Executed-job `statistics.endTime - statistics.startTime`                               | Requires valid ordered endpoints; zero retained; not final-attempt CPU time or sum of slots; parent scope for scripts          |
| Job / Script job: processed      | Bytes, safe integer number                              | Executed-job `statistics.query.totalBytesProcessed`                                    | No dry-run substitution or result-response fallback; parent job metadata for scripts                                           |
| Job / Script job: billed         | Bytes, safe integer number                              | Executed-job `statistics.query.totalBytesBilled`                                       | Omitted when unavailable; not a currency/cost estimate; parent metadata for scripts                                            |
| Job / Script job: slot-ms        | Accumulated slot milliseconds, safe integer number      | Executed-job `statistics.query.totalSlotMs`                                            | Separate from wall time; parent metadata for scripts                                                                           |
| Job / Script job: cache hit/miss | Strict boolean                                          | Executed-job `statistics.query.cacheHit`                                               | True and false retained; other runtime types omitted; no inferred cache state                                                  |
| Dry-run estimate                 | Bytes, safe integer number, existing estimate flow only | Validation/estimate job's inline `metadata.statistics.query.totalBytesProcessed`       | Never copied into executed-result statistics; existing #451/#463 boundary semantics retained                                   |

All provider numeric fields reuse the existing guarded unsigned integer parser. Null, missing, blank, whitespace, malformed, negative, fractional, exponent/hex, boolean/object and unsafe integers remain unavailable. Values over `Number.MAX_SAFE_INTEGER` are omitted, not rounded; there is no new exact-string metric format. No new global numeric or datasource model.

Script scope comes from the validated statement type and/or executed-job script metadata, even if the persisted job omits `statementType`. Labels separate parent metadata from final output rows. No child enumeration/aggregation, per-statement billing, copied parent plan, unsupported PostgreSQL buffer/CPU metrics or fabricated parity. Duration/rows remain in the same table/chart header location used by other SQL providers. The new component reads only its owning result; no detached metadata cache/state exists.

Sources checked against installed `@google-cloud/bigquery` 9.0.2 `build/src/types.d.ts` (`IJobStatistics`, `IJobStatistics2`, result metadata) and official Google references:

- [Job statistics schema](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/Job#JobStatistics2)
- [Job timing schema](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/Job#JobStatistics)
- [Result-set totalRows](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/jobs/getQueryResults)
- [Multi-statement final output and child jobs](https://docs.cloud.google.com/bigquery/docs/multi-statement-queries#return_the_last_executed_statement)

## Ownership, validation and limitations

`QueryStatistics` is shared by production table and chart headers. Existing lifecycle/request ownership remains responsible for pending/success/failure and tab/profile replacement. Failure hides prior statistics with the result; stale query completion cannot create independent metadata. Cold restore intentionally restores **no result/statistics/busy state**, preserving drafts and avoiding automatic execution, as before.

Adapter/NON07 fixtures cover safe boundaries, zero/unknown/false, independent processed/billed/slot values, total/returned/capped rows, ordered/partial/malformed timing, dry run vs execution, script parent/final output and the unchanged two-job validation/execution count. Production `toIpcSafeQueryResult` and renderer API envelope tests are modeled IPC tests, not native transport claims. Lifecycle and cold-restore tests preserve attached metadata and clear failed results. Production table tests render success A → failure B → success C; full adjacent query-owner tests retain supersession and profile/tab isolation.

Local `pnpm verify` passed controls/dead code/imports, format, lint, typecheck, 552 main/shared tests (5 skipped), 692 renderer/integration tests including real SQLite, 32 script tests and build before stopping at the existing macOS-only `pnpm smoke` path on Linux (ENOENT). Added lifecycle/cold-restore and final-HEAD suite results are recorded in the PR. Full UI suite: 1,091 passed. Advisory duplication was reviewed, with no unrelated cleanup.

Local native capture is unavailable (no display/Xvfb; headless Electron SIGSEGV). `Batch 4 BigQuery Statistics Regression` first generates a deterministic result using the real adapter plus production serializer, then carries it across real Electron IPC/preload to the renderer. It captures actual base/head normal/narrow states and checks success/failure/recovery, late older completion, and tab/profile isolation. Artifact: `batch4-statistics-evidence`, original-resolution PNGs plus source-SHA measurements. This is synthetic provider data with native transport, not authorized live BigQuery evidence. No live credentials were available; live acceptance remains Pending.

## Consolidated owner steps — all Pending

Reuse RC-02/04/10/13/17/20/21/22. Record actual package/full SHA, OS, project/location, safe fixture, Pass/Fail/Untested and evidence on #382. Never enter credentials in screenshots or commit test credentials.

1. With your authorized read-only BigQuery profile, record billing project, location and configured maximum bytes. Run `SELECT 1 AS marker`. Expected: returned rows/columns and request duration in the usual result header; only available job metrics appear; genuine zero/cache false remain visible. Compare available values to that exact job's Google console metadata.
2. Run a small, authorized table query within your existing maximum bytes limit, then repeat unchanged. Expected: processed vs billed bytes and slot-ms stay distinct; cache hit/miss matches provider metadata where available. Do not assume every query is cacheable or every field is populated.
3. Run `DECLARE marker INT64 DEFAULT 1; SELECT marker AS marker;`. Expected: final-statement row labels and explicit Script job metric scope; no implication that parent totals belong to that child alone. No extra query jobs are created for the header.
4. On a safe fixture, return more rows than the configured client cap (for example `SELECT n FROM UNNEST(GENERATE_ARRAY(1, 10001)) AS n`). Expected: returned count is capped, provider total is separately shown if safe/available, and more-rows notice appears. If the current cap differs, adjust the fixture or mark the case Untested; don't increase paid scans just to obtain a screenshot.
5. Run success A, a deliberately invalid read-only query B, then success C. Repeat with delayed old completion, two tabs and two profiles where latency/fault controls permit. Expected: B shows no old statistics, C owns its metrics, old delivery cannot overwrite C or leak to the other tab/profile; no automatic retry.
6. Inspect Table and a supported chart at normal/narrow widths, including true zero, unavailable metadata and long numeric values using fixtures if a provider can't reproduce them. Expected: equivalent header location, readable units/scope, wrapping with reachable actions, no fabricated zeros. Missing data is omitted, not inferred.
7. Save the draft/workspace, quit and relaunch the exact package. Expected: draft/profile retained, no old statistics or busy state and no surprise Run. Repeat the existing missing/malformed ADC and genuine SQL-error recovery smoke to preserve #505. Reuse RC-19/21 packaged checks rather than counting CI fixtures as human acceptance.

Implementation is merged; no release has been published. All manual and live acceptance remains Pending.
