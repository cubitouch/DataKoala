# Temporal filtering audit — #365 Phase 1

Audited `main` at `9e4b419` (including #374/#200, #373/#363 and query
lifecycle #384/#386). Phase 1 only; no Phase 2 chart controller extraction.

## Ownership and call graph

SQL (PostgreSQL, BigQuery, DuckDB, SQLite) and Prometheus use
`ResultExplorer` → `GenericResultExplorer.onBrushEnd` →
`chartTimeSelectionRange` → `createResultRangeFilter` → tab-bound store
`addResultFilter`. `filterQueryResult`/`applyResultFilters` evaluate local filters
against fetched rows. The store owns `sqlResultFilters` or `builderResultFilters`;
Result Explorer owns presentation and ECharts cursor actions, not execution.
SQL Builder promotion to query execution is a separate explicit action.

Loki uses the same Generic Result Explorer pipeline for metrics and synthetic
log volume. `LokiExplorer` binds callbacks to its session ID. Volume has
`timestamp`; raw logs have `timestampMs`. `logResultFilters` hides volume filters
in raw log views; `onClearLogResultFilters` removes only visible raw filters.
Chart Clear all uses the shared full collection. Neither brush path changes
`lokiTimeRange`, runs LogQL, nor fetches finer-resolution buckets.

Tempo uses `TraceScatterChart.brushEnd` → `traceScatterLocalRange` →
`TraceExplorer.localRange`. `visibleSearchRows` compares search-summary
`startTimeMs` with the interval and supplies List, Scatter and Service Map.
The shared chip is derived presentation, not a second filter authority. Filtering
selects whole retrieved traces; spans inside matching traces remain intact.
Service Map reaggregates cached matching analyzed summaries, with explicit
partial/sample coverage. Widening/clearing does not automatically fetch missing
full traces; explicit Re-analyze can. This is distinct from a TraceQL search.

Query requests remain owned by the session operation contract from #384/#386.
Result completion/revision and optional Loki trend loading retain their existing
ownership; local filters do not begin or supersede a primary query operation.

## Behavior comparison

| Operation                 | SQL / Prometheus / Loki (shared charts)                                                                                                                                                                        | Tempo Scatter                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normalize start/end       | Orders coordinates; category indexes or matching timestamps resolve to selected points; otherwise parses real-time boundaries.                                                                                 | Numeric coordinates ordered before clamping.                                                                                                                 |
| Reverse / invalid         | Reverse supported. Missing/non-temporal/non-finite/unparseable boundaries rejected.                                                                                                                            | Reverse supported. Missing/non-finite/unparseable coordinates rejected.                                                                                      |
| Domain clamping           | Selection converter does **not** clamp real-time bounds. Viewport intersects client ranges with explicit domain, then expands to returned values; an empty intersection falls back to the original domain.     | Clamps to resolved query domain; fully outside selection rejected. Full query axis remains visible.                                                          |
| Zero / narrow             | Equal real-time bounds rejected; no minimum positive width. A category single-point selection includes its bucket, next point boundary, or final point +1 ms.                                                  | Rejects width below `max(1000 ms, 0.002 × domain width)` **after** clamping; threshold itself accepted.                                                      |
| Precision / timezone      | ISO UTC at JS Date millisecond precision; explicit offsets resolve to the same instant. SQL Builder bucket extension uses UTC `timeBucketRange`. Real-time coordinates retain bounds without bucket extension. | Numeric millisecond interval; picker resolves custom values in UTC. No bucket rounding or minute conversion.                                                 |
| Interval boundaries       | Inclusive start, exclusive end; category selection includes the last selected point by extending end.                                                                                                          | Inclusive trace-summary start, exclusive end; durations/spans do not determine membership.                                                                   |
| Create / visibility       | Stable deduplicated filters; shared chips. Loki volume filters hidden from raw logs.                                                                                                                           | One transient interval, one derived shared chip and visible/retrieved count.                                                                                 |
| Remove one                | Removes chosen filter and recomputes from original rows.                                                                                                                                                       | Clears interval and restores retrieved traces.                                                                                                               |
| Clear all                 | Removes collection; Loki raw Table clears only visible raw filters, preserving hidden volume filters.                                                                                                          | Clears the single interval. Cached map coverage may be partial on widening.                                                                                  |
| Repeat selection          | Accumulates AND/intersection filters; equivalent filters deduplicate. Valid selection clears ECharts brush and reactivates cursor. Invalid shared selection returns before cursor reset.                       | Replaces interval; valid or rejected selection clears brush and reactivates cursor.                                                                          |
| Refresh / rerun           | Ordinary result commit preserves filters, including non-overlapping filters. Explicit clear/reset and preset load remove local filters; persistence retains session filters.                                   | Search start (including failure), picker edit, generation/session/connection change, reset/preset clear the transient interval; remount does not persist it. |
| Chart-triggered execution | Brush/remove/clear perform no primary query. SQL query-filter promotion is separate. Loki chart/view may independently load optional volume under existing eligibility rules.                                  | Brush/remove/clear perform no TraceQL search; explicit Service Map entry/Re-analyze can load trace details.                                                  |
| Explicit picker execution | SQL Builder and Prometheus edit criteria, executed by Run. Loki reruns on changed range once it has run. SQL raw has no shared time picker.                                                                    | Edits criteria and clears local interval; Run explicitly fetches.                                                                                            |

Bucketing remains datasource-specific: SQL Builder may return UTC buckets;
Prometheus has already fetched step-based samples; Loki has already fetched
aggregated volume points. Client filtering does not change SQL grouping,
Prometheus step or Loki resolution. Tempo retrieved traces and its additional
representative analyzed sample never imply full underlying population coverage.

## Duplication inventory and stopping decision

- Shared filter creation/evaluation, domain calculation and range conversion
  already live in pure library modules. Keep these boundaries.
- The two brush paths both order endpoints and dispatch ECharts cursor actions,
  but their coordinate interpretation, minimum width, domain and filter ownership
  differ. Extracting their few common expressions would add an API while hiding
  these differences. Leave them separate; cursor lifecycle is Phase 2A territory.
- Repository-wide search found no production `lokiRangeHistory`,
  `onTemporalRangeSelected` or `traceScatterCustomRange`. #374 already deleted
  history, navigation callbacks, conversion and persisted-field handling.
  Remaining history references are intentional legacy-input rejection tests.
- No obsolete production path or beneficial new helper was found. This slice
  changes documentation and tests only; no public props, stored formats, runtime
  state, fetch behavior or timestamp policy change.

## Regression evidence and limits

Added `chartRangeSelection.test.ts` cases for invalid boundaries in either
position, reverse offset timestamps, unclamped real-time edges, one-millisecond
intervals and equal real-time endpoints. Added `TraceScatterChart.test.tsx` cases
for non-finite/invalid/zero/outside ranges, post-clamp minimum width and its exact
threshold. Existing cursor tests protect reactivation on accepted/rejected brush.

Added SQL/Prometheus tests through the **real** Result Explorer and store in
`GenericResultExplorer.test.tsx`: reverse brush → exact half-open filter, remove,
clear, repeat, preserved filters on result revision, retained callback isolation
across tabs, and query spies asserting no SQL/Prometheus/Loki execution. Existing
Loki UI tests cover multi-series buckets, visible/hidden clear scope, query-spy
counts and explicit picker refresh; Tempo editor/cohort tests cover query-spy
counts, List/Scatter/Service Map consistency, half-open sample filtering,
picker/reset/generation/preset invalidation and cached partial map coverage.

Boundary caveats are documented rather than changed: generic numeric values use
JavaScript Date conversion and category-index detection; Tempo uses Number
coercion. These are not identical validators. Values beyond Date's representable
range, malformed domains or sub-millisecond coordinates are not a new supported
contract here. Neither test mocks ECharts pixel geometry nor live provider
resolution; real cursor/pixel interactions remain release testing.

## Manual release handoff — #382 RC-05

Keep these pending until the frozen v0.2.1 candidate; extend RC-11/16 for deeper
Loki/Tempo view checks and RC-13–16 for pending-query lifecycle cases.

1. For a SQL temporal result, Prometheus `up`, grouped Loki volume, and Tempo
   sampled search: note picker/loaded count and requests. Brush forward then
   backward; verify a chip, half-open matching data and unchanged picker/primary
   request count. Try a single-point/very narrow drag: shared category charts can
   retain one point/bucket; Tempo ignores accidental tiny drags.
2. Remove, repeat and clear: SQL/Prometheus/Loki accumulate intersecting filters;
   Tempo replaces one interval. Clearing restores original fetched points/traces
   without new primary requests. Loki buckets/step must not become finer; Tempo
   List/Scatter/Map must agree on matching whole traces and sample coverage.
3. Keep a filter while explicitly changing picker: Loki refreshes after an
   existing run; SQL Builder/Prometheus/Tempo fetch through Run. Shared filters
   remain removable even if new results do not overlap; Tempo clears its interval.
   Raw SQL has no picker. Confirm local brush alone never performs this fetch.
4. Filter tab A, switch to B, filter/clear B and return to A. Shared filters stay
   tab-scoped; Tempo's transient interval clears on workspace/session change.
   Confirm neither action changes the other tab's query interval/results.
5. Extend RC-11 with mixed Loki Table/Line filtering to verify visible-only Table
   Clear all; extend RC-16 with map widening to verify cached/partial coverage and no
   automatic missing-trace fetch until explicit Re-analyze.

Risk is low: no production changes. No targeted premerge manual pass is required
by this audit. A later semantic change to thresholds, timestamp conversion,
clamping, filter lifetime or map sampling should receive targeted premerge tests
and separate review. Leave Phase 1 unchecked until review/merge; do not start 2A.
