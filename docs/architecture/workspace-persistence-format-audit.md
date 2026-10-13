# Workspace format, storage and restoration ownership (Phases 5A/5B)

Baseline: main `c5fc56b` (merged #399). Scope: #365 Phase 5A and #382.
Independent of Phase 4B; no Builder, query lifecycle or persisted type changes.

## Responsibility map

| Responsibility                                                                                    | Before                               | After                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------ |
| Draft types, v2 envelope, validation, parse, allow-listed serialization                           | `workspacePersistence.ts`            | `workspaceFormat.ts`     |
| Version 1 envelope conversion, historical Builder/Prometheus/Loki conversions                     | Mixed into parsing and normalization | `workspaceMigrations.ts` |
| Present-format normalization (time buckets, axis/series consistency, query-only filters), cloning | `workspacePersistence.ts`            | `workspaceFormat.ts`     |
| Storage reads/writes, debounce, lifecycle flush, failure recovery                                 | `workspacePersistence.ts`            | Unchanged                |
| Cold restoration, fresh runtime identity and store patch                                          | `workspacePersistence.ts`            | Unchanged                |

`App` uses the existing read/restore/start persistence APIs. Store sessions supply
raw and Builder drafts; presets have their own adapters/persistence and are not
workspace envelope versions. Connection profiles are stored separately: workspace
serialization keeps profile references, never credentials or profile records.

The facade re-exports all existing functions and draft types. New pure modules do
not access storage, subscribe, generate session identities or dispatch store state.
The format module calls explicit historical converters at their original points
in validation/normalization; migrations do not import the format module. No generic
migration registry, alternate persisted representation or version bump is added.

## Supported versions and sequence

- **v2**: `datakoala.workspace.v2`, `{version:2, activeTabId, tabs}`. Ordered tabs
  contain independent raw SQL, Builder state, visualization, datasource drafts,
  profile IDs and promoted query filters. Serialization key insertion order and
  conditional Builder bucket/range fields are unchanged.
- **v1**: `datakoala.workspace.v1`, `{version:1, draft}`. Convert the single draft
  to a v2 envelope, with `migrated-query-1`, `Query 1`, null profile and the original
  seven-day fallback for a missing Builder range; run the same schema validation
  and normalization. Missing observability state uses the original defaults. The
  intermediate envelope is never written to storage.
- **Historical v2 shapes**: pre-axis-first Builder source/time aliases; early
  axis-first missing temporal source; generated `time_bucket`/`count` aliases;
  Prometheus old filters (including inclusive row matchers) and calculation-as-
  aggregation; Loki single breakdown and `chart` view. These remain supported
  without claiming they had distinct envelope version numbers.

Read order remains current-key v2, the existing same-key legacy alias v2 read,
then v1-key conversion. Within a tab, structural validation precedes Builder axis
normalization; Prometheus current fields retain precedence over legacy fields;
Loki array grouping retains precedence over the single breakdown. Defaults and
malformed-value rejection still occur at their original parsing boundaries.

## Observable compatibility and recovery

Invalid JSON, wrong envelope version, zero tabs, duplicate IDs, an invalid required
field or invalid required range rejects the whole envelope. There is no partial
salvage. Unknown fields are ignored by the existing explicit allowlists. Invalid
optional datasource fields retain their existing per-field defaults; malformed
Tempo state falls back independently, while malformed required SQL visualization
or Prometheus/Loki ranges reject the workspace. Missing active IDs select the first
tab. Empty state still serializes as an empty v2 envelope which parsing rejects.

Unsupported future versions are rejected, but existing storage orchestration may
fall back to a valid v1 snapshot. It does not erase a blob during reads. Best-effort
writes, including their existing handling of unsupported stored data, are untouched.
No new future-version protection policy is implied by this extraction.

Restoration remains cold: no results, client filters, Explain state, running work,
connection activation or automatic execution. Promoted Builder query filters,
visualization settings and SQL drafts survive. Current normalization still removes
axis/metric conflicts from series and reconciles time buckets.

## Regression evidence

`fixtures/workspace-compatibility.json` was captured by executing the unmodified
persistence implementation from `c5fc56b`, with the existing test state fixture.
Nine inputs cover current multi-tab/multi-profile v2, historical v2, early-axis v2,
v1 with missing range, missing/unknown optional fields, empty v2, future version,
corrupt JSON and incomplete v1. Tests compare full parsed drafts, cold restoration
(except randomized context ID), exact serialized bytes and the subsequent parse
against baseline snapshots. Existing tests retain SQL Builder, visualization,
filters, display-unit, Loki grouping, storage debounce and session coverage.

One historical quirk is deliberately retained: the initial missing Prometheus
Builder default includes `histogramKindOverride`, whereas reparsing a serialized
explicit Builder drops it. Baseline subsequent-parse snapshots protect that actual
behavior instead of asserting an invented perfectly idempotent legacy round trip.
Current canonical fixtures retain deterministic bytes. Frozen state/filter tests
prove serialization and legacy filter conversion do not mutate their inputs.
Separate preset and store/UI suites guard restored preset drafts and adjacent flows.

## Phase 5B — storage and cold restoration

Baseline: main `a9ab2f4`, including #400 and #401. Before Phase 5B, the
facade still owned browser access, storage orchestration and cold allocation.
The remaining boundaries now follow their side effects and inputs:

| Responsibility                                                                                     | Owner after Phase 5B                                      |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Browser storage detection, safe reads, ordered snapshot fallback                                   | `workspaceStorage.ts`                                     |
| Best-effort writes, 150 ms debounce, explicit lifecycle flush, subscriptions/disposal              | `workspaceStorage.ts`                                     |
| Validated draft → ordered cold `QuerySession` tabs, fresh runtime context IDs, active-tab recovery | `workspaceRestoration.ts`                                 |
| Read → allocate → apply exactly one caller-supplied store patch                                    | `workspacePersistence.ts` facade                          |
| Envelope validation/serialization and historical conversions                                       | Unchanged `workspaceFormat.ts` / `workspaceMigrations.ts` |

The facade retains its exports, signatures and storage defaults. It composes reads
with `workspaceRestorePatch`; it does not import the store at runtime. The new
restoration module consumes validated nonempty drafts and returns existing
`QuerySession` objects, not another authoritative session model. Saved tab IDs
remain stable; only runtime `queryContextId` is regenerated per allocation.
Connection records, live connection state and credentials are outside this patch.
Startup remains in `main.tsx`, before React mounts; `App.tsx` and store ownership
are unchanged. No automatic Run, Explain or reconnect is introduced.

### Existing storage failure/recovery contract

- Absent `window`, disabled localStorage access or explicit null storage returns
  no draft and makes persistence startup a no-op without subscriptions/listeners.
  Storage is detected once at startup; later availability does not attach a writer.
- Each read suppresses its exception independently. Preserve current v2 read,
  repeated same-key legacy-alias v2 read, then v1 fallback in that exact order.
  A transient first-read failure may recover on the second same-key read.
- Reads and cold restoration never write, delete or eagerly migrate stored data.
  Corrupt/unsupported current input may fall back to supported v1 data. Without
  usable input the facade does not apply a patch, preserving caller defaults.
- Startup caches the current raw bytes but does not schedule an initial write.
  Store notifications reset a 150 ms timer; completion serializes the latest state,
  skips equal bytes, and advances the cache only after a successful `setItem`.
- Write/quota failures remain silent and best-effort: no autonomous retry, queue,
  durability promise or user notification. A later edit or flush retries if bytes
  still differ. Disposal flushes before unsubscribing/removing both lifecycle
  listeners, preserving order. Flush cancels an outstanding timer.
- `beforeunload`, `pagehide` and disposal flush even without a scheduled edit. Thus
  unsupported future data remains intact during read/startup, but the existing
  write policy can replace it on a later edit/flush. This refactor deliberately
  does not invent future-version protection or loss-recovery guarantees.

### Regression evidence and limits

The nine #400 golden fixtures and their baseline JSON remain unchanged. Through
the stable facade they still compare full parsed drafts, cold patches (normalizing
only randomized context IDs), exact serialized bytes, historical conversion and
subsequent parses. They include multi-tab/profile references, independent raw and
Builder drafts, Prometheus/Loki/Tempo drafts, promoted filters and visualizations,
active-tab fallback, defaults, empty/corrupt/future input and historical outcomes.

Deterministic fake-timer/storage/event tests add unavailable/disabled startup,
read exceptions, fallback precedence, write and quota failures, later recovery,
coalescing at the default 150 ms boundary, explicit flush before completion,
disposal flushing/unsubscription/listener removal and future-version write policy.
The previous debounce test now uses controlled timers instead of sleeps. A frozen
validated-draft test checks cold allocation without mutation and fresh context IDs
on repeated restoration. The existing app restoration test now asserts zero Run,
Explain and reconnect calls after profile loading while disconnected.

No additional extraction is justified: timer, cache, subscription and lifecycle
listeners share one writer lifetime; splitting them would obscure ownership.
The facade's read/allocate/apply sequence is small and explicit. Packaged restart,
real storage failure and provider acceptance remain pending in #382.

### Phase 5B local validation (Linux x64, Node 24.19.0)

- Focused persistence: 1 file / 41 tests passed, including all nine golden cases.
- Focused store/session/App restoration: 4 files / 23 tests passed.
- Full UI: 100 files / 962 tests passed.
- `pnpm verify`: renderer controls, production/full dead-code, import boundaries,
  formatting, TS/React/CSS lint, all three typechecks, `pnpm test` and build passed.
  Main/shared: 463 passed, 5 skipped; renderer: 621 passed; script tests: 13 passed.
- `pnpm check:duplication`: passed (advisory 39 clones, 1.31% lines).
- Initial test run lacked the official SQLite extension; after
  `pnpm prepare:sqlite-extension` succeeded, the full renderer suite passed.
- `pnpm verify` then stopped at `pnpm smoke`: the harness targets the macOS
  `Electron.app/Contents/MacOS/Electron` executable, absent on this Linux host.
  `smoke:db` and `smoke:flow` were not reached; native/macOS packaged restart,
  provider and real-storage acceptance are not claimed. GitHub CI results belong
  in the draft PR handoff; these local checks do not establish human acceptance.

## Release acceptance extension (all pending)

Extend #382 RC-10/RC-13/RC-05C once on the frozen candidate, using a backed-up copy
of a pre-v0.2.1 workspace and safe read-only profiles:

1. Save multiple tabs with different profile references and an active tab; restart.
   Compare tab order/titles, profile references and active selection; no auto-Run.
2. Restore independent raw SQL and SQL Builder drafts, including time source/range,
   ordered Series, promoted query filters, visualization type/axes/units/hierarchy.
3. Save/load a SQL preset, edit its restored draft, restart and compare those fields.
   Client-only filters and transient results retain their existing reset semantics.
4. Open the backed-up pre-v0.2.1 workspace; compare all retained fields before/after
   another save/restart. Verify no unexpected data loss/default reset. Record build
   SHA, platform, source format, actions, outcome and evidence; every case pending.
