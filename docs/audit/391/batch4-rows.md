# Batch 4 shared observability rows — #405

**Implementation merged:** PR #507, `f6327fefa9e844e48bd11cd1638b73d7a4e496de`, 2026-10-21 (Europe/Paris). **All consolidated manual acceptance remains Pending.**

Base: `09df6c957f7db113ed04f8a9a48f9affb872d628`. Implemented independently in PR #507; no dialog/statistics prerequisites.

## Inventory and shared API

| Consumer         | Existing behavior                                                                              | Change / retained responsibility                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loki Log List    | Virtualized by index; 42 px estimate; native button opens a side inspector                     | `ObservabilityRow` owns the shell; ID keys, measured variable heights and focused identity retention; timestamp, severity, message, search/copy/filter and selected-log ID stay local                          |
| Loki Patterns    | Virtualized with stable cluster IDs, 58 px fixed rows; button opens inspector; promotion guard | Same shell and 42 px minimum, measured content growth and focused identity retention; clustering, counts/percentage/severity/template, inspector and promotion remain local                                    |
| Tempo Trace List | Non-virtualized native buttons; three metadata lines, no trailing chevron                      | Same shell/chevron; metadata flows inline and wraps as needed; status, root service/operation, duration/date/matched spans or ID, disabled state and trace navigation stay local; no new virtualization scheme |

`ObservabilityRow({ leading, children, trailing, actions, onOpen, selected, disabled, label })` owns dimensions, font/spacing, separator, hover/selected/focus and the trailing chevron. `actions` are sibling controls outside the native opener, avoiding nested buttons. No `onOpen` means no button/chevron. Mouse text selection does not dispatch an opening; native Enter/Space still uses the button's activation semantics. No provider model/query/persistence enters the primitive.

Single-line minimum is centrally 42 px. Long/multiline content wraps and grows rather than being clipped to force parity. Virtualized callers measure actual articles and pin a focused item's ID when neighbors recycle. `focusedRowRange` adds that identity to the ordinary overscanned viewport without rendering the whole list. Reordering/filter removal cannot transfer the old node's action to a different key. Tempo's status/metadata structure changed from stacked to flowing slots to use the same single-line density.

This implements requested composition convergence. The old independent CSS/estimates are source facts; actual before/after parity is established only by the native measurements, not by source/jest geometry.

## Validation and native evidence

Local `pnpm verify`: renderer controls/dead code/imports, format, lint, typecheck, 548 main/shared tests (5 skipped), 691 renderer/integration tests including SQLite, 32 script tests and build passed. It stops at `pnpm smoke`, which spawns `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` on Linux (ENOENT). Full UI-suite and advisory duplication results are in the PR.

Local native Electron execution is unavailable (no display/Xvfb; headless attempt SIGSEGV). `Batch 4 Observability Row Regression` captures actual PR base/head at fixed viewport and zoom, measures all three rendered row boxes and right-edge chevron offsets, exercises native Enter/Space against actual consumers, long content at narrow width, and a 5,000-row log list with focused off-screen identity. Artifact: `batch4-row-evidence`, including original-resolution PNGs and measurements keyed to full source SHAs. The pattern component's existing large-list/selection/promotion regressions remain in the UI suite. CI fixtures are not live-provider or human acceptance.

## Consolidated owner checks — all Pending

Reuse RC-07/09/11/16/18/20/21/22; record exact package/SHA, OS/provider, Pass/Fail/Untested and evidence in #382.

1. At the same zoom, font and pane width, show a short Loki log, short pattern and short Tempo trace. Expected: equal single-line row height, aligned trailing chevron, consistent separators/hover/focus. Preserve each source's meaningful metadata.
2. Click a row, then repeat with Enter and Space. Expected: correct log/pattern/trace detail, no extra primary query for local selection, correct trace ID for trace detail. Selected/focus appearance remains clear.
3. Select/copy text, use inspector copy/context/filter controls, and activate a separate row action where available. Expected: exact copy, no accidental row opening from a sibling action, unchanged Patterns promotion guard and query/filter behavior.
4. Use multiline/long content and narrow panes; resize the inspector. Expected: content can grow, actions remain reachable, no artificial clipping or scroll overlap.
5. Load representative large log and pattern lists. Focus a row, scroll far enough to recycle neighbors, then activate it. Expected: bounded rendered rows, stable identity, correct inspector, no jump to another item or lost scroll position. Filter away the item and confirm no stale action.
6. Repeat range/filter changes, rerun/failure/reset/preset, and Tempo trace return/navigation. Expected: no stale detail/results, no extra requests or ordering/persistence changes. Reuse packaged RC-21 and provider RC-22 outcomes.

Implementation is merged; no release has been published. All manual acceptance remains Pending.
