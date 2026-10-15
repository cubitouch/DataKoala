# NON-02 — Session and preset persistence

## A. Metadata and boundary

- Parent: #391. Integration: #406, `audit/391-ux-convergence`.
- Exact fetched base: `2525623335f3aa6c4bd946d653135bba6b5fcda8`.
- Isolated branch: `audit/391-non-02-persistence`.
- Temporary draft PR: https://github.com/cubitouch/DataKoala/pull/413, targeting the integration branch, not main.
- Exact characterization commit: `c3b9e055b3298911c55e533202048800df5b0001`.
- Inventory: **A19**, **A22** only. Nonvisual audit, 2026-10-15.
- Changes: this report and uniquely owned `src/renderer/src/lib/NON-02.persistence.test.tsx` only. No runtime, schema, migration, shared test, harness, workflow, authoritative register or other batch changes.

The characterization commit has the same Git tree as the locally executed test revision `81d86212def89794b407863832108d5fb1e96ae4`; the connected GitHub write API created the published commit after authenticated shell push was unavailable. Report-only successor commits do not change the tested source. The final completion SHA is the draft PR head reported in the handoff; no self-referential commit hash is fabricated inside this document.

Preparation: root AGENTS.md (no nested AGENTS.md found), datasource inventory, convergence audit/register, workspace format/storage/restoration architecture, actual workspace and preset modules, session/store/App callers and adjacent tests. User prohibition on local lint/format takes precedence over AGENTS.md's general validation commands.

## B. Independent coverage dispositions

| ID | Behavior | Visual | Implementation owner | Limits |
| --- | --- | --- | --- | --- |
| A19 | **BV**, scoped deterministic serialization, memory-storage, restore-patch, store and jsdom assertions; confirmed override-loss defect NON02-01 | **N/A** for stored-data, migration and execution-side-effect contracts; layout appearance belongs to CAP-09 | Shared workspaceFormat/Migrations/Storage/Restoration, stable workspacePersistence facade, useStore/querySessions; App owns separate dimensions | Not packaged cold-start acceptance, durable filesystem proof, live providers or all seven actual source startups. Missing-profile UI recovery remains source-only. |
| A22 | **BV**, exact compatibility guard and unchanged rejection state across all seven kinds; compatible parse/apply/store commit tested without API execution | **N/A** for compatibility/atomicity rules; manager appearance/CRUD covered separately by CAP-08 | explorationPresets/compatibility + createPreset + four adapters; PresetManagerAction validates before useStore.commitLoadedPreset | No live schema/table/metric existence validation, connection authentication or native provider acceptance. Same-profile identity does not fingerprint endpoint/configuration. |

BV means the named assertions below ran, including negative behavior where stated. It does not mean every behavior is correct or every startup/platform scenario passed. Source-only expectations are marked SO; remaining platform acceptance is UV.

## C. Persistence contract and ownership matrix

Paths below are relative to `src/renderer/src/`.

| State category | Contract / actual handling | Serializer / validation / migration | Storage / restoration |
| --- | --- | --- | --- |
| Ordered tab IDs, titles, active selection | Persisted and restored; unknown active ID falls back to first tab; duplicate/empty IDs invalidate envelope | lib/workspaceFormat; v1 migration generates migrated-query-1 / Query 1 | workspaceStorage; workspaceRestoration; one facade patch |
| Connection association | Profile ID only; references retained even if missing or same ID changes kind. No persisted source-kind fingerprint | workspaceFormat; v1 creates null association | Restoration does not load, validate or activate profiles; Sidebar loads profiles separately |
| Raw SQL/PromQL/LogQL/TraceQL draft and raw/Builder mode | Persisted; `sql` is the shared raw text slot, independent of Builder | workspaceFormat required string/mode checks | Shared cold tab allocation |
| SQL Builder relation, axes, temporal source/range/bucket, ordered series | Conditionally normalized; time bucket serialized only for temporal X; categorical X retains independent temporal filter; conflicting axis/metric series removed | workspaceFormat + historical axis/time aliases in workspaceMigrations | Shared cold allocation; no metadata fetch required |
| PromQL Builder metric/calculation/aggregation/window/percentile/group/filter/values | Persisted/restored with legacy conversions and defaults, **except explicit histogramKindOverride is dropped on parse** | workspaceFormat.parsePromqlBuilder; workspaceMigrations legacy filters/aggregation | Shared workspace path; NON02-01 |
| Prometheus fetch range and step | Persisted/validated; malformed required range/step rejects envelope | workspaceFormat | Shared cold allocation |
| Loki matchers, lines, parsers, fields, range, limit, grouping, result view | Persisted, with per-field sanitation/defaults; invalid required range rejects envelope; old chart maps to line, breakdown maps to grouping | workspaceFormat + workspaceMigrations | Shared cold allocation; no range-navigation history |
| Tempo Builder, range, sample size, result view | Persisted; missing/malformed optional Tempo fields independently default | workspaceFormat + tempoQueryState parser/defaults | workspaceRestoration clones Tempo Builder/range |
| SQL/raw and Builder visualization | Persisted views, axes, aggregation, series, hierarchy, scale, display unit; required malformed visualization rejects envelope | workspaceFormat allowlist and normalization | Shared cold allocation |
| Promoted Builder query filters | Persisted/restored as query filters, including applicable provenance | workspaceFormat.builderQueryFilters + resultFilters | Restoration retains promoted filters |
| Client/local filters, SQL result filters | Intentionally transient; excluded/reset | workspaceFormat allowlist | Restoration resets sqlResultFilters and retains only query Builder filters |
| Results, pending outputs, running/error/repair state, Explain, operation tokens, series visibility | Intentionally transient; excluded/reset, fresh queryContextId | workspaceFormat explicit fields | workspaceRestoration cold defaults; no Run/Explain/connect |
| App sidebar width/editor height | Persisted separately, viewport-clamped on initialization; not part of workspace envelope or migrations | App.tsx + shared/layoutDimensions | Separate datakoala.layout.v1.sidebarWidth / editorHeight localStorage keys; SO for restart in NON-02 |
| Table widths, local inspector/detail selection, loaded trace/log cohorts | Not in workspace envelope; no persistence promise established here | ResultsTable resets widths by result/mode/revision; source component state | Transient in this workspace contract; independent layout subcontracts not broadly certified |
| Profiles/credentials | Outside workspace/presets; never serialized as connection records | Separate main/profile owners | OS credential durability and migration remain NON-03 |
| Saved preset definition | Envelope v1, record v1, payload v1; exact profile/kind/language guard before adapter parsing/application | explorationPresets/persistence, compatibility, createPreset; four source-family adapters | datakoala.presets.v1, separate repository outside Zustand; store commit clears runtime state |

## D. Tested failures, compatibility and side effects

### New isolated tests (executed)

`lib/NON-02.persistence.test.tsx`, describe **NON-02 persistence boundaries**:

1. **persists, reads and commits a %s preset only to its target tab without execution** — seven kinds. Create repository record, reconstruct repository/read it, parse/apply and commit to explicit inactive target. Exact saved raw draft/mode and target identity/title/profile preserved; other tab retains object identity; active selection unchanged. `api.query.run`, `api.query.explain`, `api.connections.connect` each called **zero** times.
2. **rejects other-profile, cross-kind and malformed %s presets with exact input preservation** — seven cases. For each kind: another profile of same kind rejected; all six different kinds with same ID rejected (42 cross-kind combinations); empty payload rejected. Target deep equality before/after, source raw draft preserved, zero execution/connect calls. This is domain-level rejection, not seven separately rendered manager clicks.
3. **restores orphaned and changed-kind references cold without modifying loaded profiles or other store state** — two tabs retain exact ID/profile/raw text with one deleted ID and one ID now represented by a Tempo profile. Active tab preserved; existing profiles and metadata retain object identity; no live connection state or storage write; zero execution calls. Explicit detach nulls only the missing association, retaining draft and unrelated tab identity. This proves preservation, not automatic compatibility repair.
4. **rejects the complete workspace on one invalid required tab without patching unrelated valid state** — numeric raw SQL in one of two tabs rejects complete envelope; zero patch/write/execution; current store object identical. No partial salvage is claimed.
5. **NON02-01: preserves an explicit %s histogram override through workspace parse** — two `it.fails.each` reproductions, classic/native. Serialized JSON has the exact override, but parsed draft returns undefined. These are expected failures of the desired preservation contract, not successful preservation assertions.

### Existing tests re-executed and inspected

| File / exact named test or family | Assertions and actual result |
| --- | --- |
| workspacePersistence.test.ts: workspace v2 round-trips ordered tabs, names, connection references and axis-first drafts | Ordered independent tab drafts, active B, source ranges/controls/visualization/filter fields restored; passed |
| restore rebuilds every tab cold without reconnecting or replaying results | Patch has only tabs/activeTabId; cleared running/results/errors/Explain/client filters and visibility; passed. No API spy in this pure case; side-effect spies are in new tests and App test below |
| restoration clears unobservable pending work for every datasource kind | Seven profile-ID labels, stale tokens/pending slots discarded and context regenerated; passed. Profile strings alone do not instantiate seven providers |
| older and malformed Tempo drafts restore independent standard defaults | Invalid optional fields default independently, including distinct nested objects; passed |
| invalid, duplicate or incompatible persisted state fails closed and stale Minute semantics normalize | Invalid JSON/empty tabs/duplicates/malformed Loki range rejected; incompatible bucket normalized; passed |
| baseline compatibility: current-v2, historical-v2, early-axis-v2, legacy-v1, optional-v2, empty-v2, future, corrupt, incomplete-v1 | Nine existing golden fixtures: full parsed drafts, restored patches except normalized random context, exact bytes, subsequent parse, unchanged source storage; passed |
| legacy v1 time-first workspace migrates into one canonical source-axis tab; pre-axis-first v2 workspace with no Builder xColumn remains readable; early axis-first v2 workspace infers temporal filter source when timeColumn was omitted | Explicit supported historical conversions, including generated aliases/count/time fallback; passed |
| serialization and historical normalization do not mutate frozen inputs; current live-session serialization matches pre-extraction bytes | Frozen input preservation and baseline byte equality; passed |
| unavailable browser storage leaves startup cold and does not subscribe; read failures preserve ordered fallback and never write during restoration; same-key retry and valid current snapshot retain precedence over v1 | No subscription/patch on unavailable storage, isolated read exceptions, repeated same current-key read then v1 fallback, zero writes; passed |
| failed write retries on subsequent edit or lifecycle flush: Error / QuotaExceededError | Silent best-effort failure, no autonomous retry, later edit/flush recovery, equality cache advances only on success; passed |
| default debounce coalesces latest state, flush cancels timers and disposal removes listeners | 150 ms fake-timer debounce, latest state, lifecycle/dispose flush, listener/timer cleanup; passed |
| future input stays intact until the existing edit/flush write policy applies | Future blob survives read/startup, pagehide can overwrite with current workspace; passed actual policy, not a loss-prevention guarantee |
| explorationPresets/compatibility.test.ts: requires connection identity, source kind, and exact language | Same profile accepted, different ID/kind/dialect rejected; passed |
| explorationPresets/adapters.test.ts: creates and applies a valid %s preset without changing session identity | Seven kind adapters/registry and typed incompatible/corrupt failures; passed |
| explorationPresets/datasourceAdapters.test.ts | SQL definitions/promoted filters; PM fields including histogram override; Loki grouping/filter independence and pipeline; Tempo advanced fields/raw separation; excludes runtime capture. Passed. SQL4 parameter labels reuse the same SQL adapter test body; new NON-02 tests exercise actual per-kind orchestration |
| explorationPresets/persistence.test.ts | Malformed/future envelope, invalid version/payloadVersion/language, duplicate IDs, separate profile listing and opaque payload preservation; passed. Invalid records isolated, not whole-preset-envelope rejection |
| PresetManagerAction.test.tsx: loads a preset into the current tab, clears runtime state, and does not execute it | Real jsdom click commits definition, clears runtime, keeps identity/title/profile, callback once, zero startQuery/completeQuery/setResult; passed |
| rejects a preset from another datasource without changing the current tab | Real jsdom load click keeps exact tabs, modal remains, error notify, no load callback/lifecycle calls; passed |
| disables loading while a query is running | Disabled load prevents change; passed |
| querySessions.test.tsx: keeps SQL, Builder, filters, visualization and result state isolated between tabs; keeps loaded SQL Builder query filters but clears leftover filters for non-SQL presets | Store isolation and commit filter ownership; passed |
| App.prometheusRestore.test.tsx: restores a Prometheus-bound tab, loads its saved profile, and keeps the app shell alive while disconnected | Restore before profile promise settles, delay editor until profile available, disconnected state after profile loading, zero Run/Explain/connect; passed. QueryEditor is mocked; this is jsdom startup orchestration, not Electron |

## E. Findings and Atlas candidates

### NON02-01 — Confirmed explicit Prometheus histogram override loss

**CONFIRMED_DEFECT / PARTIAL convergence**, A19 with P07 comparison partner (CAP-16). High confidence for data-path reproduction; no screenshot claim. `workspaceFormat.sessionDraft/serializedSession` writes the current `promqlBuilder` including override; `parsePromqlBuilder` returns an object omitting `histogramKindOverride`. PromqlBuilderPanel uses `builder.histogramKindOverride ?? 'auto'`. Both nondefault supported selections therefore lose their explicit value after workspace parse. Preset capture/parse retains the override, so workspace and preset contracts diverge.

This was hinted by the earlier architecture note's default-field round-trip quirk, but the two new tests specifically reproduce **current explicit classic/native selections**, not merely missing legacy defaults. Existing golden fixtures are preserved unchanged. Potential impact: an explicitly selected histogram representation may resolve differently after restart; actual provider query consequences are not newly measured. Future fix belongs to the format parser plus backward-compatible tests, not a version bump or migration rewrite. Atlas should show a nonvisual finding card with the serialization/assertion evidence and CAP-16 reference, not invented before/after PNGs.

### NON02-02 — Converged preset atomic compatibility, intentionally profile-bound

**ALREADY_CONVERGED**, A22; high confidence for tested domain and PG jsdom caller. One exact guard checks profile ID, source kind and query language; adapters validate before applying; store commit preserves target identity and cold-resets runtime. Same-kind different-profile rejection is intentional, even LF/SQ sharing DuckDB dialect does not allow crossing source kind. Metadata availability and same-ID endpoint changes are outside this compatibility definition. Keep source adapters; do not broaden compatibility merely because syntax is shared. Nonvisual Atlas partner: CAP-08 manager/load and workspace boundary NON02-03.

### NON02-03 — Workspace restoration preserves references, not provider compatibility

**INTENTIONAL_DIFFERENCE / NEEDS_VERIFICATION**, A19/A22. High confidence for reference preservation and no pure-restore execution; medium confidence for UI recovery implications. Workspace records do not store source kind or endpoint fingerprint; cold restore has no profiles input. A changed-kind profile ID retains old raw text and all stored source drafts, while a missing profile ID remains attached. By source, App's `queryProfileLoading` is true whenever an ID lacks a profile, including after profile loading has finished; no resolved-missing branch is visible. This may leave the query surface blocked until rebind/detach, but **no rendered missing-profile scenario was executed here**, so do not classify permanent UI recovery as a confirmed defect.

Integration follow-up request: separate synthetic missing/deleted-profile startup capture and rebind recovery, plus changed-kind raw/Builder selection; assert preserved drafts and zero automatic Run/connect. Do not change the shared harness in this batch. Distinguish live-session metadata hydration in Sidebar (listLive may intentionally fetch metadata for an existing session) from fresh provider reconnect.

### NON02-04 — Recovery and version boundaries differ deliberately; loss risks remain

**INTENTIONAL_DIFFERENCE / policy follow-up**, A19/A22. Shared workspace requires a valid complete envelope; one invalid required tab prevents all restoration, preserving current defaults rather than partially salvaging other saved tabs. Optional Tempo fields default independently. Preset repository instead skips invalid records/duplicates and keeps valid records. These are different units of trust, not needless duplicated parsing.

Workspace future-version data can be overwritten by later edit/pagehide/disposal despite read/startup preservation (executed existing test). Preset repository similarly reconstructs writes from accepted records; by source, later successful create/rename/delete can omit unsupported/malformed records and create can replace an unsupported envelope. No archival recovery, concurrent-writer merge or durable transaction promise is established. Integration should decide preservation/recovery policy separately; no migration or storage policy change is authorized here. Atlas: nonvisual risk card, no pixel evidence.

### NON02-05 — Shared ownership is already separated; keep semantic validation boundaries

**ALREADY_CONVERGED / SHARE_SHELL_KEEP_ADAPTERS**, A19/A22, source assessment. #365 Phase 5A/5B separation is present: pure current format and historical converters; storage owns browser access/debounce/cache/events; restoration owns cold allocation; facade composes one patch without importing store at runtime. Presets deliberately use a different versioned repository and strict adapter parsers. Both paths repeat time-range/visualization/Builder shape checks, but workspace accepts historical shapes/defaults whereas preset load rejects invalid payloads. No extraction is justified solely by similar lists or predicates. A future enum/default addition should be reviewed across both paths (NON02-01 demonstrates maintenance drift); do not share permissive workspace migration as a strict preset validator.

## F. Verification and provenance

Local environment: Linux, Node v24.19.0, Vitest 4.1.11. Existing compatible dependencies reused read-only through a node_modules symlink; symlink is not committed. No credentials or providers used.

Commands actually executed (from repository root):

```sh
node_modules/.bin/vitest run --config vitest.renderer.config.ts src/renderer/src/lib/workspacePersistence.test.ts src/renderer/src/lib/explorationPresets --reporter=verbose
node_modules/.bin/vitest run --config vitest.ui.config.ts src/renderer/src/lib/NON-02.persistence.test.tsx src/renderer/src/store/querySessions.test.tsx src/renderer/src/components/query/PresetManagerAction.test.tsx src/renderer/src/App.prometheusRestore.test.tsx
node_modules/.bin/tsc --noEmit -p tsconfig.test.json
```

- Renderer unit selection: **5 files, 74 passes**, including 41 workspace cases and 33 preset cases.
- Final selected UI run: **4 files, 43 ordinary passes + 2 expected failures**, including 16 new ordinary cases and 2 new expected failures.
- Combined distinct executed selection: **117 ordinary passes + 2 expected failures**, 9 files. Earlier UI baseline ran 3 files / 27 passes; the initial UI-config command included unit paths that its include rules excluded. It is not counted as executing the unit suites; those ran separately with renderer config.
- Test typecheck fails at inherited `PresetManagerAction.test.tsx:490` (TS2352: PostgreSQL object cast to Prometheus profile lacks transport). That file is identical to base; NON-02 adds no diagnostic. This is a pre-existing typecheck failure, not a passing typecheck or a change made here.
- No local linting, formatting, full verify, build, Electron capture or packaged smoke run. No inferred CI success from local tests.
- GitHub Actions associated with characterization SHA above: CI **38759788917**, Documentation **38759788981**, Visual preview **38759788945**. At report preparation they were queued/in progress. Final-head run IDs/statuses are recorded in the completion handoff; these initial runs may be cancelled by report-only pushes. No generated screenshots are needed or accepted as NON-02 evidence.

## G. Outstanding acceptance and integration requests

1. Aggregate A19/A22 from this report into the authoritative register only after branch integration; preserve each BV limitation and the NON02-01 negative outcome. This agent does not edit shared reports or #406.
2. Reproduce NON02-01 on a supported packaged restart and plan a separate backward-compatible parser fix. Keep the expected failures until the fix is reviewed; do not reinterpret expected-failure suite status as a preservation pass.
3. Capture missing-profile startup/rebind and changed-kind surface selection as NON02-03 describes. Profile deletion/detach preservation is tested at store level only.
4. Packaged quit/relaunch with saved tabs/layout, actual disk durability, real localStorage failure/quota, native crash recovery and release upgrade remain **UV**. Golden fixtures establish only the explicitly covered v1/v2 historical shapes, not every past release or future schema.
5. Real table/column/metric disappearance, unavailable gcx/source configuration, same-ID edited endpoint, live-session metadata hydration and provider execution remain **UV**. Exact preset identity checks do not validate backend schemas.
6. A19 layout restart is SO here: App uses separate dimension keys/clamps. CAP-09 established resizing, not restart. Inspector/legend/local-view state must not acquire a persistence guarantee from this report.
7. Storage is best effort, with no autonomous retry or conflict merge. Read/parse safety is distinct from write preservation, unsupported-version protection and concurrent desktop windows; those require a product policy before implementation.
8. Owner handles formatting. Check final CI and existing test typecheck failure separately; neither green unit tests nor a green preview makes the release accepted. #382 remains acceptance owner.

## H. Completion disposition

**EVIDENCE_COMPLETE — scoped nonvisual audit**, with confirmed defect NON02-01 and explicitly unverified platform/UI recovery scenarios. A19 and A22 have independent dispositions; version/migration/storage/restoration/preset ownership is mapped; exact state preservation and execution counts are tested at their stated boundaries. Completion means audit evidence is sufficient for aggregation, not that persistence is defect-free or packaged acceptance has passed.

Stop after NON-02. No other batch, production fix, Phase 2, final Atlas, merge, integration-branch write or authoritative coverage update is performed.
