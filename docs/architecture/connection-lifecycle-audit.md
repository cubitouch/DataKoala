# Connection lifecycle audit — #370, Slices 1 and 2

Baseline: `e2154e7` (latest main after #343 / #369). Slice 1 at `0708a98`
contains the audit and reproductions. Slice 2 is stacked on that head: it corrects
two confirmed defects and selectively shares failure handling and metadata
validity. Issue #370 remains open; neither PR is merged.

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
  It no longer consults the active tab or prompts during lazy establishment.
  The caller that changes a tab's binding retains real switch confirmation;
  callers also retain responsibility for asynchronous tab ownership.
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

| Step                   | Explicit `connectProfile`                                                                      | Lazy `connectForTab` / `ensureConnectionForTab`                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Start                  | Allocates per-profile renderer intent; captures starting generation                            | Captures requested tab profile; checks live/pending/missing state; records profile promise |
| Target                 | Binds active tab at start unless forced                                                        | Does not rebind on completion except canonical-ID remapping                                |
| API                    | `connections.connect` or forced `connections.reconnect`                                        | `connections.connect`                                                                      |
| Initial status         | connecting/reconnecting; preserves current generation, clears error/version                    | connecting; preserves current generation, clears error/version                             |
| Accept success         | Intent must match; reject response older than actual profile generation                        | Reject response older than actual profile generation; return newer ID if still usable      |
| Reject failure         | Intent must match; ignore if generation advanced or status is connected                        | Ignore if generation advanced or status is connected                                       |
| Superseded success     | Mismatched intent returns without disconnect; SessionManager owns session cleanup              | Lower-generation result is ignored without disconnect                                      |
| Metadata               | Writes loading, awaits normalized discovery, validates intent + generation + connected/idle    | Writes loading, detaches discovery, validates generation + connected/idle                  |
| Failure representation | Returned error and exception each write scoped error with retained generation and null version | Same two scoped error branches; returns null                                               |
| Completion/cleanup     | Promise completes after metadata; intent entry remains as latest token                         | Promise completes before metadata; `finally` removes only its own in-flight entry          |

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

## Selective consolidation and retained differences

| Operation                    | Slice 2 implementation                                                                                                   | Deliberately retained responsibility                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Guarded failure transition   | `useStore.applyConnectionFailure` implements the one scoped update; four callers replace four duplicated implementations | Explicit intent rejection stays before the call; lazy returns null while explicit returns void           |
| Metadata validity            | Pure `isUsableProfileConnection(current, generation)` in connectionLifecycle                                             | Explicit intent check, captured profile ID and awaited loading remain; lazy discovery stays detached     |
| Metadata fetch/normalization | Existing `loadConnectionMetadata`, unchanged                                                                             | No new metadata pipeline or coordination                                                                 |
| Success/loading writes       | Still implemented in both entry points                                                                                   | Canonical-ID remapping, profile-list refresh timing and return behavior differ                           |
| Attempt coordination         | Existing explicit intents and lazy status guards/inFlight                                                                | No new registry; the lazy pending/status ordering is unchanged                                           |
| Session cleanup              | Authoritative SessionManager, unchanged                                                                                  | Renderer ignores superseded responses without disconnecting a reused session                             |
| Selection/interruption       | Existing Sidebar confirmation before binding                                                                             | Lazy establishment does not switch the requesting tab; obsolete active-tab prompt/helpers/option removed |

The failure action reads current scoped state atomically inside the store updater.
It rejects an advanced generation or an already-connected entry, retains the
current generation when present, and writes the same error/null-serverVersion
representation. It deliberately keeps the existing **connected-only** failure
guard; unlike metadata validity, that guard does not treat Idle as Connected.

A correction to the original audit: missing-state generation defaults are not
always equivalent. If `detachProfile` removes the entry while the request is
pending, explicit failure originally used 0 and lazy failure used the starting
generation. The action defaults `missingGeneration` to 0; lazy callers pass their
starting generation. Four returned/thrown failure tests retain these semantics.
This scalar fallback is not new coordination or a policy framework. Removing a
profile's runtime entry during an attempt is not redesigned here.

No lifecycle runner, shared promise registry, ConnectionManager, option-heavy
connector, or shared awaited metadata pipeline is introduced. Event, restoration,
refresh, reconnect and tab-selection policies remain separate.

### Confirmed findings from the final follow-up

#### Same-generation cleanup: confirmed in Slice 1, corrected in Slice 2

`SessionManager.connect()` checks its live-session map before allocating a new
main-process intent. Reuse returns the **same successful result object**, with the
same generation, and does not call the adapter again. The real connect IPC handler
only adds the saved/canonical profile ID; it does not turn reuse into ownership of
a fresh session. `SessionManager.disconnect(id, generation)` closes the current
session when the generation equals the supplied value. That is correct for a
requested disconnect, but does not establish that a renderer attempt owns it.

At Slice 1 head `0708a98`, `src/main/adapters/connection-lifecycle-reuse.vitest.ts` bridged the actual renderer
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

Slice 2 converts both characterization schedules into positive preservation
regressions. They now assert no renderer disconnect or provider close, continued
reuse/queryability of the newer session, and preservation of another live profile
with the same generation number. The added second profile requires two adapter
connections total; repeated same-profile calls still do not reopen it.

**Correction implemented:** remove the renderer-issued disconnect from
`connectProfile`'s superseded-intent branch, retaining the intent rejection/return.
Main-process SessionManager already owns stale adapter-session cleanup and forced
replacement; it is unchanged. Canonical-ID handling and per-profile isolation
remain intact. The distinct-generation renderer cleanup case now asserts rejection
without disconnect; main-process replacement/closure tests remain unchanged.
A check that only skips cleanup for an already-connected matching generation is
insufficient: the older-first schedule still has a newer request pending, and a
first accepted main session may not yet have reached renderer state at all.

#### Background lazy confirmation: confirmed in Slice 1, corrected in Slice 2

In Slice 1, `ensureConnectionForTab(tabA)` captured A's profile, but
`connectForTab` obtained its previous profile from `initial.activeTabId`. With B
active and running on a different live profile, it asked whether to stop B before
connecting A. The original reproductions covered these outcomes:

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

**Correction implemented:** keep actual connection-switch confirmation at the
selection/binding caller (Sidebar checks before bindTabConnection), and remove the
active-tab switch-confirmation lookup from the lazy reuse/connect path. That path does not rebind the requesting tab: desiredProfileId comes from
that same tab synchronously. Mechanically replacing activeTabId with requesting
Tab A would make previousProfileId equal desiredProfileId, so there is no genuine
switch to confirm there. Preserve the Sidebar's real switch/interruption policy,
background tab ownership and scoped result checks. The unused private
confirmation helpers and confirmInterrupt parameter are removed, including the
Sidebar's obsolete false-option argument. No new interruption policy or generic
operation coordinator is added. Converted tests prove background A connects
without a prompt even if window.confirm would decline; B remains running through
A metadata success/error. New Sidebar tests preserve both accept and decline
behavior for actual foreground connection switches.

### Slice 2 scope completed

1. Superseded renderer intent now rejects the result without closing a main-owned
   session. Both IPC orderings have positive safety regressions.
2. Lazy establishment no longer confirms against an unrelated active tab. Genuine
   binding changes retain their caller's foreground switch policy.
3. Four failure implementations become one guarded store action. Explicit intent
   rejection stays outside it; generation/status checks and fallback values remain.
   The pure metadata-validity predicate is shared without a runtime store import.
4. Main ownership/reuse/replacement, renderer concurrency/tab/metadata/restoration
   suites and local checks pass; measurements below show the production reduction.

Cleanup and confirmation were not interchangeable policies, so their ownership
was corrected rather than combined. Failure state and metadata validity are
shared local invariants. Success orchestration, awaited/detached metadata, initial
status writes, refresh/hydration and in-flight coordination remain intentionally
separate. No broader consolidation or generic query in-flight work (#371) is done.

Remaining **inferred/unreproduced** risk: an older lazy failure before newer
explicit success may still write error while no generation has advanced, because
lazy work does not participate in explicit intents. The existing tests establish
failure rejection after newer success and explicit pre-generation ordering, not
unified cross-flow intent protection. Do not add global coordination in this slice.
Late listLive data and canonical-ID edge cases also remain outside this extraction;
no new defect in those paths is claimed here.

## Reproducible baseline

The Slice 1 baseline was unchanged at `0708a98`. Counts include comments and type
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

Slice 2 uses the same counting command and scope:

| Renderer module            | Physical LOC before → after | Nonblank LOC before → after | AST branches before → after |
| -------------------------- | --------------------------: | --------------------------: | --------------------------: |
| store/useStore.ts          |                 1292 → 1283 |                 1264 → 1255 |                     84 → 82 |
| lib/tabConnection.ts       |                   326 → 257 |                   312 → 246 |                     26 → 21 |
| lib/connectionLifecycle.ts |                     10 → 21 |                      9 → 19 |                       0 → 0 |
| lib/connectionMetadata.ts  |                     10 → 10 |                       9 → 9 |                       0 → 0 |
| lib/metadataRefresh.ts     |                   112 → 112 |                   109 → 109 |                       8 → 8 |
| Total                      |           1750 → 1683 (−67) |           1703 → 1638 (−65) |              118 → 111 (−7) |

The one Sidebar caller argument edit does not change that module's LOC/branches.
Test/documentation additions are excluded. Guarded failure implementations fall
from **4 to 1**, with four call sites remaining. Shared lifecycle operations used
by both entry points increase from **1 to 3**: existing normalized metadata fetch,
shared failure transition, and pure usable-generation predicate. No new mutable
coordination state is added. The remaining paired implementations are attempt
start and success/loading writes; the metadata predicate is one implementation
called at four completion sites (and the existing async profile-current wrapper).

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
Slice 2 achieves the four failure-site reduction (4 → 1).

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
The final Slice 1 follow-up added three background-confirmation cases and two
integrated SessionManager/renderer characterizations. Slice 2 converts these to
positive safety tests and retains all original coverage. It also adds two real
foreground confirmation cases, twelve returned/thrown failure guard/fallback
cases, and seven pure metadata-validity cases. The affected UI run passes 143
cases across ten suites; main SessionManager passes nine and the unit/integrated
selection passes ten across two suites.
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
