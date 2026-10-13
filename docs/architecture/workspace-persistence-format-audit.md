# Workspace format and migration ownership (Phase 5A)

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

## Phase 5B and limitations

Browser access, safe reads, repeated same-key fallback, storage exceptions,
debounce/flush, subscriptions, restoration orchestration, cold-session allocation
and initialization ownership remain in the facade for Phase 5B. The existing schema
is permissive in some optional fields and does not preserve arbitrary unknown
fields; this refactor does not tighten or relax it. Fixtures establish supported
shapes, not compatibility with every externally modified snapshot. Native packaged
restart and real-provider testing remain release acceptance tasks.

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
