# Query lifecycle audit — #371

Slice 1 below is the historical audit. The implemented Slice 2 contract and
remaining work are recorded at the end of this document.

Baseline: `04bfae2`, latest `main` at checkout. This slice changes tests and this
report only. It does not change connection policies, query transformations,
workspace mounting, retries, or production lifecycle code.

## Evidence and boundaries

**Verified** below means inspected authoritative code; **reproduced** additionally
means a deferred-promise test exercises the real renderer execution and store.
Transport calls and CodeMirror/chart rendering are mocked, not ownership logic.
Provider processes, network cancellation and live Electron behavior remain manual
verification. A provider promise still running is not proof of observable delivery.

`App.tsx` keys its `main` shell by `activeTabId`: switching tabs unmounts and
remounts QueryEditor, SQL BuilderPanel, LokiExplorer or TraceExplorer. QueryTabs
switches the active ID directly. It reads only `tab.running` for the indicator and
close confirmation. Closing stops waiting; it does not invoke backend cancellation.
The tests use a keyed editor/workspace or explicitly unmount hooks to reproduce
this actual boundary. Older tests that merely change activeTabId are retained but
are insufficient to prove remount safety.

Shared store actions are `startQuery`, `completeQuery`, `setResult`, `setRunning`
and `patchSession`; result transitions live in `lib/queryResultLifecycle.ts`.
Explicit tab patches cannot recreate missing sessions. These actions do **not**
validate operation identity themselves. Callers own validity checks.
`isTabConnectionCurrent` validates session existence, profile binding and, when
provided, usable profile status and generation. It does not require the tab to be
active. This is distinct from #370's per-profile connection establishment intents
and promises; preserve that separation and #343's profile-scoped state.

## Operation matrix

Paths are relative to `src/renderer/src` unless main/preload is named. In the guard
column, **T/P/G** means captured tab, profile, usable connection generation;
**R** means a component-local request revision. No operation below has a renderer
query-cancel IPC. Ignoring stale responses is abandonment, not cancellation.

| Datasource / operation                    | Entry and backend path                                                                                                                                              | Pending / tab indicator                                             | Switching tabs and success/failure ownership                                                                                  | Close / rebind / generation                                                                                                | Supersession / overlap                                                                                                                                      | Scope                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| PostgreSQL Run (raw)                      | `QueryEditor.run` → `api.query.run` → preload `QUERY_RUN` → main handler → `db.runQuery` → `postgres-adapter` / `postgres.ts`                                       | session `startQuery` / **yes**                                      | promise survives unmount; success/error to captured tab (reproduced)                                                          | T/P/G rejects obsolete delivery; close cannot resurrect; bind clears running; generation-only change can leave running set | per-tab R latest-wins within one editor instance; R does not survive remount                                                                                | top-level                                                     |
| BigQuery Run (raw)                        | same editor/IPC → `BigQuerySession.query` / `executeQuery`, creates job and awaits results/metadata                                                                 | same / **yes**                                                      | same renderer behavior, reproduced per kind                                                                                   | same                                                                                                                       | same; provider jobs not canceled by tab close                                                                                                               | top-level; script phases are backend query work               |
| DuckDB Run (local-files)                  | same editor/IPC → `local-files-adapter.query`, read-only validation + `boundedUserQuery`                                                                            | same / **yes**                                                      | same, reproduced per kind                                                                                                     | same                                                                                                                       | same; actual native concurrency not tested here                                                                                                             | top-level                                                     |
| SQLite Run (sqlite-file)                  | same editor/IPC → `sqlite-file-adapter.query`, DuckDB SQLite extension + `boundedQuery`                                                                             | same / **yes**                                                      | same, reproduced per kind                                                                                                     | same                                                                                                                       | same; actual native concurrency not tested here                                                                                                             | top-level                                                     |
| SQL Builder Run (all four SQL kinds)      | `components/builder/sql/BuilderPanel.run` → same query IPC and adapters                                                                                             | `startQuery` / **yes**                                              | captured tab delivery with T/P/G + per-tab R; inspected; separate builder remount concurrency reproduction still needed       | same predicate and session patches; generation-only abandonment not implemented                                            | separate component-local `queryRevisions`; no shared identity with raw editor                                                                               | top-level; cardinality probes / metadata are secondary        |
| PostgreSQL Explain / Analyze              | `QueryEditor.explain` → `api.query.explain` → `QUERY_EXPLAIN` → `db.explainQuery` → adapter Explain                                                                 | session `activeExplainRequest` / **no**                             | captures tab/profile/G; result/error can reach background tab after unmount (success reproduced for both modes)               | delivery T/P/G; unconditional final `setActiveExplainRequest(null, tab)` lacks operation/profile guard                     | UI blocks second Explain while pending; rebind/reset can clear the flag and permit newer work, with old cleanup still unguarded (inspected, not reproduced) | user-initiated top-level                                      |
| Other six kinds Explain / Analyze         | `DATA_SOURCE_CAPABILITIES` in `shared/types.ts`; no adapter Explain                                                                                                 | unavailable                                                         | not applicable                                                                                                                | not applicable                                                                                                             | not applicable; typing EXPLAIN in SQL Run remains ordinary Run                                                                                              | not a separate operation                                      |
| Prometheus raw and builder Run            | `QueryEditor.run`, builder supplies generated PromQL and range/step; `PromqlBuilderPanel` does not own execution → `db.runQuery` → `prometheus-adapter` → transport | shared `startQuery` / **yes**                                       | captured-tab result/error survives unmount (raw reproduced; existing builder-run tests cover generated execution)             | T/P/G; same generation-only stuck state                                                                                    | same component-local R; remount supersession defect reproduced                                                                                              | top-level; label discovery/formatting secondary               |
| Loki logs Run                             | `LokiExplorer.run` / `executeExpression` → `api.query.runLoki` → `QUERY_RUN_LOKI` → `db.runLokiQuery` → `loki-adapter` → `GcxLokiTransport.query`                   | local `loading`; **never calls startQuery** / **no**                | unmount `deactivate` increments R; old completion rejected, A loses result/error; backend invoke is not canceled (reproduced) | primary T/P/G rejects obsolete delivery; no resurrection (reproduced)                                                      | local single R latest-wins while mounted; tab-ID layout effect and unmount invalidate it                                                                    | top-level                                                     |
| Loki metric expression Run                | same primary path, `logqlResultKind` selects metrics                                                                                                                | same / **no**                                                       | same unmount invalidation                                                                                                     | same                                                                                                                       | same                                                                                                                                                        | top-level; no synthetic volume needed                         |
| Loki log-volume / trends                  | `loadTrend`, invoked alongside log Run in chart view or later by chart/range/group selection; optional cardinality probe → synthetic `runLoki` metric query         | local trend/error/cache/revision; **no** shared busy                | requires current R + mounted + active tab; lost on switch; completed trend is not stored in session                           | no T/P/G check in `loadTrend`; ownership predicate differs from primary query                                              | independent `trendRevision`; probe dependent on trend; primary completion does not wait for trend                                                           | optional secondary branch                                     |
| Loki patterns                             | `LogPatternExplorer` over fetched logs; `viewPatternLogs` promotes safe builder predicate into `executeExpression`, otherwise local member filter                   | local derivation / no busy; promoted execution inherits primary gap | local pattern selection resets with result/unmount; promoted backend request follows primary lifecycle                        | same for promoted run; local view has no pending provider query                                                            | no additional query identity for local clustering                                                                                                           | secondary view; promotion is new top-level Run                |
| Tempo search                              | `TraceExplorer` calls `useTempoTraceSearchController.runSearch`; shared Run IPC → `tempo-adapter` → transport (sample or progressive search)                        | session `startQuery` + local searching/progress / **yes**           | final success/error reaches captured A even after unmount (reproduced); progressive rows only update visible hook             | T/P/G rejects stale delivery (reproduced); generation-only replacement can stick running                                   | per-tab R in hook; does not survive remount (reproduced)                                                                                                    | top-level; transport search phases belong to it               |
| Tempo trace details                       | `useTempoTraceOpenController.openTrace` → shared Run IPC, canonical trace ID and lookup context                                                                     | local `traceLoading` / **no**                                       | result/error requires visible owning tab; background result is ignored; no persistent spans delivery (reproduced)             | T/P/G + local R + active tab                                                                                               | single local latest-wins R; `resetTrace` does not increment it (inspected)                                                                                  | secondary drill-down; direct ID lookup policy discussed below |
| Tempo cohort / service map and attributes | `useTraceCohortAnalysis`, attribute resource hooks from TraceExplorer; query/details/metadata APIs                                                                  | local resources / no shared busy                                    | separate resource semantics, not top-level search ownership                                                                   | resource-specific guards; not comprehensively reproduced here                                                              | independent work, not a search supersession token                                                                                                           | secondary analysis / metadata                                 |

`api.ts` normalizes transport errors, not lifecycle ownership. Preload's Tempo
progress request ID routes messages to the matching subscription and removes the
listener in `finally`; it is not a renderer session operation token. Main query
handlers resolve the session at invocation; `db.runQuery` / `runLokiQuery` do not
carry a renderer tab or generation. Main transport success alone cannot enforce
renderer freshness. BigQuery's job ID is likewise not a tab lifecycle token.

## Verified behavior and confirmed defects

### Safe baseline (reproduced)

- All four SQL kinds and Prometheus raw Run: A's indicator survives workspace
  remount, success/failure updates A only, A/B finish independently in reverse
  order, close cannot recreate A, rebind and generation changes reject old data.
- Tempo search has the same successful background final-delivery behavior. A/B
  requests complete independently, and close/rebind/generation reject old data.
- PostgreSQL Explain/Analyze success targets A after unmount and clears its local
  session phase flag; it never sets tab.running.
- Tempo trace details do not write into B, do not call the background callback,
  and do not mark top-level search busy. Existing controller tests cover visible
  failure cleanup and retaining previous spans after failure.
- Persistence restoration clears running, pendingResult and activeExplainRequest,
  even when runtime fields are injected into stored drafts. This is shared across
  profile references for all seven kinds; it does not execute requests. Existing
  persistence tests cover serialization/restoration; the added test makes the
  pending-state invariant explicit.

### Defects with executable expected failures

Use Vitest `it.fails` / `it.fails.each`, not skipped tests or assertions blessing
current defects. Each case settles its deferred requests before the invariant
assertions. A repair must remove `.fails` and pass the normal expectations.

| Defect                                | Exact scenario / expected result                                                                                                                                   | Regression and follow-up                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Loki indicator absent                 | Start primary logs or metrics Run in A; while API promise pending, A.running must be true                                                                          | `LokiExplorer.ui.test.tsx`, `#371 Loki lifecycle audit`: two expected failures; next Loki slice calls shared start                            |
| Loki background delivery lost         | Start in A, keyed switch to B, resolve or reject; A must receive result/error, B stays unchanged                                                                   | same suite: four expected failures; remove primary dependence on component revision invalidation                                              |
| SQL / Prometheus remount supersession | Start old Run in A, switch B then A (new editor), keyboard starts new Run; settle old success/rejection first; A must remain pending without obsolete result/error | `QueryEditor.test.tsx`, five per-kind groups: ten expected failures; session-owned identity across mounts                                     |
| SQL / Prometheus stale pending        | Replace only the owning profile's generation while Run pending, complete stale promise; A must not retain false running                                            | same groups: five expected failures; guarded abandonment on replacement                                                                       |
| Tempo remount supersession            | Pending old A search, replace hook, start newer A search; old success/error must not clear newer pending state or write data/error                                 | `useTempoTraceSearchController.test.tsx`: two expected failures; same session identity contract                                               |
| Tempo stale pending                   | Replace generation, complete old search; no stale result and no stuck indicator                                                                                    | same suite: one expected failure; guarded abandonment                                                                                         |
| Explain indicator absent              | Start Explain or Analyze; A.running must represent pending user work                                                                                               | `QueryEditor.test.tsx`, PostgreSQL Explain lifecycle: two expected failures; track Explain as top-level operation without conflating phase UI |

Total: **26 expected failures**. A diagnostic run temporarily removed `.fails`
and confirmed all 26 fail at their intended lifecycle assertions, with the other
153 cases passing; the committed expected-failure declarations were restored. These are deliberate audit debt, not passing
production behavior. Generation replacement tests directly change the authoritative
connection state to isolate the completion guard. Ordinary failed/disconnected
connection events already clear running only for tabs on that profile via
`applyConnectionEvent`; that does not establish cleanup for every generation
replacement. Do not describe a provider reconnect as universally broken.

### Inspected risks / untested assumptions

- Revisions protect same-instance overlap but not cross-instance work; SQL Builder
  has the same structure, but no new builder concurrency test is claimed here.
- Prometheus writes visualization defaults **before** its guarded final delivery;
  stale result rejection does not necessarily prevent a visualization patch.
- Explain's unconditional final cleanup could clear a newer Explain after rebind;
  needs a deferred rebind/new-Explain case in the follow-up, including rejection.
- Reset/preset/rebind-back-to-the-same-profile within the same generation are not
  identified by T/P/G alone; a binding/session epoch or token invalidation is needed.
- Tempo partial rows are hook-local. Visible failures retain partial rows, but
  switching away loses those rows if the search later fails; session stores error
  and previous final result. No promise of persisted partial search rows is made.
- Loki trends lack primary generation guards; their state is local and not tested
  for reconnect-in-place here. Existing trend tests cover early primary delivery,
  failure retry, view changes and no repeated fetch loop.
- Native DuckDB/SQLite execution contention, provider job concurrency, hard
  transport termination on session close and real Electron subscription teardown
  are not proven by mocked renderer transports. Keep existing adapter/transport
  tests; use live smoke checks for runtime behavior.

## Cancellation and failure semantics

There is no query `cancel` method in preload's query API and no query cancel IPC
handler. `ai.cancel` cancels AI requests only. Closing tabs, changing active tabs,
revision invalidation and stale-generation checks do not cancel SQL, PromQL,
LogQL or TraceQL backend requests. PostgreSQL configures statement/query timeouts;
`gcx-command.ts` bounds subprocess calls to 30 seconds. Those are backend failure
bounds, not user-request cancellation. BigQuery jobs are awaited without a tab
close cancellation call. Do not add fake cancellation tests for a nonexistent API.

Supported renderer abandonment is exercised with close/rebind and obsolete
responses; visible API rejection exercises pending cleanup for Run/search/details.
A failed/disconnected event clears session running and marks results stale only
on the owning profile. Existing `useStore.reconnect.test.tsx` covers profile
independence. A dedicated query-in-flight test below supplements this guarantee.

Loki primary logs/metrics success uses `completeQuery`; failure keeps the prior
successful result and records queryError. Chart volume is launched independently
and must not delay primary completion. The cardinality probe belongs to that
optional trend branch; soft-limit warnings and hard-limit/probe/volume errors are
trend-local. A primary failure invalidates/hides its trend when visible. Preserve
these partial-result/failure semantics: raw logs stay usable after trend failure,
and a successful optional trend cannot masquerade as a failed primary query.
Patterns over loaded logs are local; safe builder promotion is a fresh Run.

## Minimal shared contract (proposal, not implemented here)

Use the existing QuerySession as the durable renderer owner and keep tab.running
as the tab-bar presentation. Add only a runtime operation identity needed by
matching top-level lifecycle responsibilities; do not add a global coordinator,
a per-provider status mirror, or a query-language abstraction.

1. **Start:** capture tab/session ID, connectionProfileId, usable generation and
   an opaque unique operation token. Allocate that token in the session, not in a
   mounted controller ref. Begin top-level busy state when accepted execution
   starts; if connection establishment is awaited first, revalidate the original
   binding before beginning. This avoids token reuse when controllers remount.
2. **Current:** all result, error, visualization and final cleanup patches require
   the same existing session, binding, generation and operation token. Never use
   completion-time activeTabId for session ownership. Visibility checks remain
   valid only for local UI effects.
3. **Complete:** atomically verify token and apply result/error + clear that token's
   pending state. Retain existing last-successful-result/error semantics. An old
   success, rejection or finally cannot complete or clear a newer operation.
4. **Switch:** leave valid work and token intact; no auto retry, cancellation or
   requirement to keep workspaces mounted. Closures can complete via store actions
   after unmount. Remounted UI reads the session's authoritative pending state.
5. **Close/rebind/reset/preset:** discard or invalidate tokens at the actual
   session transition. Missing session means no-op; no resurrection. Invalidate
   on binding changes even if the user later rebinds to the same profile/G.
6. **Connection replacement:** invalidate only tokens tied to that profile's old
   generation and release their pending state. Do not change reconnect policy or
   other profiles. Late rejected work must not clear a newer token. Failed or
   disconnected event cleanup stays profile-scoped.
7. **Reload:** exclude operation identities/progress/pending state from drafts;
   parser/hydration clears all unobservable pending work. Never rerun automatically.
8. **Overlap:** prefer latest-wins for operations replacing the same primary
   result (SQL/Prometheus Run and Tempo search, Loki primary). Explain is a distinct
   output slot: either explicitly disallow concurrent Run/Explain, or keep the
   small set of currently pending top-level tokens and derive running from it.
   Do not allow one result-slot completion to clear another slot's pending state.
   Preserve existing concurrency unless an intentional restriction is reviewed.
9. **Secondary work:** metadata, formatting, probes, optional volume, cohort
   analysis and trace drill-down have their own resource state; they do not
   automatically extend tab.running. A direct trace ID action can be classified
   as top-level if its UX is treated as a search, but that requires an explicit
   product decision and durable output; current detail loading is secondary.

A small store-local begin/current/complete/abandon helper is warranted for primary
Run/search ownership, with provider calls and transformations remaining in their
own execution functions. Reuse `patchSession`, `startQueryState`,
`completeQueryState`, profile-generation predicates and current session fields.
Do not reuse #370 connection intents as query identities. Do not make a universal
helper for visible-only trace details, local patterns or optional trend cache
coordination until their semantics match.

## Coverage limits and validation

New deferred tests cover real QueryEditor/store behavior for all SQL kinds and
Prometheus; keyed Loki primary delivery; unmounted Tempo search controllers;
Explain phase behavior; detail visibility; and restoration sanitization. Existing
builder, trend, reconnect, store and result lifecycle suites remain intact.

Remaining seams needed: SQL Builder remount overlap; Explain rebind/new-operation
cleanup; stale Prometheus visualization writes; optional Loki trends after reconnect. No source-text assertion is offered as proof.
The QueryEditor groups also exercise independent profile failure and
same-controller supersession. Live provider cancellation is unavailable, not silently skipped.

Validation commands/results are recorded in the draft PR. Full `pnpm verify`
requires smoke scripts with macOS Electron executable paths and a PostgreSQL
service; this Linux environment cannot provide those required runtime checks.
Run portable tests, typecheck, lint and format here; CI/live manual tests must
supply the remaining runtime evidence before release. No production helper changes
are introduced, so duplication measurements cannot establish a reduction yet.

## Recommended next slice: Loki parity with durable primary ownership

Root cause: `executeExpression` sets local loading but never starts shared
pending state; `deactivate` / the session-change layout effect invalidate
component-local primary revisions, so valid backend completion cannot reach A.
`loadTrend` is intentionally independent and must not become primary busy work.

Change `LokiExplorer.executeExpression`, `deactivate`, the session layout effect
and the store/session lifecycle actions to introduce the smallest durable primary
operation token. Reuse shared start/complete state and T/P/G checks. Remove local
primary loading/revision authority only where the session replaces it; retain
mounted/visibility guards for local transient UI and optional trends. Ensure
background primary failure is recoverable from session queryError on return.
Keep loadTrend's optional behavior and primary-failure suppression, with explicit
primary-token/profile/G checks for its publication where necessary.

Convert the six Loki expected failures to ordinary passing tests. Extend the
same keyed harness for logs **and metrics**, two deferred A/B requests finishing
in reverse order, old success/rejection after same-tab supersession, and secondary
volume/probe success/failure when primary completes first. Add generation/rebind
and cleanup assertions for the new token; preserve existing pattern promotion and
trend partial-results tests.

Then migrate the confirmed SQL/Prometheus/Tempo request-identity and generation
abandonment gaps using the same narrow store contract, and address Explain pending
aggregation separately if concurrency demands it. Convert their expected failures
to normal tests and add the outstanding builder/Explain/visualization cases above.
This can be two implementation PRs or one small shared-contract PR plus Loki if
review scope stays clear; the evidence does not mandate three implementation PRs.

## Slice 2 — implemented Loki primary ownership

Based on `d04eb414` after #383. Loki primary logs and metrics now capture a
`QueryOperation` containing originating tab, profile, generation and unique
runtime token in `QuerySession.queryOperation`. `beginQueryOperation` validates
the binding and usable connection before calling existing `startQuery`.
`completeQuery` accepts an optional operation and atomically guards its result,
error and pending cleanup through `isQueryOperationCurrent` and `patchSession`.
Legacy callers remain unchanged for the next slice.

The token survives workspace unmount and stays as the completed primary identity
so optional volume publication can still identify its originating work. It does
not itself mean pending: session `running` remains authoritative. A newer start
replaces the token; closing removes the session; rebind, clear/reset and preset
transitions discard ownership. A small store subscription invalidates owned
operations whenever their binding or usable generation disappears, covering
connection events, explicit reconnect and direct restoration writes. It releases
only those sessions' running/pending state and leaves legacy execution unchanged.
This is response abandonment, not backend cancellation.

Loki no longer has a local primary loading flag or request revision/finally
cleanup. Its Run presentation reads session running, and transport errors read
session queryError on remount. Local validation errors remain local. Selection
reset keys use resultRevision. Mounted/active checks remain for local effects;
switching does not invalidate primary delivery or keep workspaces mounted.

Optional trends retain independent revisions, cache, retry and visible-workspace
semantics. Publication and probe continuation validate the captured primary token,
profile and generation, and reject failed primary ownership. Restored historical
results without tokens use captured result/binding/generation checks. Primary
completion never waits for volume/probes; primary failure hides volume. Connection
changes clear local trend state. LogQL, ranges, transformations and charts are
unchanged.

Workspace serialization already explicitly selects durable fields and parsing
constructs clean runtime state; tokens are excluded without a new draft schema.
Restoration regression now injects a token and verifies it is discarded with busy,
pending result and Explain state, without rerunning work.

All six Loki expected failures are ordinary regressions. Deferred keyed-workspace
coverage adds logs/metrics reverse-order A/B completion, pending return, background
failure display, remounted supersession with success/rejection, rebind-back at the
same generation, reset/preset invalidation, generation isolation across profiles,
and optional volume/probe interactions. Existing pattern promotion, cache/retry,
early logs and trend-failure cases remain intact.

Remaining audit debt: **20 expected failures** across SQL/Prometheus (15 ownership/
generation plus 2 Explain indicator cases) and Tempo (3). No other execution path
is migrated, and Explain concurrency is unchanged. The next slice should reuse
the primary contract while adding SQL Builder, stale Prometheus visualization,
and Explain overlap coverage. Live provider/Electron behavior still requires
release verification; optional trends remain local and may reload on return.

Release checklist:

- Run background Loki logs and metrics in A/B; return while A is pending and
  finish B before A. Check each indicator, result and stored failure belongs to
  its originating tab.
- Supersede A after switching away/back; late old success/error must leave the
  newer busy state and result intact.
- Close, reset, load a preset, rebind away/back and reconnect during A's request;
  verify obsolete delivery is ignored and unrelated profiles stay usable.
- Use chart/grouped trends: logs become usable before volume/probe completion;
  trend failure retains logs and primary failure never displays optional volume.
- Reload while pending; no busy state or automatic query execution survives.

## Slice 3 — shared primary and Explain ownership

Based on `1a07839` after #384. The matrix above records the historical audit;
this section supersedes its SQL/Prometheus/Tempo and Explain defect entries.
All **20 remaining expected failures** are now ordinary passing regressions.
No expected failure is deferred from this slice.

### Final contract and overlap policy

`QueryOperation` still captures tab, profile, generation and a unique runtime
token. Its optional `slot` defaults to primary for existing Loki attachments.
`queryOperation` owns the primary result; `explainOperation` independently owns
the plan. `pendingQueryOperations` contains only pending tokens, and tab
`running` reflects whether any remain. Completion removes only its own token.
Completed primary ownership remains valid for Loki volume publication. Pending
state and ownership are deliberately separate: a retained token is not a spinner.

| Operation                                                           | Ownership / pending / completion                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL raw and Builder, all four SQL kinds                             | Shared primary slot, latest-wins across component remounts and raw/Builder transitions; guarded originating-session result/error delivery                   |
| Prometheus raw and Builder                                          | Same primary slot; visualization defaults publish only after the operation guard                                                                            |
| Loki logs and metrics                                               | Existing primary ownership and independent optional trends preserved                                                                                        |
| Tempo search                                                        | Same primary slot; progressive callbacks additionally require a mounted, visible owner; remount reads session pending state and adopts final results/errors |
| PostgreSQL Explain/Analyze                                          | Independent Explain slot; phase UI remains `activeExplainRequest`; guarded result, snapshot, error and final cleanup                                        |
| Metadata, optional volume/probes, trace details and cohort analysis | Existing local resource policies; no top-level pending token added                                                                                          |

Run and Explain may overlap, retaining the existing supported execution policy.
Finishing either leaves the other pending. Workspace Run controls read primary
pending state independently of Explain; the tab bar aggregates both. A second
Explain remains blocked by the phase UI. Reset/rebinding may release that phase
and allow newer work; late old success, error or final cleanup cannot change it.

SQL connection awaits capture the original profile, runtime query context and
initial usable generation, then revalidate them before allocating primary work.
The context changes on reset, clear, preset loading and rebinding, including an
away/back transition with the same profile/generation. Explain allocates an
operation synchronously when the connection is already usable, preserving its
immediate phase presentation; after any connection await it validates that owner
before invoking the provider. Newly established connections still run on demand.
No reconnect policy, query retry or cancellation IPC is introduced.

The existing store subscription now invalidates each obsolete output slot and
releases only its pending token. Generation replacement, connection failure,
close and binding transitions cannot clear other profiles or newer operations.
Draft serialization remains allow-listed. Restoration creates a fresh runtime
context and drops operation ownership, pending tokens, phases and result state;
it never re-executes unobservable requests.

### Simplification and evidence

Removed QueryEditor's `runRevisions`, SQL Builder's `queryRevisions`, Tempo's
`requestRevisions` and its local `searching` boolean/finally authority. Session
ownership replaces those maps and their duplicated completion predicates.
Datasource execution APIs, SQL parameters, PromQL defaults and result transforms
remain in their existing paths. Tempo retains local partial rows/notices/progress;
a failed visible search keeps partial rows, while remount does not promise durable
partial progress. Final session errors are available to the returned workspace.

Added deferred regressions for SQL Builder remount and both raw/Builder transition
directions, all SQL kinds; Run/Explain overlap in both completion orders; obsolete
Explain success/rejection after reset/rebind/generation/failure; stale Prometheus
visualization; Tempo stale progress and pending-return presentation/final delivery;
preflight connection-await invalidation; and newer executions following
reset/clear/preset/rebind-back/generation changes. A shared-store two-profile,
two-slot regression verifies selective abandonment and late cleanup. Restoration
coverage injects both slots and pending tokens and verifies sanitization.
Existing Loki pending-remount volume, optional trend independence, retry, patterns
and primary-failure suppression coverage remains intact.

### Acceptance and release handoff

The renderer implementation and automated ownership criteria of #371 are covered.
The issue remains open: review, applicable CI/documentation/visual preview and the
live manual release scenarios in #382 are still required. Native concurrency,
provider errors and real Electron behavior are not established by mocked renderer
transports. Backend cancellation remains unavailable. Tempo trace drill-down and
persistent partial results remain outside this slice.

Run #382 RC-01/RC-02 and RC-07–RC-12 once, then the deduplicated Slice 3 extensions:
SQL Builder/remount/transitions, Explain overlap and old cleanup, stale Prometheus
visualization, Tempo progress/loading/failure on return. All manual results remain
pending. Use safe read-only fixtures and controlled latency; record unavailable
provider scenarios as untested, never passed.
