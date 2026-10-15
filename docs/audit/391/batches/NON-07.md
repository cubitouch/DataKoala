# NON-07 — BigQuery execution-statistics contract

## A. Metadata

- **Parent:** #391, Phase 1C; integration draft PR #406, branch `audit/391-ux-convergence`.
- **Independent batch:** NON-07 only; **inventory:** C12 (processed bytes/cache data), provisional UI-002.
- **Verified integration base:** `906960284260175f88761d9ff93fe2fd79351dbd`.
- **Isolated branch:** `audit/391-non-07-bigquery-stats`; temporary draft PR targets the integration branch, not `main`.
- **Owned changes:** this report, `src/main/adapters/non07-bigquery-statistics.test.ts`, `src/renderer/src/lib/non07.execution-metadata.test.ts`. Production code, shared harness, workflows and authoritative register unchanged.
- **Provider documentation:** [BigQuery Job/JobStatistics2 REST contract](https://cloud.google.com/bigquery/docs/reference/rest/v2/Job), [getQueryResults](https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/getQueryResults), [multi-statement child jobs](https://cloud.google.com/bigquery/docs/multi-statement-queries). SDK dependency is `@google-cloud/bigquery@9.0.2` in `package.json`. Provider documentation describes *possible* fields; it does not prove which a live job populates.
- **Baseline expectations:** `docs/datasource-feature-inventory.md` calls C12 **Conditional**, with manual verification “UI exposes values where available.” The coverage register calls UI-002 a **provisional lead**, specifically requiring contract/renderer intent confirmation before a visual-defect finding.

## B. Independent coverage dispositions

| Record | Behavioral evidence | Visual evidence | Implementation owner | Verification limits |
| --- | --- | --- | --- | --- |
| **C12** | **Source-observed + new deterministic tests; CI confirmation pending**: `non07-bigquery-statistics.test.ts` seven named tests (normal, zero/missing, precision, null/blank reproduction, script, failures, dry-run rounding); `non07.execution-metadata.test.ts` four renderer lifecycle tests; existing `bigquery-adapter.test.ts`, `ipc-serialization.test.ts`, `queryResultLifecycle.test.ts` | **N/A for numeric transport/contract; UI presentation is assessed separately under UI-002** | BigQuerySession.executeQuery/estimateQuery; QueryExecutionInfo; db.runQuery; IPC; queryResultLifecycle | Synthetic BigQuery client; no ADC, paid project, service errors, native Electron transport, live job or authenticated cancellation |
| **UI-002** | **SO / UV as a product requirement**: renderer source has row/column/duration toolbar text and no bytes/cache consumers; source paths are known but no approved visible statistics UX contract was found | **Not required yet**: intentionally no screenshot merely to show absence | ResultsTable and GenericResultExplorer are result toolbar owners; product owner must determine whether BQ stats belong there or another view | Baseline inventory is a verification expectation, not a detailed feature specification; no native UI screenshot proves the *intent* |

**UI-002 disposition: RETAIN PROVISIONAL (unverified requirement).** Not confirmed as defect, not retired as duplicate, and not evidence of an intentional product decision. C12's numeric behavior can be characterized independently of the product presentation decision.

## C. Statistics contract matrix

| Field / case | Provider source or capability | DataKoala normalization | Shared result / IPC | Renderer availability and display | Verification |
| --- | --- | --- | --- | --- | --- |
| Processed bytes | `job.getMetadata().statistics.query.totalBytesProcessed` (Int64-format string) | `Number(raw)` then `Number.isSafeInteger`: safe integer kept, unsafe/missing `undefined`; `null`/empty string become zero | `execution.bytesProcessed?: number`; `toIpcSafeQueryResult` spreads metadata unchanged | Present in renderer `QueryResult`; **not displayed** in current SQL table or chart toolbar | New mocked ordinary/zero/missing/large/null tests; source |
| Billed bytes | `statistics.query.totalBytesBilled` (provider-supported, may be absent/nonbilling) | **Not read** | No `bytesBilled` field in `QueryExecutionInfo` | Unavailable | New explicit omitted-field assertion; product requirement unverified |
| Cache hit | `statistics.query.cacheHit` boolean | Direct property copy, no coercion; missing stays `undefined` | `execution.cacheHit?: boolean` and IPC-preserved | Present in renderer `QueryResult`; **not displayed** | New true/false/missing tests |
| Duration | Application `Date.now()` around execution job creation, results and metadata retrieval | Nonnegative elapsed milliseconds (wall-clock; not BigQuery engine timing) | Top-level `durationMs` and `execution.durationMs` | Displayed in ResultsTable and GenericResultExplorer as `ms` | Source + mocked equality assertion |
| Row count / truncation | Local `rows` and `nextQuery`/`apiResponse.pageToken`, capped at 10,000 | Retained row count; truncation true when more data/page token | `rowCount`, `execution.rowCount`, `execution.truncated` | Rows/cols shown; no dedicated BQ truncation metric in this audit | Existing BigQuery adapter tests; new ordinary test |
| Job ID/status | BigQuery job ID and status in Job metadata (provider capability) | **Not read**; success is inferred from completed awaited calls; failures throw | No jobId/status in `QueryExecutionInfo` | Not available | Source observation; not a claimed missing user requirement |
| Slot time / plan / child-job counts | Provider Job statistics can expose `totalSlotMs`, `numChildJobs`, plans | **Not read** or aggregated | Not represented | Not available | Source; new omitted-slot/child-field assertions |
| Dry-run estimate | `dryJob.metadata.statistics.query.totalBytesProcessed` | `estimateQuery` uses unguarded `Number(...)` **without safe-integer check** | Separate `estimateQuery` return; not execution metadata | Not covered as a visible stat | New unsafe-large estimate reproduction |
| Final-statement script results | `getQueryResults` on script parent returns last executed statement rows | Uses one parent `getMetadata`; does not enumerate child jobs | One QueryResult for final statement; parent query statistics copied if present | Same shared SQL result UI | Existing allowed-script test + new parent-stats characterization |

The API supports Int64 statistics as decimal strings and missing data. A provider field being documented does **not** imply a particular execution returns it, or that DataKoala promises to expose it. Billed bytes must not be described as actual cost, especially for capacity pricing. Cached requests may report zero bytes but the boolean flag is independent; no cache hit is inferred from zero bytes.

## D. End-to-end ownership map

```text
BigQueryAdapter / BigQuerySession.query
  -> assertReadOnlyBigQueryQuery + dry-run statement type validation
  -> BigQuerySession.executeQuery(createQueryJob; getQueryResults; getMetadata)
  -> QueryResult + execution{provider,durationMs,rowCount,truncated,
                             bytesProcessed?,cacheHit?}
  -> SessionManager/DB runQuery: activeSession.query(...)
  -> toIpcSafeQueryResult: normalizes rows, spreads ALL result metadata
  -> main/index.ts IPC.QUERY_RUN: {ok:true,result} or {ok:false,kind,message}
  -> preload/index.ts query.run + renderer lib/api.ts: unwrap, no stat transform
  -> QueryEditor.tsx / SQL BuilderPanel.tsx
  -> operation/profile/tab current guard -> useStore.completeQuery
  -> queryResultLifecycle: store QueryResult unchanged, tab result/pending result
  -> ResultsTable.tsx / GenericResultExplorer.tsx: rows, columns, duration
     (currently do not render execution.bytesProcessed/cacheHit)
```

`QueryEditor` guards operation freshness before completion; `useStore.completeQuery` also checks an operation token. On a failed request, `completeQueryState` retains the **previous successful result**, including its execution metadata, and sets the error separately. A future statistics UI must not mislabel retained metrics as belonging to the failed request. The existing lifecycle/ownership contract is not a real BigQuery job-cancellation mechanism.

## E. Executed/defined scenarios

All new scenarios are deterministic provider mocks or renderer lifecycle functions. A committed test name does not imply a green execution; consult section G for actual CI proof.

| Named test (prefix `NON07`) | Input and expected contract | Source-observed behavior / assertions |
| --- | --- | --- |
| ordinary SELECT takes processed bytes… | Executed metadata bytes=1024, billed=2048, cache=false; conflicting results API | Reads executed metadata (not dry-run/results API), omits billed/slot; safe IPC structured clone |
| zero values and both cache-hit booleans… | `0`, true/false and missing | Zero retained as zero; booleans retained; missing bytes/cache `undefined` |
| precision boundary omits unsafe… | MAX_SAFE_INTEGER, 2^53, 2^53+1, missing | Upper boundary preserved; unsafe integers deliberately omitted instead of rounded |
| EXPECTED FAILURE reproduction: null and blank… | `null` / `''` | `Number(null)` and `Number('')` are zero: current adapter treats invalid/missing data as a measured zero; test *documents current behavior* and should change with a fix |
| SCRIPT uses parent job statistics… | Allowed DECLARE/SET/SELECT, parent stats, final rows | Parent-job values only; final SELECT result; no child-job metadata enumeration |
| execution failures produce no successful… | create/result/metadata failure | Promise rejects, no successful QueryResult with stats |
| EXPECTED FAILURE reproduction: dry-run estimate… | `9007199254740993` bytes | Unguarded `Number` rounds to `9007199254740992`; current behavior explicitly characterized |
| BigQuery metadata survives a successful lifecycle… | zero bytes + cache=true | QueryResult execution object preserved on success |
| pending BigQuery metadata stays attached… | previous vs pending results, different bytes/cache | Pending isolated from prior displayed result; promoted atomically |
| failed query retains previous result statistics… | failed query after successful prior query | Previous result retained with old metadata; error is separate |
| absent and unsafe provider statistics survive… | `undefined` bytes/cache | No renderer lifecycle fabrication; optional fields unchanged |

Not executed: real cached jobs, script child-job enumeration, live failure/cancellation, IPC in an actual Electron browser process, display expectation acceptance. BigQuerySession.close is empty and does not cancel already-running jobs.

## F. Findings and Visual Convergence Atlas candidates

| ID / class | Evidence, impact, recommended owner |
| --- | --- |
| **NON07-01 — CONFIRMED normalization edge case, lower severity** | Adapter uses `Number(raw)`; `null` and blank values become zero, conflating missing and true zero. Deterministic reproduction. BigQuery adapter owner: validate decimal-string input before coercion, preserve optional absence; no fix within this PR. No proof that normal live BigQuery responses contain these malformed values. |
| **NON07-02 — CONFIRMED dry-run precision gap** | `estimateQuery` lacks `Number.isSafeInteger` protection present in `executeQuery`, and can silently round Int64 estimates above 2^53−1. Deterministic reproduction. BigQuery adapter owner: retain exact decimal string or explicitly guard/report unrepresentable values after contract review. |
| **NON07-03 — UNVERIFIED REQUIREMENT / scoped omission** | BigQuery provides billed bytes, slot time, job ID and more, but `QueryExecutionInfo` does not include them. These are not dropped in IPC: they are deliberately never normalized into the result. Product/architecture owner to decide whether further fields are required, their units and safe representation before feature work. |
| **NON07-04 — UNVERIFIED UI expectation (UI-002)** | Result toolbars display rows/cols/duration but no BQ bytes/cache; the typed execution fields reach renderer state. No confirmed business/product requirement specifies they must be visible. Preserve lead, do not call confirmed UI defect or create speculative screenshot. |
| **NON07-05 — INTENTIONAL DIFFERENCE, scripts** | Script parent returns last-statement rows and parent statistics, not per-statement breakout. Provider documents child jobs. A per-statement UI would require a separate approved contract and enumeration; do not silently treat parent stats as final SELECT's exact costs. |
| **NON07-06 — ALREADY-CONVERGED infrastructure, with stale display caveat** | Generic `QueryResult`/IPC/lifecycle preserve `execution` fields without BigQuery-specific code, subject to current-operation guards. A failed query may leave the previous successful result visible; future stats presentation must label association appropriately. No new universal abstraction warranted. |

**Atlas handoff:** NON07-01/02 are nonvisual correctness fixes; NON07-03/04 require product intent, with UI-002 provisional; NON07-05 is a valid provider-specific distinction; NON07-06 indicates reusable shared result handling. Do not edit final Atlas here.

## G. CI, provenance and remaining verification

- **Integration base:** `906960284260175f88761d9ff93fe2fd79351dbd`.
- **Test commits:** `0f4c7fd7c073f010ec265efd3cf92c8b5d5e071f` (provider cases), `2b04e3e49bb2c8c34d4af23539bb56e76e00ee58` (renderer lifecycle), `cf8db2cf7d0ed0da81d38f21df41941763d3ef0a` (dry-run estimate and mock extension).
- **Report commit / PR / final tested SHA:** pending creation and CI. Update with exact IDs and outcomes; do not claim a pass from a check still in progress.
- **CI checks to observe:** `CI / Unit tests` (runs `pnpm test` and `pnpm smoke:sqlite`; covers seven Node tests and four Vitest tests); UI tests, production build, Quality, Docs and preview if triggered.
- **Intended focused commands:** `node --experimental-strip-types --test src/main/adapters/non07-bigquery-statistics.test.ts`; `pnpm exec vitest run --config vitest.renderer.config.ts src/renderer/src/lib/non07.execution-metadata.test.ts`.
- **Local checks:** none; explicitly **no local linting or formatting**. Local clone unavailable in this execution environment. Automated CI formatting/typecheck outcomes must distinguish inherited integration-branch failures from NON-07-owned changes.
- **Not claimed:** live ADC, on-demand charges/billing metrics, provider authorization, actual cancellation, script-child sums, OS/browser IPC runtime, screenshots, regression-free CI prior to observed completion.

## H. Completion disposition

**PARTIAL until tests/CI are confirmed and UI-002's product expectation is resolved.** The scoped source mapping already establishes which statistics flow to renderer state, which are dropped at adapter, and which are displayed. C12 and UI-002 are independently disposed; no screenshot is justified merely to show absence. If the product owner confirms a visible-statistics contract, request an integration-owned CAP screenshot showing a populated BigQuery result with safe nonzero processed bytes and an explicit cache-hit boolean, plus missing-statistics state; attach generating source SHA and measurements provenance.

**Stop at NON-07.** Do not edit central register, production code, CAP-18 harness, PR #406, Phase 2, or final Atlas; no merge.
