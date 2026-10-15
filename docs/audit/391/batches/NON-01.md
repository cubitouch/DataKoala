# NON-01 — Connection and query lifecycle races

## A. Metadata

- Parent: [#391](https://github.com/cubitouch/DataKoala/issues/391); integration: [#406](https://github.com/cubitouch/DataKoala/pull/406).
- Inventory: **A04, A05, A07, A08, L25**; visual evidence is **N/A** for this scoped nonvisual contract (not a claim about visible connection-status states).
- Integration branch: `audit/391-ux-convergence`; **verified base SHA**: `369061f0641cd3ae86c79e9c85998dcef97c8412`.
- Isolated branch: `audit/391-non-01-lifecycle`; temporary draft PR: recorded in the PR/handoff.
- Characterization test commits: `0f354a318359327f1efac3345d1075c5cb243dfc` (initial), `b5e37057d4ca7260131cda3edc85e3bff9d75351` (type correction), `5b7de28a05e699471d6ef56ffd82c576a422c341` and `1e1951e41f43e8b98f5ba5a3649781d58dd93435` (cross-flow expected-failure repros).
- Temporary draft PR: [#415](https://github.com/cubitouch/DataKoala/pull/415), targeting the integration branch.
- **CI-tested commit**: `bd4da52b80f65618a4908529ae4df91cc3b124e3` (test code at `1e1951e41f43e8b98f5ba5a3649781d58dd93435`).
- Final report commit SHA: Git commits cannot embed their own final SHA; recorded in PR/handoff.
- Scope: source and deterministic characterization only. No production code, audit register, feature inventory, other batch report, Electron harness/fixtures, workflows or shared test changed. No local linting or formatting.

## B. Coverage matrix

Evidence: `BV` is reserved for **executed** deterministic assertions, `SO` for source and inspected-but-not-executed tests, `UV` for unverified behavior. `N/A` visual reflects nonvisual scope only. CI status/provenance below govern upgrades.

| ID | Behavioral disposition at initial report commit | Visual | Implementation owner | Named evidence and boundary |
| --- | --- | --- | --- | --- |
| **A04 — Connect on demand** | **BV** scoped controlled activation/hydration, SO for unexecuted provider paths, UV live recovery | N/A | `useStore.activateTab`, `tabConnection.ensureConnectionForTab` / `connectForTab`, main `SessionManager` | New `NON-01.lifecycle`: first activation A finishing after B selected; hydration unknown-state exclusion. Existing `tabConnection.test` (live pool reuse, concurrent profile isolation); `connectionLifecycle.audit.test` (background tabs, connecting caller, retry). No packaged/live-provider proof. |
| **A05 — Disconnect/reconnect** | **BV** synthetic mid-query/drop/reconnect/retry; UV genuine provider teardown | N/A | Store `reconnectActiveProfile`/`connectProfile` and `applyConnectionEvent`; `api.connections`; main SessionManager | New: disconnect mid-query, old pending completion, retry after synthetic rejection, duplicate reconnect. Existing `useStore.reconnect.test.tsx` background completion, error and dedup. Provider shutdown/query transport cancellation UV. |
| **A07 — Failure recovery** | **BV** synthetic failure/retry and two reproduced expected failures; UV real auth/diagnostics | N/A | Shared store failure/status and metadata; provider adapters and main diagnostics | New: synthetic authentication-like failure followed by successful retry; old rejected generation cannot overwrite current. Existing connection lifecycle tests cover scoped errors and metadata failures. Genuine expired ADC/auth, PG socket recovery, real error text and UI announcement UV. |
| **A08 — Generation invalidation** | **BV** token/generation/preflight/rebind; UV packaged transport behavior | N/A | Store `QueryOperation`/subscription, `isQueryOperationCurrent`, `connectionLifecycle.isUsableProfileConnection`; `tabConnection` preflight | New: generation-4 old success/failure after generation-5 replacement, B remains pending, disconnect/remount context rebind, stale result/error rejected, new result authoritative. Existing `querySessions`, `connectionLifecycle.audit`, Loki tests. No physical query cancellation claim. |
| **L25 — Loki primary/optional lifecycle** | **BV** executed existing deferred Loki UI assertions; UV live Loki and physical cancellation | N/A | `LokiExplorer.executeExpression` and store primary token; local `loadTrend` revision/key/owner/visibility; Loki query transport | Existing `LokiExplorer.ui.test.tsx`: “keeps optional volume independent after primary %s” (success/failure/generation/supersede), “drops an obsolete cardinality probe before starting its volume request”, “generation replacement abandons A while another profile keeps B pending”, “loads first-query volume after returning pending and ignores the unmounted volume”; deliberately not duplicated in new file. Real Loki network cancellation and packaged remount UV. |

### Existing and new named assertions

New isolated `src/renderer/src/lib/NON-01.lifecycle.test.tsx` introduces **eight ordinary deterministic cases plus two explicitly expected-failing desired-invariant reproductions**:
1. Old generation A success **or** failure rejected after B stays pending and A generation 5 starts; late callback must not change loading, error or result.
2. Disconnect during a primary query retains a marked-stale result, rejects obsolete completion and accepts replacement generation.
3. Preflight pending across A→B→A rebind cannot start obsolete query (context ownership).
4. First activation of disconnected background A finishes without changing active B.
5. Simultaneous reconnect actions coalesce; a synthetic failure remains profile-scoped; retry succeeds.
6. A→B→A binding invalidates old token even with a still-usable original generation.
7. Unknown initial profile status blocks speculative connect until hydration establishes state.
8. **Two `it.fails` cases**: older lazy success or failure settles *before* a newer explicit connect returns its generation; desired invariant is newer attempt remains `connecting`. Current source allows the obsolete lazy result to temporarily publish `connected` or `error` under synthetic ordering. These are expected-failure defect reproductions, **not passing safety assertions**.

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

The new rows below were **executed by CI on `bd4da52`**. The cross-flow desired-invariant tests are explicitly **expected failures**: they do not validate the safe invariant and must be converted into ordinary regressions when remedied.

| Scenario | Initial → operation | Intervention → delayed completion | Expected invariant / assertion | Evidence |
| --- | --- | --- | --- | --- |
| A08 success | A gen 4 and B gen 4; primary A/B pending | A changes to gen 5; new primary A; old success returns | Neither A current result/loading nor pending B touched; fresh A completion accepted | `NON-01.lifecycle` stale success case |
| A08 failure | Same | Old promise rejects after A replacement/new primary | Old error cannot replace current message; B stays pending | Same test, failure case |
| A05 disconnect | A has retained result; primary pending | Connection event disconnected gen 4, obsolete completion; reconnect gen 5 | Old work revoked, retained result marked stale, new completion clears stale flag | `NON-01.lifecycle` disconnect mid-query |
| A04/A07 cross-flow | A gen 4 disconnected; lazy connect and newer explicit connect overlap | Old lazy success/failure settles before newer explicit generation 5 | Desired: newer `connecting` is authoritative; **observed** temporary old `connected`/`error`; newer eventual success restores current state | `NON-01.lifecycle` two **executed expected failures**, CI UI tests run 38763003457 |
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
- **CONFIRMED SYNTHETIC RENDERER RACE (NON01-06):** Earlier lazy success/failure can temporarily publish obsolete `connected`/`error` while a newer explicit connect is pending at the same generation. The lazy path has no explicit intent guard. Both desired-invariant `it.fails` repros executed as expected failures in CI run 38763003457. Final newer success restores correct state. **Real provider timing, transient UI effect, and any credential exposure are unverified.** No remediation in this audit.
- **UNVERIFIED:** Real auth/expired credentials, transport cancellation, underlying socket reconnect and concurrent profile deletion, profile canonical-ID remap/list ordering, packaged restoration and remount, error accessibility/notification, exact provider error-message sanitization.

## F. Atlas candidates (nonvisual — no screenshots)

| ID | Inventory IDs | Classification, impact and confidence | Observed source/test evidence | Owner / action |
| --- | --- | --- | --- | --- |
| **NON01-01** | A04, A05, A07 | ALREADY_CONVERGED shared profile lifecycle; medium importance; high source confidence (runtime pending CI) | `useStore.connectProfile/reconnectActiveProfile`, `tabConnection`, `connectionLifecycle.audit.test.tsx`, `useStore.reconnect.test.tsx` | Store/main SessionManager; preserve scoped generations |
| **NON01-02** | A05, A08 | ALREADY_CONVERGED query completion guards; high correctness importance; high source confidence (new runtime assertion pending CI) | `beginQueryOperation`, `completeQuery`, `isQueryOperationCurrent`, subscription, `NON-01.lifecycle.test.tsx` | Store and tab connection preflight; preserve token/context |
| **NON01-03** | L25, A08 | INTENTIONAL_DIFFERENCE in local optional trend vs durable primary; medium/high importance; high source confidence | `LokiExplorer.loadTrend`, named Loki deferred tests | Loki workspace; no generic unification |
| **NON01-04** | A04, A07 | UNVERIFIED: all callers' immediate feedback during an already-connecting lazy profile (source returns null); low/medium potential UX impact, low confidence of defect | `ensureConnectionForTab` current connecting shortcut and existing retry test | Tab preflight/UI; test real user action/feedback before recommending change |
| **NON01-06** | A04, A07, A08 | CONFIRMED SYNTHETIC RENDERER DEFECT (`it.fails` × 2 executed): older lazy completion temporarily overwrites newer explicit pending state before generation advances; medium potential correctness/feedback impact, high deterministic confidence, UV live provider impact | `connectForTab` and `connectProfile` guards; two `NON-01.lifecycle.test.tsx` expected-failure scenarios | `tabConnection`/store; future narrow intent coordination, not a general request framework |
| **NON01-05** | A07; cross-reference NON03-04 / C04 | DIAGNOSTIC INVESTIGATION LEAD, not proven credential leak; medium potential security impact / medium source confidence | PR #414 `docs/audit/391/batches/NON-03.md` NON03-04; `src/main/adapters/postgres.ts` `reasonOf` and `handleUnexpectedDisconnect` | PG main adapter; future synthetic-marker test and diagnostic policy review, distinct from lifecycle correctness |

## G. CI, commands and provenance

- **Frozen tested commit:** `bd4da52b80f65618a4908529ae4df91cc3b124e3`. Tests at `1e1951e41f43e8b98f5ba5a3649781d58dd93435`; report-only commits after that do not change execution code.
- **GitHub Actions CI run [38763003457](https://github.com/cubitouch/DataKoala/actions/runs/38763003457)**:
  - **UI tests: success**, 102 files / 989 ordinary passes / **6 expected failures**, including all 10 new NON-01 cases (eight ordinary passes, **two expected failures**). Executed `src/renderer/src/lib/NON-01.lifecycle.test.tsx`, the Loki deferred suite and existing connection/query UI suites.
  - **Unit tests: success**. Node test family: 481 passed, 5 skipped; renderer .test.ts files: 82 files / 644 passed; audit/install assertion tests: 20 passed; SQLite adapter integration: 1 passed.
  - **Production build: success**.
  - **Quality: failed at Prettier check**, so lint:ts, lint:css and typecheck did **not** execute in that job. Warned **owned files** `docs/audit/391/batches/NON-01.md` and `src/renderer/src/lib/NON-01.lifecycle.test.tsx`. Warned **inherited files** `docs/architecture/ux-convergence-coverage-register.md`, `docs/audit/391/batches/NON-02.md`, `docs/audit/391/batches/NON-03.md`, `src/main/adapters/non03-electron-encryption.vitest.ts`, `src/main/non03-credential-security.test.ts`, `src/renderer/src/lib/NON-02.persistence.test.tsx`. No formatting changes made here, as instructed.
  - macOS packaging/smoke and separate visual/docs jobs may finish independently; nonvisual NON-01 neither requires image artifacts nor claims their acceptance.
- These results come from GitHub Actions, **not** a locally executed focused command. The UI job executed every NON-01 test plus pre-existing Loki tests; no additional dedicated focused runner invocation was available.
- **Focused command for reproduction:** `pnpm exec vitest run --config vitest.ui.config.ts src/renderer/src/lib/NON-01.lifecycle.test.tsx src/renderer/src/lib/connectionLifecycle.audit.test.tsx src/renderer/src/lib/tabConnection.test.tsx src/renderer/src/store/useStore.reconnect.test.tsx src/renderer/src/components/workspaces/loki/LokiExplorer.ui.test.tsx`. Main-process session-manager runner: `node --experimental-strip-types --test src/main/db.session-manager.test.ts`. Note: file inclusion and CLI patterns are controlled by Vitest configuration; CI already executed the relevant test families across its unit/UI jobs.
- Local checkout was unavailable (`git ls-remote` failed DNS resolution); **no local lint, formatting or tests were run**. No external providers/credentials, Electron screenshot harness, or packaged runtime test was claimed as NON-01 acceptance.

## H. Completion disposition

**EVIDENCE_COMPLETE — narrowly scoped NON-01 characterization only.** All five IDs have independent dispositions, executed controlled evidence and source ownership. Two `it.fails` cases characterize a confirmed synthetic renderer race and emphatically **do not** certify the desired safe behavior. Real-provider recovery, packaged Electron, transport cancellation and PG diagnostic sanitization remain UV, outside the completed synthetic scope. **CI Quality remains red (formatting; two owned files plus six inherited files), and TypeScript lint/typecheck were not reached**, so this is **not a merge-ready CI certification**. The owner handles formatting separately.

**Do not merge:** integration owner reviews and consolidates into authoritative register. No edits to #406, other batches, shared harness, production UX, Phase 2 or final Atlas by NON-01.
