# Async ownership reassessment — #365 Phase 3A

Baseline: `main` **9b52a5c**, 2026-10-13, after #384, #386, #390, #392 and
#394. Audit and regression foundation only: no production lifecycle changes,
Phase 3B/3C implementation or query cancellation IPC.

## Recommendation

**3B: narrow** to generation-aware metadata coalescing and identity-safe cache
cleanup in the existing metadata modules. Do not pilot a generic primitive.
**3C: replace targeted adoption with a separate Tempo detail-lifecycle bug fix**.
There is no evidence for migrating all async operations to another coordinator.
Phase 3 cannot yet be closed: three defect groups are reproduced below. After
those narrow fixes and review, advance to Phase 4; do not manufacture more async
consolidation work. SQL Builder probe extraction remains Phase 4B.

## Sources and resolved concerns

The requested query/connection audit files now live in
[docs/history/query-lifecycle-audit.md](../history/query-lifecycle-audit.md) and
[docs/history/connection-lifecycle-audit.md](../history/connection-lifecycle-audit.md),
following #388. They are historical investigations, not current contracts.
The current [anomaly](chart-anomaly-lifecycle-audit.md) and
[configuration/export](chart-configuration-export-audit.md) audits remain in this
directory. This assessment checks actual callers and implementations.

- **#343 profile-scoped connections:** `connectionStateByProfileId` and
  `metadataByProfileId` are authoritative; tab bindings do not imply global active
  connection ownership. Generation comparison is per profile. The later #370
  fixes also removed stale renderer disconnect of main-owned reused sessions and
  the lazy path's unrelated active-tab confirmation. `SessionManager` owns reuse,
  replacement and obsolete adapter-session disposal.
- **#384/#386 query lifecycle:** `QueryOperation` captures tab/profile/generation,
  unique token and primary/Explain slot. Store completion atomically verifies
  identity. Runtime `queryContextId` protects connection preflight across reset,
  preset and rebind-away/back. The store subscription releases invalid ownership
  and its pending tokens on binding/generation/status transitions. Primary and
  Explain loading aggregate without clearing one another. SQL raw/Builder,
  Prometheus, Loki and Tempo final deliveries survive workspace removal.
  Local primary revision maps and duplicate primary loading authority are gone.
  Saved drafts exclude pending operations; restoration never retries them.
- **#390 interactions:** owner-bound callbacks prevent wrong-tab chart actions;
  chart selection remains local and never becomes an async query lifecycle.
- **#392 anomaly:** `useChartAnomalyAnalysis` owns request UUID, mounted context,
  findings/error/loading and cancellation. Result/context/owner replacement and
  unmount invalidate; visibility/units/log scale legitimately preserve findings.
- **#394 export:** `useChartExport` synchronously excludes concurrent copy/export,
  validates committed chart/options/result/owner before and after capture and
  suppresses stale feedback/final cleanup. Already-issued native writes/dialogs
  cannot be undone. Readiness/render completion is a different responsibility.

Thus the original roadmap's main query supersession, remount, wrong-tab delivery,
old-finally loading and chart AI/export concerns are already addressed. Another
universal request identity layer would repeat established ownership.

## Current ownership inventory

The two tables share operation IDs: together they record all requested properties.
“Logical” means stale publication suppression, **not** server cancellation.

| ID / operation and implementation                                                                           | Owner and identity                                                                                                                                                                                  | Supersession                                                                                               | Cancellation                                                                                     | Unmount/remount                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Q — SQL raw/Builder, Prometheus and Loki primary (`QueryEditor`, SQL `BuilderPanel`, `LokiExplorer`, store) | Durable tab; profile/generation/token in primary `QueryOperation`; SQL connection preflight captures query context                                                                                  | New primary token; reset/clear/preset/close/rebind or unusable/replaced generation                         | Logical; no datasource query cancel IPC                                                          | Continues to originating store session; return reads pending/result/error; no automatic primary rerun                                           |
| E — PostgreSQL Explain/Analyze (`QueryEditor`)                                                              | Durable tab; independent Explain slot/token plus phase/snapshot                                                                                                                                     | New slot identity or session/connection abandonment                                                        | Logical                                                                                          | Final plan/errors/phase complete in originating session; independent of Run                                                                     |
| S — Tempo progressive search (`useTempoTraceSearchController`)                                              | Durable tab primary token; progress adds mounted/active-tab check                                                                                                                                   | Same primary contract as Q                                                                                 | Logical; progress transport request ID routes IPC, not cancellation authority                    | Final rows/error survive; partial rows/progress are local and not promised on remount                                                           |
| V — Loki optional volume/cardinality (`LokiExplorer.loadTrend`)                                             | Component resource; local trend revision, query/range/grouping key and captured primary owner (or source-result fallback), tab/profile/generation                                                   | New trend revision; unmount/visibility; obsolete primary or primary failure blocks publication             | Logical; probe must be current before volume dispatch                                            | Local trend may reload after return; original late trend cannot publish. This is intentional secondary work, not duplicate primary execution    |
| C — explicit/lazy connect and reconnect (`useStore`, `tabConnection`)                                       | Profile; explicit renderer intent; lazy profile promise; main profile intent and generation                                                                                                         | Explicit intent supersession; generation checks; main replacement/disconnect                               | Adapter `cancelConnect` optional; main closes obsolete sessions. Not query cancellation          | Profile work survives UI removal; caller retains tab preflight/binding checks                                                                   |
| H — hydration and initial/retry object discovery (`Sidebar`, connect paths, `connectionMetadata`)           | Profile/generation; explicit discovery also checks renderer connect intent                                                                                                                          | Current usable generation; explicit intent replacement; hydration checks current profile connection        | Logical                                                                                          | Store metadata publication survives caller removal where allowed; UI effects retain local guards                                                |
| M — manual metadata refresh (`metadataRefresh`)                                                             | Profile promise registry; captured generation; retained loaded metadata                                                                                                                             | Completion checks usable generation, but joining checks profile only (D1)                                  | Logical                                                                                          | Continues outside component; same-profile calls join; different profiles independent                                                            |
| R — SQL lazy columns (`relationColumns`)                                                                    | Profile/relation pending key; completion captures generation                                                                                                                                        | Reject unusable/replaced generation; profile-explicit column writes                                        | Logical                                                                                          | Shared promise survives; no per-tab pending state. Generation omitted from joining key is a coverage gap                                        |
| L — Loki labels/values (`lokiMetadata`, `useLokiLabelsResource`, Builder callers)                           | Low-level profile/range/selector/label promise key; higher resource includes generation/tab/semantic range, request counter and refresh revision                                                    | Explicit cache invalidation; resource request/effect guards                                                | Logical                                                                                          | Resource can be reused; low-level cache survives. Rejection cleanup lacks identity check (D2)                                                   |
| T — Tempo attributes/values (`tempoMetadata`, `TraceExplorer`)                                              | Profile/generation/attribute/TraceQL promise keys; consumer effect `current` flag                                                                                                                   | Explicit cache invalidation; effect dependency cleanup                                                     | Logical                                                                                          | Cached work survives; obsolete consumer success/error/finally ignored; D2 on same-key replacement                                               |
| P — Prometheus labels/values (`prometheusMetadata`, Builder consumers)                                      | Profile/metric/label/generation cache key; consumer connection/context guards                                                                                                                       | Generation-key separation; cache reset; rejected entry eviction                                            | Logical                                                                                          | Cache survives; consumer effects control presentation. Reset/rejection overlap not newly reproduced                                             |
| D — Tempo trace detail (`useTempoTraceOpenController`)                                                      | Local request revision plus captured tab/profile/generation and active-tab check                                                                                                                    | New detail request; reset currently clears display but not request revision (D3)                           | Logical, incomplete at reset/unmount                                                             | Detail is intentionally transient, but same-tab unmount does not revoke callbacks (D3)                                                          |
| A — Tempo cohort/service map (`useTraceCohortAnalysis`)                                                     | Local run generation, tab/profile/generation, selected trace scope; compact summary cache                                                                                                           | Scope/context changes, explicit stop/reset/new run, unmount                                                | Logical; four bounded workers stop publication/dispatch as guards allow; issued queries continue | No durable pending token; matching cached summaries support interval widening; missing details require explicit analysis                        |
| I — SQL query/Builder AI proposals (`useAiQueryCopilot`, `useAiBuilderCopilot`, workflows)                  | Local flight object/UUID and captured tab/profile/query or Builder snapshot; review has separate snapshot/stale flag                                                                                | Store subscription marks pending/review stale; identity/mounted checks; explicit cancel; Apply revalidates | Existing AI cancel IPC when sent; stale marking alone need not abort provider work               | Unmount clears flight and requests cancellation; no proposal restoration/automatic execution                                                    |
| F — Fix with AI (`useAiQueryRepair`)                                                                        | Local flight/UUID and failed query/error/tab/profile snapshot                                                                                                                                       | Failure/editor changes cancel; one bounded context expansion; Apply verifies current failure               | Existing AI cancel IPC when sent                                                                 | Unmount ends flight; explicit Apply only; no automatic Run                                                                                      |
| N — Explain AI (`useAiPlanAnalysis`)                                                                        | Local flight/UUID and exact plan tree/query/mode/timings/tab                                                                                                                                        | Store subscription cancels when captured plan differs; explicit cancel                                     | Existing AI cancel IPC                                                                           | Unmount ends flight; transient hints never own Explain's pending slot                                                                           |
| X — chart anomaly and copy/PNG export hooks                                                                 | Component context/request identity; existing memoized owner callback, result and chart revision/options                                                                                             | Layout cleanup on context replacement/unmount; request identity; export mutual exclusion                   | Anomaly uses AI cancel IPC; export only logical suppression                                      | Findings/export feedback do not survive ownership removal; old platform completion cannot clear new loading                                     |
| U — remote formatting and AI settings reads                                                                 | Component action/effect; PromQL captures tab + original SQL, Loki raw formatter captures original SQL; generated Loki formatter has revision/mounted guard; settings reads have effect-active guard | Caller-specific guards, not query operations                                                               | No cancellation exposed for formatter/settings                                                   | Coverage of same-component context changes and overlapping settings events is incomplete; do not infer a confirmed defect from missing coverage |

### Completion, failure, tests and residual risk

| ID    | Completion and failure/loading authority                                                                                                                                     | Existing invariant coverage / remaining risk                                                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q/E/S | Store guarded `completeQuery` / `completeExplainOperation`; Tempo local progress additionally requires visibility/mount; current visible search failure retains partial rows | `querySessions`, `queryLifecycle.audit`, `QueryEditor`, `BuilderPanel`, `LokiExplorer.ui`, `useTempoTraceSearchController`, persistence tests: ordering, reset/preset/close/rebind/generation, concurrent slots/profiles, pending-return, stale progress/defaults. No new primary defect reproduced |
| V     | Local trend/error/warning state; no primary pending cleanup; primary-failure suppression                                                                                     | Loki deferred primary/remount/volume/probe tests retained. Reloading transient secondary work is justified                                                                                                                                                                                          |
| C/H   | Profile connection/error state via scoped `applyConnectionFailure`; metadata through explicit profile `setMetadata`; main SessionManager alone closes sessions               | `tabConnection`, `connectionLifecycle.audit`, `useStore.reconnect`, Sidebar hydration/connection kinds, `db.session-manager`, adapter lifecycle reuse tests. Cross-flow lazy failure before explicit success remains historically inferred, not newly verified                                      |
| M     | Refresh writes profile metadata/revision; failure retains loaded schemas and records refresh error; finally deletes profile registry entry                                   | `metadataRefresh` existing stale success/error, dedupe and retry tests. D1 reproduced; no claim that existing generation checks allow stale schemas                                                                                                                                                 |
| R     | `setRelationColumns` writes only explicit profile; stale success/error returns undefined; finally removes pending key                                                        | `relationColumns` tests protect profile delivery/retry/stale generation. Same-profile reconnect or refreshed relation while pending needs generation/revision-join coverage                                                                                                                         |
| L/T/P | Cached promises resolve/reject; caller/resource owns visible loading/errors; failed cache entries should enable retry                                                        | Loki/Tempo cache tests and TraceExplorer metadata suites protect ordinary cache/isolation/retry. D2 reproduced in four operations; Prometheus reset-overlap remains a follow-up coverage question                                                                                                   |
| D     | Local spans/loading and external open/error/status callbacks                                                                                                                 | Existing invalid-ID/current-error/reset-completed/background-tab tests do not cover abandonment in same tab. Added normal out-of-order success/failure preserves newer loading; D3 expected-failure tests cover reset and unmount                                                                   |
| A     | Bounded workers publish summaries/progress, failures yield partial/error; stop retains compact current summaries                                                             | `useTraceCohortAnalysis` tests protect scope/generation/stop/cache/retry. Not interchangeable with durable search; no newly reproduced defect                                                                                                                                                       |
| I/F/N | Local busy/error/review/findings; UUID+flight/context checks; main `AiService` uses webContents-owner/UUID AbortController and identity-safe cleanup                         | `Ai.test`, Explain pane and main AI suites protect context changes, cancel, retry, explicit Apply, limits and owner isolation. Query/Builder stale marking versus catch/error and retained callbacks deserves focused future coverage; not declared fixed or proven incorrect here                  |
| X     | Hooks own analysis/export state and only-current cleanup/feedback; readiness controller owns finished chart                                                                  | Direct `useChartAnomalyAnalysis`/`useChartExport` deferred tests plus Generic Result Explorer integration/AI tests already cover old success/failure/finally, owner/context/revision and unmount. Preserve them unchanged                                                                           |
| U     | Formatter local state/notifications; settings effect owns configuration eligibility                                                                                          | Existing formatting/AI UI tests; delayed failure, unmount and overlapping settings reads are not comprehensively inventoried as regressions. Lower-risk coverage follow-up, no framework justification                                                                                              |

## Confirmed defects and deterministic evidence

These tests first ran as ordinary desired-invariant tests against unchanged
production code: **8 failed, 23 passed** across the four affected files. Two additional ordinary passing ordering tests
bring the final focused selection to 25 ordinary passes and eight expected failures.
The committed reproductions use **`it.fails`**, not skips or passing acceptance:
Vitest requires each desired invariant still to fail. An unexpected pass fails
CI so the narrow fix must convert the case to an ordinary regression. Green audit
CI means the defect is reproducible, **not repaired**. No arbitrary sleeps are used.

### D1 — refresh joins obsolete generation (medium)

`metadataRefresh.ts` checks `inFlight.get(profileId)` before reading current
connection/generation. Start refresh A at generation 7, replace A with connected
8 while its refresh awaits, request refresh again, then settle old work. The
second call joins obsolete work: **one refresh call instead of two**, and old
completion is correctly discarded, leaving the caller without a generation-8
refresh. Existing tests only exercise stale publication after generation change.

Reproduction: `metadataRefresh.test.tsx`, “starts fresh metadata work for a
replacement generation while old refresh is pending.” The fixture changes the
store generation directly to control ordering; it does not claim every reconnect
UI sequence necessarily exposes this schedule.

Follow-up: scope the existing registry entry by generation, permit fresh current
work, and make final removal conditional on exact entry identity. Test old
success/error/final cleanup while the replacement remains pending and independent
profile B. Do not let the old stage dispatch new discovery after invalidation.
Inspect `relationColumns` for the same **joining** contract in that focused fix;
its present publication checks are useful but not proof of correct coalescing.

### D2 — invalidated cache rejection deletes replacement (low/medium)

In `lokiMetadata.ts` labels/values and `tempoMetadata.ts` attributes/values, rejection
unconditionally deletes by key. Start request 1, invalidate that profile cache,
start/resolve request 2 for the same key, then reject request 1. A third read
starts **a third backend call instead of reusing request 2**. This proves cache
ownership loss and redundant work, not a stale-result overwrite or wrong-profile
schema commit. It also applies while request 2 is pending.

Reproductions: two parameterized expected failures in each of
`lokiMetadata.ui.test.tsx` and `tempoMetadata.test.tsx`. Explicit invalidation is a
real exported refresh path. Keys/normalization are intentionally provider-specific.

Follow-up: delete only when the cache still contains this exact promise, directly
in those four catch handlers. Test pending and resolved replacement plus independent
profiles and ordinary failure/retry. No helper is needed for a one-line identity
comparison. Loki's low-level omission of generation is a separate coverage question;
this audit does not assert it causes stale values after every reconnect.

### D3 — Tempo detail is not invalidated by reset/unmount (medium)

`resetTrace()` clears spans/loading but never advances `requestRevision`.
`isVisibleRequest()` checks tab/profile/generation, but not mounted lifetime.
With a detail pending, reset without launching replacement work, then resolve it:
obsolete spans return. Reject instead: the obsolete error callback executes.
Unmount while the same originating tab stays active, then resolve: its external
`onTraceOpened` callback still executes. Merely switching to another tab masks
this missing boundary in the existing background-detail regression.

Reproductions: three expected failures in `useTempoTraceOpenController.test.tsx`.
`TraceExplorer` calls `resetTrace` on context reset and search start, so primary
search ownership does not invalidate this local detail flight. The same-tab
unmount fixture tests the hook contract, not a claim of wrong-tab publication.

Follow-up: invalidate the existing revision on reset and unmount, include mounted
lifetime and committed owner context, and reject retained actions after removal.
Test detail replacement ordering, reset/search/preset, same-tab removal/remount,
rebind-away/back and generation change; ensure discarded completion cannot leave
visible detail loading stuck. Keep details transient and outside primary slots.

### D3 correction — Phase 3C

The targeted correction advances the local detail revision on `resetTrace()` and
mounted-effect cleanup. A mounted-lifetime guard rejects retained `openTrace`
actions before validation, callbacks or backend dispatch and gates completion.
The captured session `queryContextId` additionally rejects replacement/rebind
away and back even when tab, profile and generation match again. Existing
profile/generation and active-tab guards remain in place. Reset clears local
loading/spans immediately; obsolete `finally` cannot clear replacement loading.
Render timing is abandoned with its owner, and status notification rechecks
ownership after the opened callback.

The three D3 expected failures are now ordinary passing regressions. Deferred
fixtures additionally cover reset/replacement success and failure while newer
loading is active, explicit recovery, same-tab unmount/remount, retained valid
and invalid actions after removal, profile/generation/context replacement and
rebind away/back. Both original out-of-order cases remain unchanged.
`TraceExplorer` already resets details on new search, preset/transient reset and
workspace context change; no caller migration is required. Primary searches,
results/persistence, sampling, cohort/map analysis, span filters, waterfall,
IPC and error wording are unchanged. This is logical invalidation only: issued
backend requests continue. D1/D2 remain separate unresolved metadata fixes.
Manual release acceptance remains pending under #382 RC-16.

## Duplication versus justified differences

| Candidate                                        | Actual callers / duplication                                                                                                                             | Decision and complexity/dependency impact                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another request ID/last-wins primitive           | Primary SQL/Prometheus/Loki/Tempo and Explain already use store `QueryOperation`                                                                         | Skip. Existing helper covers durable ownership; a second registry broadens dependencies and creates two authorities                                                                                                                                                                                              |
| Shared metadata coalescer                        | Manual refresh, lazy columns and provider caches all use maps, but differ in loaded-value retention, generation, semantic keys, normalization and errors | Narrow existing modules. D1 needs generation identity; D2 needs promise ownership. Direct checks are simpler than callbacks/options for each contract. QueryOperation cannot be reused because metadata is profile/resource-owned and must not set tab running                                                   |
| Shared transient flight runner                   | Query proposals, repair, plan, anomaly and export repeat IDs/refs and mounted checks                                                                     | Leave separate. Proposal can show stale review for explicit Apply; repair cancels on failed-query change; plan uses exact tree; anomaly preserves presentation changes; export has readiness/native feedback and mutual exclusion. A generic runner would obscure invalidation policy, not eliminate domain work |
| Shared connection success pipeline               | Explicit connect awaits discovery; lazy connect detaches it; hydration does not initiate connection                                                      | Existing normalized metadata loader, usable-generation predicate and scoped failure action already share genuine invariants. More sharing requires policy switches and couples main/session ownership to renderer intent                                                                                         |
| Remove Loki secondary guards                     | Trend revision + primary token + mounted/visibility guard appear repetitive                                                                              | Keep: primary token establishes data lineage, revision supersedes optional trend, mount/visibility owns local publication. None alone implements all three                                                                                                                                                       |
| Use primary query token for trace details/cohort | Both call `api.query.run`, as does durable search                                                                                                        | Reject: details/cohort are independent resource work, cannot supersede search or aggregate its busy slot. D3 can be fixed with its existing local revision                                                                                                                                                       |
| Reuse `SeriesCardinalityProbeGuard` everywhere   | Existing guard is Builder candidate/fingerprint approval                                                                                                 | Leave for Phase 4B. Not an export/AI/profile lifetime helper; sharing would remove meaningful domain ownership                                                                                                                                                                                                   |

## Missing coverage and risk-ordered next steps

1. **Tempo D3:** fix local abandonment first; it resurrects obsolete data/errors.
   Convert its three expected failures, add pending reset/replacement and remount
   tests, and preserve the two new passing out-of-order detail cases.
2. **Metadata D1:** fix current-generation eligibility and old-entry cleanup;
   add lazy-column reconnect/refresh overlap reproduction before expanding scope.
3. **Cache D2:** four identity-safe deletions, no shared framework; convert four
   expected failures. Verify pending replacement ordering, not just resolved cache.
4. **Coverage only, not confirmed release defects:** cross-flow connection intent
   before generation advance, hydration/canonical-ID list ordering, relation metadata
   revision replacement, Loki low-level generation boundaries, AI stale catches/
   settings ordering and retained actions, formatter pending context changes.
   Reproduce practical user paths before assigning fixes or abstracting them.
5. Review integrated CI/manual evidence, then advance to Phase 4. Physical datasource
   cancellation remains **#32**. Logical suppression cannot bound provider cost or
   stop already-issued database/CLI work.

## Main-process cancellation boundary

`DataSourceSession` declares optional `cancel(queryId)`, but current adapters do
not provide a renderer-wired query cancellation implementation. PostgreSQL supports
pending **connection** cancellation; SessionManager closes superseded sessions.
BigQuery creates jobs and reads results without a per-request cancel path; local
DuckDB/SQLite read-only execution has no new cancel IPC; Prometheus/Loki/Tempo use
gcx transports. CLI timeout (30 seconds in `gcx-command`) is not user cancellation
or renderer supersession. Tempo progress IDs route batches; abandoning the renderer
owner does not cancel progressive server work. AI is different: `AiService` scopes
AbortControllers by webContents owner and UUID, passes signal to OpenRouter and
races abort. Provider-side cessation/cost savings are not guaranteed.

## Validation and release scenarios

Exact local commands/results and current-head CI are recorded in the draft PR.
Existing #384/#386 query and #392/#394 anomaly/export regressions remain untouched.
All newly confirmed defects are **unfixed** in this audit; expected-failure counts
must be reported separately from ordinary passes. Runtime/provider tests unavailable
locally must not be reported as passed.

Use #382 RC-01/02 and RC-07–16 once for durable queries, reconnect, optional trends
and search; RC-05B/C already cover anomaly/export. Additional **pending** extensions:

- **RC-10 metadata extension:** with controlled delay, refresh profile A, reconnect
  A, request refresh again before old work settles; current-generation discovery
  must execute and recover, without changing B. Exercise retry/columns alongside
  metadata refresh. This specifically exercises D1 beyond existing query delivery.
- **RC-16 detail extension:** open a slow trace, start a new search/reset before
  its detail completes; allow old detail success and failure. No obsolete spans,
  callback-driven view switch or error may reappear. Repeat same-tab workspace
  removal/return if available. The new search/detail retry stays usable.
- D2's exact cache-rejection schedule belongs to deterministic automation; do not
  demand a duplicate live manual stress test. Ordinary refreshed label discovery
  and retry can be covered during RC-11/16.

Record frozen candidate SHA, provider, exact actions and evidence; use controlled
read-only latency/faults, never production load to force races. **No manual
acceptance is passed by this PR.** #365 Phase 3A remains subject to review; this
PR does not check off 3B/3C, close the roadmap or publish the release.
