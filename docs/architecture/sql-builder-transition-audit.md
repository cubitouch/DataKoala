# SQL Builder transition ownership (Phase 4A)

Audited against main `3012638` after #395/#396/#397. Scope: #365 Phase 4A,
release tracker #382. No async coordination or UI decomposition.

## Authoritative state and call graph

`QuerySession.builder` owns relation, independent dataset time source/range,
bucket and ordered Series columns. `builderVisualization` separately owns X,
Y, aggregation and chart settings. SQL Builder does not have a separate list of
metrics or dimensions: its axis-first model uses these existing fields.
`BuilderPanel` reads the originating session and dispatches tab-scoped store
updates. `setBuilder` runs `transitionBuilderState`, including time-range
normalization, minute fallback, promoted-filter reconciliation and revision
updates. Existing filters retain their operator, value and provenance.

`builderRelations.selectionPatchForColumns` validates loaded columns and ignores
responses for another relation. `selectBuilderRelationState` implements sidebar
selection; its same-relation no-op is distinct from an explicit form selection,
which resets dependencies even on reselection. These semantics remain unchanged.

## Changes and retained boundaries

- `builderRelationSelectionPatch` owns the query reset defaults shared by schema
  selection, explicit table selection and sidebar relation replacement. It clears
  time source/range and Series, resets the bucket to Day, and allocates a fresh
  Series array. Existing state is merged by the caller; unrelated fields survive.
- `builderTimeSourcePatch` preserves an explicit range when changing the dataset
  time source, defaults to seven days when selecting a source without a range,
  and clears the range when removing the source.
- `builderAxisFilterIds` identifies metric/X result-filter dependencies without
  mutating filters. One local dispatch loop replaces the two filter-removal loops.
  Notices and per-filter store revision behavior remain in their existing callers.

X/Y/aggregation callbacks remain local because they coordinate the separate
visualization configuration, query state, notices and result-filter dispatch.
Moving those into a new combined state model would weaken ownership. Series
application is already two straightforward tab-scoped setter calls; selection
add/remove/reorder and cardinality checks retain their existing implementation.
Filter add/edit/remove already use domain/store utilities and are not duplicated.
No generic reducer, new state model or persistence migration is warranted here.

## Generation, persistence and execution

The component still feeds `generateBuilderQuery` with the existing relation,
metadata, axes, aggregation, Series, range and promoted filters. Identifier
escaping and parameters remain generator responsibilities. Explicit Run and
Explain/Analyze paths are unchanged. Local edits do not execute a primary query.
Raw SQL remains its own session draft; normal mode switching preserves it, while
Open in SQL mode explicitly copies the formatted generated query.

`workspacePersistence` serializes the existing Builder, visualization and filter
fields. SQL preset adapters reuse the same shapes. No serialized schema or
restoration path changes. Visualization defaults, legacy migration, chart/AI
ownership and tab identity remain at their existing boundaries.

Metadata reads, column loads, cardinality probes, request guards and retries need
React/async coordination and remain out of scope for Phase 4A. The existing local
schema synchronization clears the schema after resetting an established relation;
the new integration test explicitly follows that existing two-step flow. This
behavior is not changed by this refactor.

## Regression evidence and release handoff

New pure tests cover explicit relation reset/reselection, immutable inputs and
fresh arrays, time-source removal/default/replacement, ordered Series preservation,
axis filter dependency selection, unchanged operators/values and SQL/parameter
equivalence using the real generator. A component sequence configures axes and
filters, replaces schema/relation, selects a new X, and checks generated SQL,
raw-draft preservation and zero primary requests. Existing Builder tests protect
metric/aggregation compatibility, Series probes, independent time source, column
validation, generated SQL handoff, persistence/presets and query lifecycle.

Extend existing RC-13 in #382; all manual checks remain **pending**:

1. Configure relation A with X, Y/aggregation, ordered Series and result filters;
   replace its relation/schema and verify reset defaults and generated SQL.
2. Add/remove X/Y and Series, change aggregation and time source/range; verify
   intended dependent filter clearing and chart synchronization, with no Run.
3. Edit/remove filters; confirm surviving predicates and parameters. Switch
   Builder/raw, explicitly copy generated SQL, then Run and Explain/Analyze.
4. Save/reopen workspace and a preset, restart, and compare settings and SQL.
   Repeat with tabs A/B and confirm only the originating tab changes.

Risk is low: a behavior-preserving consolidation with unchanged store and wire
contracts. Live PostgreSQL execution and packaged visual acceptance remain RC
checks; deterministic tests do not mark them passed.
