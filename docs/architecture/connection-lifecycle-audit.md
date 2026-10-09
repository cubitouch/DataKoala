# Connection lifecycle audit — #370, Slice 1

Baseline: `e2154e7` (latest main after #343 / #369). This slice changes tests
and documentation only. Issue #370 remains open; Slice 2 is not implemented.

## Entry points and ownership

The store is authoritative through `connectionStateByProfileId`. Similar IPC
calls do not imply interchangeable entry points.

- `connectProfile`: called by `activateTab`, forced reconnect, and Sidebar's
  explicit recovery after failed hydration. Non-forced calls bind the tab active
  **at invocation**; forced calls do not bind a tab.
- `ensureConnectionForTab`: Sidebar selection/retry/metadata actions,
  QueryEditor Run/Explain, SQL Builder execution/discovery/filter actions, and
  Tempo search. It captures the requested tab's profile before awaiting.
  `connectForTab` is private and does not receive a tab ID: it connects a profile.
  Its interruption check consults the initially active tab, which need not be
  the requested tab. Callers retain responsibility for asynchronous tab ownership.
- `reconnectActiveProfile(profileId)`: ResultExplorer and Loki error controls
  explicitly pass the owning profile. Despite its name, this does not select the
  currently active profile. It guards connecting/reconnecting, writes reconnecting,
  then calls `connectProfile` with `force: true`.
- `applyConnectionEvent`: Sidebar's subscription forwards main-process events;
  it does not initiate connections. Generation checks are scoped to event.profileId.
- `isTabConnectionCurrent`: QueryEditor, SQL Builder, Tempo search/open/cohort
  controllers validate captured tab/profile/generation before completing work.
  A background tab can still be current; active-tab equality is not required.
- Provider metadata uses profile-scoped caches. Prometheus metadata callbacks
  use `isProfileConnectionCurrent`; top-level discovery is already normalized by
  the shared `loadConnectionMetadata`. Manual refresh uses `refreshConnectionMetadata`.

## Lifecycle map

| Step                   | Explicit `connectProfile`                                                                                                           | Lazy `connectForTab` / `ensureConnectionForTab`                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Start                  | Allocates per-profile renderer intent; captures starting generation                                                                 | Captures requested tab profile; checks live/pending/missing state; records profile promise |
| Target                 | Binds active tab at start unless forced                                                                                             | Does not rebind on completion except canonical-ID remapping                                |
| API                    | `connections.connect` or forced `connections.reconnect`                                                                             | `connections.connect`                                                                      |
| Initial status         | connecting/reconnecting; preserves current generation, clears error/version                                                         | connecting; preserves current generation, clears error/version                             |
| Accept success         | Intent must match; reject response older than actual profile generation                                                             | Reject response older than actual profile generation; return newer ID if still usable      |
| Reject failure         | Intent must match; ignore if generation advanced or status is connected                                                             | Ignore if generation advanced or status is connected                                       |
| Superseded success     | Mismatched intent disconnects returned ID **with returned generation**; lower-generation result with current intent is just ignored | Lower-generation result is ignored without disconnect                                      |
| Metadata               | Writes loading, awaits normalized discovery, validates intent + generation + connected/idle                                         | Writes loading, detaches discovery, validates generation + connected/idle                  |
| Failure representation | Returned error and exception each write scoped error with retained generation and null version                                      | Same two scoped error branches; returns null                                               |
| Completion/cleanup     | Promise completes after metadata; intent entry remains as latest token                                                              | Promise completes before metadata; `finally` removes only its own in-flight entry          |

Both successes update only the actual profile's connection/metadata entries.
If IPC returns a canonical ID, both remap **all tabs bound to the requested ID**.
Explicit profile-list refresh is awaited; lazy refresh is detached. Neither normal
connection path disconnects unrelated live profiles.

## Concurrency protections are distinct

1. Renderer `connectionIntents` orders explicit attempts to a given profile before
   there is a new generation. Other profiles have independent latest tokens. It
   also suppresses metadata callbacks from superseded explicit attempts.
2. Lazy `inFlight` tracks a promise per profile, but the connecting/reconnecting
   check occurs **before** lookup. An ordinary second lazy caller returns null,
   rather than awaiting the pending promise. Changing this ordering changes behavior.
   The entry is removed after the connection response, not after metadata finishes.
3. Generation checks reject older responses/events and metadata; they do not identify
   request order while both attempts still have the same starting generation.
   `isCurrentProfileConnectionEvent` accepts equal generation events and compares
   only against that profile. `isTabConnectionCurrent` additionally checks the
   captured session's profile, and optionally connected/idle generation validity.
4. IPC handlers in `src/main/index.ts` resolve saved profiles/secrets and return
   canonical IDs. `SessionManager` in `src/main/db.ts` reuses an already-live result,
   tracks separate per-profile intents/pending adapter work, closes superseded
   successful sessions, and removes pending records in `finally`. Reconnect closes
   only the requested session. Generation-scoped disconnect leaves replacements
   untouched and does not cancel pending attempts (unscoped disconnect can cancel).
5. PostgreSQL adapter pooling also has intent and pool-generation safeguards;
   state events carry the owning profile/generation. Main-process replacement
   protection does not replace renderer ownership or metadata validation.
6. Metadata refresh has its own profile promise map, keeps usable previous schemas
   on failure, invalidates Loki/Tempo caches on success, and increments revision.
   It is not equivalent to initial connection metadata loading. Sidebar hydration
   and retry discovery also validate profile generation and usable status.

## Duplication inventory and proposed Slice 2 boundary

| Operation                            | Explicit implementation                            | Lazy implementation                             | Identical? / proposed boundary                                                                     | Risk                                                                                                      |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Guarded failure transition           | Returned failure + outer catch                     | Returned failure + catch                        | Yes for reachable state; one small store action accepting profile ID, starting generation, message | Explicit intent rejection must stay outside; preserve connected-only status guard and retained generation |
| Success connection/loading writes    | Scoped connected entry + metadata loading + remap  | Same writes                                     | Similar, but leave separate in first extraction                                                    | Actual-ID mapping, profile-list timing, return values and intent cleanup differ                           |
| Metadata generation/status predicate | Two branches after intent check                    | Two detached callbacks                          | Same predicate; optionally move a pure predicate into existing connectionLifecycle module          | Do not import tabConnection into store just to reuse its store-reading helper; keep explicit intent check |
| Metadata fetch/normalization         | `loadConnectionMetadata`                           | `loadConnectionMetadata`                        | Already shared; no new loader needed                                                               | Awaited vs detached completion must remain                                                                |
| Attempt coordination                 | Explicit intent tokens                             | Status guards + inFlight                        | No; keep separate                                                                                  | Neither generations nor promise deduplication substitutes for intents                                     |
| Stale successful cleanup             | Generation-scoped disconnect for mismatched intent | No disconnect on older response                 | No; keep separate                                                                                  | Same live generation can be reused by different calls                                                     |
| Selection/reconnect/confirmation     | Invocation-time binding; force avoids binding      | Caller binding; active-query interruption check | No; keep separate                                                                                  | Background query/tab ownership and reconnect policy                                                       |

**Smallest worthwhile extraction:** centralize the four guarded failure updates
in an existing-store action, keeping intent checks and API orchestration in their
entry points. The starting state falls back to generation zero in both flows;
inside lazy failure writes the fallback is startingGeneration, which is equivalent
while its guard permits the write. Confirm this equivalence in Slice 2 rather than
introducing an option to preserve unreachable differences. A separate pure
metadata validity predicate is optional only if it reduces code without new
coordination or a circular store import.

Do not build a lifecycle runner, shared promise registry, ConnectionManager,
option-heavy connector, or a shared awaited metadata pipeline. Keep event,
restoration, refresh, and tab-selection policy separate.

### Confirmed findings from the final follow-up

#### Same-generation cleanup: confirmed unsafe at the store/API boundary

`SessionManager.connect()` checks its live-session map before allocating a new
main-process intent. Reuse returns the **same successful result object**, with the
same generation, and does not call the adapter again. The real connect IPC handler
only adds the saved/canonical profile ID; it does not turn reuse into ownership of
a fresh session. `SessionManager.disconnect(id, generation)` closes the current
session when the generation equals the supplied value. That is correct for a
requested disconnect, but does not establish that a renderer attempt owns it.

`src/main/adapters/connection-lifecycle-reuse.vitest.ts` bridges the actual renderer
`connectProfile` to the actual SessionManager using a fake provider session. Only
IPC delivery and metadata are mocked; reuse, renderer intents, cleanup and the
manager's session map execute their production implementations. No live database
or Electron transport is required. The test seeds one live generation 7, starts
two explicit renderer attempts, and verifies both main responses are that same
result object. Each of the following schedules reproduces the defect:

| Delivery schedule                   | State before stale cleanup                          | Observed result                                                        |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Newer response, then older response | Newer renderer attempt is connected at generation 7 | Older cleanup closes the retained main session                         |
| Older response, then newer response | Newer attempt is still connecting at generation 7   | Older cleanup closes the session before the newer response is accepted |

In both schedules the adapter connects once, `disconnect('same', 7)` executes
once, the provider closes once, `manager.get('same')` becomes undefined and
`listLive()` becomes empty. With the fake BigQuery-style session (no emitted
connection event), the renderer ends at connected/generation 7 even though its
session is gone. PostgreSQL disconnect events can change the renderer's visible
state; they do not prevent the session from being closed.

This is **confirmed**, not just an inferred generation-counter limitation. The
public store action permits overlapping explicit calls. Sidebar and reconnect UI
status guards reduce ordinary double-click exposure; this reproduction does not
claim a specific normal UI click sequence bypasses those guards. The API itself
provides no exclusivity guarantee, so consolidation must not assume one.

The two committed tests are passing **characterization** cases of current unsafe
behavior, not safety claims or intentionally failing tests. Slice 2 must replace
their final absence/close assertions with preservation assertions after the fix.

**Smallest correction for Slice 2:** remove the renderer-issued disconnect from
`connectProfile`'s superseded-intent branch, retaining the intent rejection/return.
Main-process SessionManager already owns stale adapter-session cleanup and forced
replacement. Keep that cleanup there. Do not introduce a shared intent registry,
reuse flag, or ConnectionManager. Preserve canonical-ID handling and per-profile
isolation. Update the existing distinct-generation renderer cleanup expectation
rather than deleting that test, and retain main-process replacement/closure tests.
A check that only skips cleanup for an already-connected matching generation is
insufficient: the older-first schedule still has a newer request pending, and a
first accepted main session may not yet have reached renderer state at all.

#### Background lazy confirmation: confirmed wrong prompt/cancellation, no B mutation

`ensureConnectionForTab(tabA)` captures A's profile, but `connectForTab` obtains
its previous profile from `initial.activeTabId`. With B active and running on a
different live profile, it asks whether to stop B before connecting A. The added
renderer tests cover declined, accepted and `confirmInterrupt: false` outcomes:

- Decline: A returns null before any connect/status write; A stays disconnected.
  This unnecessarily blocks A's work because of unrelated B's query.
- Accept: the API receives A's profile and A connects. B's tab, running flag,
  connection and metadata remain unchanged; no disconnect occurs. The warning's
  claim that B will be stopped is inaccurate for this path.
- Opt out: A connects without the warning, with the same B-preservation result.

The defect is confirmed for the exported helper's background-tab invocation.
Current Run/Explain/Builder callbacks generally capture their rendered tab and
enter ensureConnectionForTab synchronously, so merely switching tabs _after_ a
request starts does not cause this prompt. Existing deferred-completion tests
cover that different, safe case. This follow-up does not assert that an ordinary
foreground click routinely triggers the background-start scenario.

**Smallest correction for Slice 2:** keep actual connection-switch confirmation
at the selection/binding caller (Sidebar already checks before bindTabConnection),
and remove the active-tab switch-confirmation lookup from the lazy reuse/connect
path. That path does not rebind the requesting tab: desiredProfileId comes from
that same tab synchronously. Mechanically replacing activeTabId with requesting
Tab A would make previousProfileId equal desiredProfileId, so there is no genuine
switch to confirm there. Preserve the Sidebar's real switch/interruption policy,
background tab ownership and scoped result checks. Remove any now-unused private
confirmation code/options only in that small correction; no new interruption policy
or generic operation coordinator is needed. This audit PR keeps existing behavior.

### Minimal Slice 2 plan and extraction prerequisites

1. Fix the confirmed stale-success ownership error by leaving session cleanup in
   SessionManager; turn both characterization schedules into preservation tests.
2. Correct the background-tab confirmation source without changing real explicit
   selection confirmation. Turn decline/accept characterization into no-unrelated-
   prompt checks; retain opt-out/call-site coverage as applicable.
3. Only then extract the four guarded failure writes into one small store action,
   keeping explicit intent checks outside it and the existing generation/status
   predicate unchanged. A pure metadata-validity predicate is optional; the fetch
   and normalization are already shared. Leave success orchestration, awaited vs
   detached metadata completion, refresh, hydration and tab binding separate.
4. Rerun main ownership/reuse/replacement and renderer concurrency/tab/metadata
   suites; compare production LOC and branches against the unchanged baseline.

The failure transition and metadata validity predicate are genuinely identical
local invariants; cleanup and confirmation are **not** safe shared policies as
currently written. The confirmed defects must be corrected before extracting any
shared success/cleanup or interruption orchestration. Mechanical failure extraction
would not fix them; do not package it as complete lifecycle safety.

Remaining **inferred/unreproduced** risk: an older lazy failure before newer
explicit success may still write error while no generation has advanced, because
lazy work does not participate in explicit intents. The existing tests establish
failure rejection after newer success and explicit pre-generation ordering, not
unified cross-flow intent protection. Do not add global coordination in this slice.
Late listLive data and canonical-ID edge cases also remain outside this extraction;
no new defect in those paths is claimed here.

## Reproducible baseline

Production code is unchanged in this PR. Counts include comments and type
interfaces; nonblank LOC excludes blank lines only. AST branches count `if`,
conditional expressions, and `catch` clauses (not boolean operators or optional
chaining). These are repeatable source metrics, not cyclomatic complexity.

| Renderer module            | Physical LOC | Nonblank LOC | AST branches | Slice 1 delta |
| -------------------------- | -----------: | -----------: | -----------: | ------------: |
| store/useStore.ts          |         1292 |         1264 |           84 |             0 |
| lib/tabConnection.ts       |          326 |          312 |           26 |             0 |
| lib/connectionLifecycle.ts |           10 |            9 |            0 |             0 |
| lib/connectionMetadata.ts  |           10 |            9 |            0 |             0 |
| lib/metadataRefresh.ts     |          112 |          109 |            8 |             0 |
| Total                      |         1750 |         1703 |          118 |             0 |

Focused function counts: connectProfile 143 LOC / 21 branches; connectForTab
161 LOC / 15 branches; ensureConnectionForTab 34 / 6; reconnectActiveProfile
27 / 2; applyConnectionEvent 50 / 6. Store function counts use the implementation
property, excluding the AppState interface and call-site shorthand properties.

Run this from repository root at the baseline and again at the Slice 2 head:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import ts from 'typescript';
for (const path of ['store/useStore.ts', 'lib/tabConnection.ts',
  'lib/connectionLifecycle.ts', 'lib/connectionMetadata.ts', 'lib/metadataRefresh.ts']) {
  const text = fs.readFileSync('src/renderer/src/' + path, 'utf8');
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let branches = 0;
  function walk(n) {
    if (ts.isIfStatement(n) || ts.isConditionalExpression(n) || ts.isCatchClause(n)) branches++;
    ts.forEachChild(n, walk);
  }
  walk(tree);
  const lines = text.trimEnd().split('\n');
  console.log(path, lines.length, lines.filter(l => l.trim()).length, branches);
}
JS
pnpm report:duplication
```

Manual semantic baseline for the two connection flows: **four paired operation
families**, with **12 implementation sites**: attempt-start transition (2),
accepted-success/loading transition (2), guarded connection failure (4), and
metadata completion validity check (4). These are logical maintenance sites,
not byte-identical jscpd clones. Event application is a third, policy-distinct
connection transition implementation; forced reconnect's pre-write is additional.
The four failure sites are the primary Slice 2 reduction target (4 → 1).

jscpd baseline: 264 sources, 54,925 analyzed lines, 44 clones, 821 duplicated lines
(1.49%). Relevant reported clones are the returned/thrown failure branches
inside tabConnection (15 lines) and useStore (14 lines). A further 25-line clone
between useStore/workspacePersistence is outside this audit. jscpd does not
identify the cross-file lifecycle semantics above; do not use its percentage as
proof that the flows can be merged. Test files are excluded by existing config.

## Coverage inventory and validation

Before changes, the selected eight UI suites passed **108 tests**, the main
SessionManager suite passed **7 tests**. Existing coverage includes:

| Invariant                  | Existing coverage retained                                                                                                                          | Missing coverage added                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-profile overlap       | tabConnection: older lazy returned failure after explicit success                                                                                   | Older lazy exception; older lazy success; older explicit success/failure after lazy recovery; explicit pre-generation intent ordering; generation-scoped explicit cleanup |
| Main-process cleanup       | SessionManager: pending disconnect, reuse, profile independence, forced replacement                                                                 | Superseded adapter success closes only old session; stale generation disconnect preserves replacement and other profile                                                   |
| Multi-profile independence | useStore.reconnect: background reconnect and equal-generation events                                                                                | B reuse, metadata and session remain intact through A failure/reconnect at equal generations                                                                              |
| Tab ownership              | QueryEditor: actual deferred query completes on A after switching to B; querySessions scoped patches; tabConnection predicate                       | Deferred connection completion through explicit and lazy entry points after switching tabs                                                                                |
| Restoration                | Sidebar.connectionKinds: listLive reuse without reconnect, pending hydration, unavailable/rejected lookup, explicit recovery; App.prometheusRestore | Direct lazy gate for missing state (without fixture implicitly manufacturing connected state)                                                                             |
| Metadata                   | metadataRefresh: stale success, retained metadata, refresh deduplication and recovery                                                               | Initial explicit/lazy stale success AND error; manual refresh stale error                                                                                                 |
| Pending/liveness           | reconnect tests: duplicate reconnect and Idle usability; ConnectionStatus tests                                                                     | Lazy pending returns null, then failure clears inFlight and retry connects                                                                                                |

The new fixtures assign tab profiles and connection statuses separately; the
existing patchActiveTestSession helper is not rewritten. No test is removed.
New coverage adds 16 UI cases, one additional refresh case and two main cases.
The original selected UI set passed 125 tests across nine suites; main passed 9 tests.
The final follow-up adds three background-confirmation UI cases and two integrated
SessionManager/renderer characterization cases. All original coverage is retained.
Run the integration cases with `pnpm exec vitest run --config vitest.renderer.config.ts
src/main/adapters/connection-lifecycle-reuse.vitest.ts` and the confirmation cases
with `pnpm exec vitest run --config vitest.ui.config.ts
src/renderer/src/lib/connectionLifecycle.audit.test.tsx`.

Validation commands and final results are recorded in the PR description.
Full local verification requiring macOS Electron paths/PostgreSQL is not portable
in this Linux workspace; CI and manual provider smoke checks remain the appropriate
place for those runtime checks. Manual follow-up: two live profiles, tab switching
while querying/connecting, renderer reload, failed-profile recovery, and representative
PostgreSQL/Prometheus/Loki/Tempo operations. Do not merge automatically.
