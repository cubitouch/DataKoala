# CAP-19 — Loki log list, inspector and copying

## A. Metadata and provenance

- Date: 2026-10-15. Scope: **L12–L18**; audit-only independent batch #391.
- Integration base: `906960284260175f88761d9ff93fe2fd79351dbd`.
- Branch: `audit/391-cap-19-loki-logs`; temporary draft PR: https://github.com/cubitouch/DataKoala/pull/420, **base `audit/391-ux-convergence`**, not `main`.
- Initial scenario/module commit: `72597b6a5b115cedaa72fe27417870c131301d6d`.
- Module: `scripts/visual-preview/audit-batches/cap-19.mjs`; uses existing standalone loader introduced in #412, without modifying that loader, canonical fixtures or workflow.
- Generating checkout, successful screenshot artifact provenance and individual image inspection: **PENDING** at this report checkpoint. Report commits are not misidentified as generating scenario commits.
- Fixture: 360 deterministic synthetic log entries derived from `auditLogs`, supplemented with ERROR/WARN/INFO/DEBUG, repeated/long/multiline content, one JSON raw log with nested fields and escaped characters, indexed labels, structured metadata, parsed fields and trace/span IDs. All requests are intercepted; no authenticated provider or production logs.

## B. Independent inventory coverage

Codes: VV=individually visually inspected at full resolution; BV=executed renderer behavioral assertion; SO=source or existing tests only; UV=unverified. **Checkpoint values below remain provisional until CI artifact inspection.**

| ID | Visual | Behavior | Implementation ownership / existing named tests | Remaining limits |
| --- | --- | --- | --- | --- |
| L12 log list | SO (historical `logs-default-desktop.png`, `compare-lists.png`) | SO + newly committed CAP-19 native scenario, not yet accepted | `LokiExplorer` newest-first sorting; `LogResultExplorer`, `useVirtualizer`; `LogResultExplorer.ui.test.tsx` bounded list | Native CAP-19 scroll/row count/full-resolution image pending; no full-dataset conclusion from viewport alone |
| L13 search | SO | SO + pending CAP-19 typed input/clear/highlight/count assertions | `LogResultExplorer` `createTextSearch` and `HighlightedText`; named `LogResultExplorer.ui.test.tsx` | Search across loaded subset rather than backend; metadata match and scroll reconciliation need native evidence |
| L14 severity | SO (historical badge images) | SO + pending CAP-19 Level/explicit Run assertions | `LogSeverityBadge` displays a badge; `LokiBuilderPanel` Level controls indexed `severity`; `LokiExplorer` executes the query | Badge and query-level filtering are separate; unknown severity/live provider unverified |
| L15 inspector | SO (historical `logs-open-desktop.png` and `compare-detail.png`) | SO + pending native selection/resize/scroll | `LogResultExplorer`, shared `ResizableDetailPanel`; `ResizableDetailPanel.test.tsx`, `LogResultExplorer.ui.test.tsx` | Native keyboard focus and cross-view remount after close need verified images |
| L16 field categories | SO | SO + pending native target-row/field assertions | `LogResultExplorer` `fields` renders indexed labels, structured metadata and parsed fields | Nested field values are rendered with `String(value)`, losing object structure; full inspection unverified |
| L17 include/exclude | SO | SO + pending inspector click/generated LogQL/no-implicit-query assertions | `LogResultExplorer` emits source/key/value/exclude/parser; `LokiExplorer.resultFilter` updates Builder matcher or parser/field filter; `LogResultExplorer.ui.test.tsx` | Inspector promotes filters to Builder; local pattern fallback is a different owner in `viewPatternLogs` (CAP-20); invalid query dispatch needs runtime verification |
| L18 copy | SO (historical V-07 denial images) | SO + pending payload/reject/retry simulation | `LogResultExplorer` direct `navigator.clipboard.writeText` calls; copy payload UI tests. Compare shared `clipboardText` and `NotificationArea` | Mocked clipboard does **not** prove native OS clipboard acceptance; rejection is not caught in this caller |

## C. Interaction matrix

The committed standalone module specifies these actual Electron-renderer transitions; outcomes remain **pending** until the corresponding CI observation is checked.

| Initial state | User action | Expected observable contract | Evidence target |
| --- | --- | --- | --- |
| 360 loaded rows | Open list, inspect first row and mounted article count | Newest-first order, 360 loaded with a bounded DOM cohort; no accidental clipping | `cap19-logs-default-desktop.png` / `observations[0]` |
| Full loaded rows | Type a distinctive local search then clear | One match and highlighting, followed by 360 rows; zero provider calls | `behavior.search-severity` |
| Builder loaded result | Select Level ERROR and explicitly Run | Builder-only Level does not itself dispatch; resulting synthetic ERROR subset and request LogQL are exact | `cap19-logs-filtered-desktop.png` / `requests` |
| ERROR subset | Select synthetic multiline JSON row; use inspector resize keyboard and inspect after scroll | Selected ID stays stable; full readable message, field names, inspector resizing | `cap19-logs-inspector-desktop.png` |
| Open inspector | Include indexed `service_name`, exclude structured `region` | Correct distinct `=` and `!=` query-level filters, Builder promotion, zero implicit runs | `cap19-logs-field-filter-desktop.png` / `behavior.field-filter` |
| Selected row | Copy message/raw/attempt, reject raw copy, recover, scroll virtualized list | Exact *full* payload, unchanged query/selection; rejected copy visibly characterized rather than falsely successful | `cap19-logs-copy-feedback-desktop.png` / `behavior.copy-scroll` |

**Boundary:** `LokiExplorer.resultFilter` always promotes inspector include/exclude to Builder; `viewPatternLogs` has the separate candidate-based Builder promotion/local-pattern fallback and the incompatible/multiple line-filter guard. CAP-19 must not claim that an inspector action exercises CAP-20's local-fallback branch.

## D. Screenshot manifest

All five names are owned exclusively by `CAP-19`; expected **1440×900, DPR/zoom 1**, synthetic IPC. These dimensions are acceptance targets, **not yet proof that PNGs exist or were opened**.

| Screenshot | State | CI sourceHead | Inspection |
| --- | --- | --- | --- |
| `cap19-logs-default-desktop.png` | Default 360-row list/virtualization | Pending | UV |
| `cap19-logs-filtered-desktop.png` | Search and severity query result | Pending | UV |
| `cap19-logs-inspector-desktop.png` | Selected multiline/nested detail with resize | Pending | UV |
| `cap19-logs-field-filter-desktop.png` | Include/exclude promotion | Pending | UV |
| `cap19-logs-copy-feedback-desktop.png` | Copy outcome and scroll with selection | Pending | UV |

`measurements.json` is written by the module only after all assertions and captures; the shared loader verifies exact PNG set, dimensions, sourceHead, scale, semantic target and batch status. **A green workflow alone is insufficient**.

## E. Implementation mapping

- **Shared/presentation:** `TextInput`, `HighlightedText`, shared `ResizableDetailPanel` and `LogSeverityBadge`/`LogRowChevron` presentation. The virtualized row/body composition itself stays Loki-specific, as V-01 and #405 already distinguish.
- **Loki-only ownership:** `LogResultExplorer` maintains local text search, selected row, full/raw message actions and category-specific inspector fields. `LokiExplorer` owns timestamp ordering, result cohort, Builder filter promotion and provider execution. `LokiBuilderPanel` owns query-level Level selection.
- **Other local filters are not identical:** SQL-style result filter state and pattern local scoping live above the list in `LokiExplorer`; inspector include/exclude currently produces Builder predicates. Do not abstract these differing contracts or silently label them the same.
- **Copy outcome comparison:** Other query/csv copy callers use shared `clipboardText` and notifications; this log caller writes directly to `navigator.clipboard`, has no local `catch`, and does not report success or failure.

## F. Visual Convergence Atlas candidates (provisional classifications)

- **VC19-01 — CONFIRMED_DEFECT (existing V-07, not a new discovery): log-copy rejection lacks outcome feedback.** IDs L18 and X10, comparator A24 query copy / `CopySqlButton`. Existing Phase 1B synthetic denial observed an unhandled rejection with no toast; current five direct `writeText` calls bypass `clipboardText` and `notify`. Severity medium/high, implementation `LogResultExplorer`. Future direction: use the established text transport/outcome policy with payload-specific tests, separately from this audit. Confidence high from prior V-07 + source; new CAP-19 runtime pending; no OS clipboard claim.
- **VC19-02 — UNVERIFIED (nested value inspectability):** L16. `String(value)` on an object produces `[object Object]` instead of structured JSON; named source `LogResultExplorer.fields`. Long strings still wrap via CSS. Impact medium where parsed fields contain objects; high confidence source behavior, visual comparison/requirements pending. Do not declare a universal JSON inspector without comparing SQL table/detail semantics and showing evidence.
- **VC19-03 — INTENTIONAL_DIFFERENCE: local search vs query-level Level/inspector filters.** L13/L14/L17; `LogResultExplorer` local `visible`, `LokiBuilderPanel` Level and `LokiExplorer.resultFilter` query ownership. Actual UI/query evidence pending. Preserve explicit Run ownership, existing server query semantics and local count labeling; confidence high source, native synthetic still pending.
- **VC19-04 — ALREADY_CONVERGED inspector shell with legitimate content differences (V-09).** L15/L16; `ResizableDetailPanel` shared between logs and patterns while Tempo has distinct span navigation. Check current inspector resize and close against `compare-detail.png` when native captures arrive; leave source-specific labels/actions intact. Confidence high shared component, pending CAP-19 native visual evidence.
- **VC19-05 — UNVERIFIED list-row composition comparison (V-01).** L12/L15, `LogResultExplorer` vs `LogPatternExplorer` and Tempo list. Prior measured 42/58/68px row density suggests future composable-shell work tracked by #405; this batch must not treat the source-only row count as proof of scroll identity until CI is checked.

## G. Validation / CI

- Scenario commit `72597b6` started GitHub Actions **Visual preview 38769597042**, **Core CI 38769596959**, **Documentation 38769596986**.
- At this checkpoint, Documentation **passed**; Core **Unit tests, UI tests, and Production build passed**. Core Quality failed at **Check formatting**; its log identified 16 previously existing files including central register/CAP-18/NON reports/tests, **none the CAP-19 module**. Later Quality steps did not run. No local linting or formatting performed.
- First Visual preview currently processing canonical capture. No verified batch PNG/measurements/artifact ID yet; the task cannot be marked complete on this evidence.
- No shared harness, ordinary fixture, canonical manifest, production UX, workflow, central register or competing agent file changed.

## H. Disposition and next acceptance boundary

**PARTIAL — CODE_COMMITTED / EVIDENCE_PENDING.** Seven independent original inventory IDs retained without inflating source-only claims to VV/BV. To qualify as `EVIDENCE_COMPLETE`, finish GitHub Actions native Electron interaction, inspect all five original-resolution PNGs, check run/checkout/sourceHead and batch/root index, verify canonical regression unchanged, reconcile actual requests, payloads, query safety, virtual rows and clipboard failure, then update this report. Stop at CAP-19: do not merge, modify #406 directly, start CAP-20, Phase 2 or a final Atlas.
