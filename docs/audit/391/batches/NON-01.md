# NON-01 — Connection and query lifecycle races

## A. Metadata

- Parent: [#391](https://github.com/cubitouch/DataKoala/issues/391); integration: [#406](https://github.com/cubitouch/DataKoala/pull/406).
- Inventory: **A04, A05, A07, A08, L25**; visual evidence is **N/A** for this scoped nonvisual contract (not a claim about visible connection-status states).
- Integration branch: `audit/391-ux-convergence`; **verified base SHA**: `369061f0641cd3ae86c79e9c85998dcef97c8412`.
- Isolated branch: `audit/391-non-01-lifecycle`; temporary draft PR: recorded in the PR/handoff.
- Characterization test commit: `0f354a318359327f1efac3345d1075c5cb243dfc` (new `src/renderer/src/lib/NON-01.lifecycle.test.tsx`).
- Final report commit SHA: Git commits cannot embed their own final SHA; recorded in PR/handoff.
- Scope: source and deterministic characterization only. No production code, audit register, feature inventory, other batch report, Electron harness/fixtures, workflows or shared test changed. No local linting or formatting.

## B. Coverage matrix

Evidence: `BV` is reserved for **executed** deterministic assertions, `SO` for source and inspected-but-not-executed tests, `UV` for unverified behavior. `N/A` visual reflects nonvisual scope only. CI status/provenance below govern upgrades.

| ID | Behavioral disposition at initial report commit | Visual | Implementation owner | Named evidence and boundary |
| --- | --- | --- | --- | --- |
| **A04 — Connect on demand** | **SO** until new CI executes; existing baseline tests inspected | N/A | `useStore.activateTab`, `tabConnection.ensureConnectionForTab` / `connectForTab`, main `SessionManager` | New `NON-01.lifecycle`: first activation A finishing after B selected; hydration unknown-state exclusion. Existing `tabConnection.test` (live pool reuse, concurrent profile isolation); `connectionLifecycle.audit.test` (background tabs, connecting caller, retry). No packaged/live-provider proof. |
| **A05 — Disconnect/reconnect** | **SO** pending CI | N/A | Store `reconnectActiveProfile`/`connectProfile` and `applyConnectionEvent`; `api.connections`; main SessionManager | New: disconnect mid-query, old pending completion, retry after synthetic rejection, duplicate reconnect. Existing `useStore.reconnect.test.tsx` background completion, error and dedup. Provider shutdown/query transport cancellation UV. |
| **A07 — Failure recovery** | **SO** pending CI | N/A | Shared store failure/status and metadata; provider adapters and main diagnostics | New: synthetic authentication-like failure followed by successful retry; old rejected generation cannot overwrite current. Existing connection lifecycle tests cover scoped errors and metadata failures. Genuine expired ADC/auth, PG socket recovery, real error text and UI announcement UV. |
| **A08 — Generation invalidation** | **SO** pending CI | N/A | Store `QueryOperation`/subscription, `isQueryOperationCurrent`, `connectionLifecycle.isUsableProfileConnection`; `tabConnection` preflight | New: generation-4 old success/failure after generation-5 replacement, B remains pending, disconnect/remount context rebind, stale result/error rejected, new result authoritative. Existing `querySessions`, `connectionLifecycle.audit`, Loki tests. No physical query cancellation claim. |
| **L25 — Loki primary/optional lifecycle** | **SO** until existing CI results verified | N/A | `LokiExplorer.executeExpression` and store primary token; local `loadTrend` revision/key/owner/visibility; Loki query transport | Existing `LokiExplorer.ui.test.tsx`: “keeps optional volume independent after primary %s” (success/failure/generation/supersede), “drops an obsolete cardinality probe before starting its volume request”, “generation replacement abandons A while another profile keeps B pending”, “loads first-query volume after returning pending and ignores the unmounted volume”; deliberately not duplicated in new file. Real Loki network cancellation and packaged remount UV. |

### Existing and new named assertions

New isolated `src/renderer/src/lib/NON-01.lifecycle.test.tsx` introduces eight deterministic cases (two variants in the stale-completion parameterized case):
1. Old generation A success **or** failure rejected after B stays pending and A generation 5 starts; late callback must not change loading, error or result.
2. Disconnect during a primary query retains a marked-stale result, rejects obsolete completion and accepts replacement generation.
3. Preflight pending across A→B→A rebind cannot start obsolete query (context ownership).
4. First activation of disconnected background A finishes without changing active B.
5. Simultaneous reconnect actions coalesce; a synthetic failure remains profile-scoped; retry succeeds.
6. A→B→A binding invalidates old token even with a still-usable original generation.
7. Unknown initial profile status blocks speculative connect until hydration establishes state.

Existing source-inspected suites: `src/renderer/src/store/useStore.reconnect.test.tsx`, `src/renderer/src/lib/connectionLifecycle.audit.test.tsx`, `src/renderer/src/lib/tabConnection.test.tsx`, `src/renderer/src/store/querySessions.test.tsx`, `src/renderer/src/components/workspaces/loki/LokiExplorer.ui.test.tsx`, `src/main/db.session-manager.test.ts`. These are **named source evidence**, not new executed test results until CI is checked.

## C. Lifecycle ownership map

| Operation | Authoritative owner | Identity/guard | Cleanup and intentional limits |
| --- | --- | --- | --- |
| Explicit connect/reconnect | `useStore.connectProfile` with per-profile `connectionIntents`; main SessionManager | Profile ID, renderer intent, session generation; main controls session replacement/closure | Older explicit completion ignored; shared metadata load guarded by generation and intent; not user-query cancellation. |
| Lazy connect | `tabConnection` module `inFlight` by profile; store scoped connection status | Tab's captured desired profile, connection generation, post-await tab `queryContextId` and binding | Connecting status returns null to an additional lazy caller (rather than await joining); failure can be retried. Missing state deliberately defers to hydration. |
| Tab binding/navigation | Store session per tab (`connectionProfileId`, `queryContextId`), `bindTabConnection`, `activateTab` | Per-tab ID, profile binding; query context rotates on rebind by store subscription | A→B→A invalidates prior operation even when profile/generation match. Background A may complete while B is selected. |
| Primary SQL/Prometheus/Loki queries | Store `QueryOperation` (`tabId`, `profileId`, `generation`, `token`, primary slot) | `isQueryOperationCurrent`, token + current usable generation + tab binding | `completeQuery` ignores obsolete completion; subscription clears invalid pending/running; no general query cancel IPC. |
| Explain | Independent `explainOperation` slot | Same identity checks plus slot-specific token | Stops only its own pending slot, not concurrent primary work. |
| Metadata and provider-specific resources | Per-profile store, `connectionMetadata`, `metadataRefresh`, provider caches | Generation/revision/intent guards; metadata refresh registry generation-aware after #395–#396 fixes | Does not imply network request abort; preserve distinct data-source cache/retry contracts. |
| Loki optional log volume/trend | `LokiExplorer.loadTrend`, component-local transient state | `trendRevision`, key (tab/profile/query/bounds/grouping), captured primary token or exact source-result fallback; mounted/active tab/generation | Late failure/success suppressed; old cardinality probe may not dispatch volume; trend can reload on remount. Never owns primary `running` or `result`. |
| Main provider transport | `SessionManager`, adapter session, provider APIs | Profile generation and adapter-specific connection/session lifecycle | Obsolete sessions closed; optional `cancelConnect` is **connection** cancellation. Rejected renderer publication does not prove cancellation of already-issued SQL, BigQuery or gcx work. |

## D. Race-condition matrix

All new rows below describe **assertions added**; do not interpret as executed until their test workflow result is verified.

| Scenario | Initial → operation | Intervention → delayed completion | Expected invariant / assertion | Evidence |
| --- | --- | --- | --- | --- |
| A08 success | A gen 4 and B gen 4; primary A/B pending | A changes to gen 5; new primary A; old success returns | Neither A current result/loading nor pending B touched; fresh A completion accepted | `NON-01.lifecycle` stale success case |
| A08 failure | Same | Old promise rejects after A replacement/new primary | Old error cannot replace current message; B stays pending | Same test, failure case |
| A05 disconnect | A has retained result; primary pending | Connection event disconnected gen 4, obsolete completion; reconnect gen 5 | Old work revoked, retained result marked stale, new completion clears stale flag | `NON-01.lifecycle` disconnect mid-query |
| A04/A08 preflight | A disconnected, connection await begins | Tab A→B→A before connect resolves successfully | No operation starts from outdated `queryContextId`; B intact | `NON-01.lifecycle` preflight case |
| A04 background activation | A disconnected; B live; A activates | Switch back to B, A lazy/explicit activation resolves | A is live, B still active and live; no global connection ownership | `NON-01.lifecycle` activation case |
| A05/A07 reconnect | A live gen 4; first reconnect pending | Duplicate reconnect; first rejects, retry succeeds gen 5 | One initial call; profile-scoped error; successful retry clears error; B unchanged | `NON-01.lifecycle` retry case |
| A08 rebind | Tab A primary token, gen 4 | A→B→A, obsolete result callback | Token invalid, no erroneous result or loading reset | `NON-01.lifecycle` rebind case |
| A04 hydration | Tab A bound but state missing | Attempt lazy connect before hydration | No adapter connect issued | `NON-01.lifecycle` hydration case |
| L25 optional | Loki primary pending with trend pending | Primary success/failure, gen replacement, supersede, tab remount, cardinality probe delay | Independent primary status; no obsolete trend into current chart; late probe does not spawn volume | Existing `LokiExplorer.ui.test.tsx` named tests above |

## E. Implementation convergence findings

- **ALREADY_CONVERGED:** Profile-scoped store and main-session generation; tab-scoped primary/Explain token ownership; release of old running/pending tokens; reuse of live profile across tabs. Preserve existing primary guards rather than adding generic cancellation manager.
- **INTENTIONAL_DIFFERENCE:** Lazy second caller returns null while connecting, unlike explicit reconnect's pending guard; rendered state awaits hydration. This is visible only as source/test behavior and is not by itself a confirmed defect.
- **INTENTIONAL_DIFFERENCE:** Loki optional trend and cardinality probe are local derived presentation work, with stronger visibility/mount/key guards. They must not take ownership of durable primary result/run state, and can be retried after remount.
- **INTENTIONAL_DIFFERENCE:** Provider adapter transport teardown and retry vary; logical supersession is not physical cancellation.
- **DUPLICATION/possible follow-up:** Explicit and lazy connect maintain related status, success/metadata pipelines but different intent, coalescing and UI binding semantics. Source-level similarity is **not** enough to unify them; only revisit with a separately demonstrated same-invariant defect.
- **CONFIRMED DEFECTS:** None newly established by NON-01 at report creation. This does not declare all provider races fixed.
- **UNVERIFIED:** Real auth/expired credentials, transport cancellation, underlying socket reconnect and concurrent profile deletion, profile canonical-ID remap/list ordering, packaged restoration and remount, error accessibility/notification, exact provider error-message sanitization.

## F. Atlas candidates (nonvisual — no screenshots)

| ID | Inventory IDs | Classification, impact and confidence | Observed source/test evidence | Owner / action |
| --- | --- | --- | --- | --- |
| **NON01-01** | A04, A05, A07 | ALREADY_CONVERGED shared profile lifecycle; medium importance; high source confidence (runtime pending CI) | `useStore.connectProfile/reconnectActiveProfile`, `tabConnection`, `connectionLifecycle.audit.test.tsx`, `useStore.reconnect.test.tsx` | Store/main SessionManager; preserve scoped generations |
| **NON01-02** | A05, A08 | ALREADY_CONVERGED query completion guards; high correctness importance; high source confidence (new runtime assertion pending CI) | `beginQueryOperation`, `completeQuery`, `isQueryOperationCurrent`, subscription, `NON-01.lifecycle.test.tsx` | Store and tab connection preflight; preserve token/context |
| **NON01-03** | L25, A08 | INTENTIONAL_DIFFERENCE in local optional trend vs durable primary; medium/high importance; high source confidence | `LokiExplorer.loadTrend`, named Loki deferred tests | Loki workspace; no generic unification |
| **NON01-04** | A04, A07 | UNVERIFIED: all callers' immediate feedback during an already-connecting lazy profile (source returns null); low/medium potential UX impact, low confidence of defect | `ensureConnectionForTab` current connecting shortcut and existing retry test | Tab preflight/UI; test real user action/feedback before recommending change |
| **NON01-05** | A07; cross-reference NON03-04 / C04 | DIAGNOSTIC INVESTIGATION LEAD, not proven credential leak; medium potential security impact / medium source confidence | PR #414 `docs/audit/391/batches/NON-03.md` NON03-04; `src/main/adapters/postgres.ts` `reasonOf` and `handleUnexpectedDisconnect` | PG main adapter; future synthetic-marker test and diagnostic policy review, distinct from lifecycle correctness |

## G. CI, commands and provenance

- This environment used the GitHub connection to inspect integration head, source, baseline tests, PR #414 and write only the isolated test/report. It has **no authenticated clone or installed repository/node_modules**; attempting `git ls-remote` from the container failed DNS lookup of `github.com`.
- New isolated test commit: `0f354a318359327f1efac3345d1075c5cb243dfc`.
- Recommended focused command on an accessible runner: `pnpm exec vitest run --config vitest.renderer.config.ts src/renderer/src/lib/NON-01.lifecycle.test.tsx src/renderer/src/lib/connectionLifecycle.audit.test.tsx src/renderer/src/lib/tabConnection.test.tsx src/renderer/src/store/useStore.reconnect.test.tsx src/renderer/src/components/workspaces/loki/LokiExplorer.ui.test.tsx`.
- Relevant main session manager: `node --experimental-strip-types --test src/main/db.session-manager.test.ts`.
- Workflow ID/result: **pending initial draft PR workflow inspection**. Never infer a pass from an existing test file; report ordinary passes and expected failures separately.
- No local lint, formatting, production build or Electron screenshots requested/executed. Format/typecheck failures, if any, must be attributed to changed lines before classifying as NON-01 regression.

## H. Completion disposition

**PARTIAL (at initial report commit)** pending executed focused test results and CI provenance. Source ownership and independent scenario dispositions exist for all five IDs; source-only provider/runtime limitations are explicit. If CI confirms all new and relevant existing assertions, the isolated scoped findings may be labeled `EVIDENCE_COMPLETE` **without** implying live-provider or packaged Electron acceptance. Otherwise retain PARTIAL and identify failing cases in final handoff.

**Do not merge:** integration owner reviews and consolidates into authoritative register. No edits to #406, other batches, shared harness, production UX, Phase 2 or final Atlas by NON-01.
