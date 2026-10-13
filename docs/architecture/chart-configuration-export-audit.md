# Chart configuration and export — #365 Phase 2C

Pre-edit audit: latest main `eca8c39`, including #389/#390/#392 and #384/#386.

## Current ownership and proposed boundaries

`ResultExplorer` binds configuration changes to tab and mode; the store and existing
workspace/preset serializers own persistence. `GenericResultExplorer` receives a
controlled configuration and reconciles it with returned columns. Existing
`resultVisualization` owns inference, effective defaults, equality and hierarchy
reconciliation; `chartHierarchy` owns cardinality and suggested ordering.
`chartPresentation` turns derived data into ECharts options, not stored settings.

The remaining series selection and view-entry rules are pure transitions. Add them
to the existing domain module, together with bounded hierarchy reordering. Keep
simple patch spreading, axis/unit/scale dispatch and dimension assignment in the UI:
extracting those one-line operations would merely relocate complexity. Do not
change inference, normalization or persistence. In particular, saved nonempty but
invalid hierarchy selections reconcile to empty rather than adopting suggestions.

Capture already uses `chartImage`: hide pointer state, await paint, get PNG, compose
all legend labels, preserve pixel ratio/background, write clipboard or save binary
with `datakoala_chart.png`. `ChartReadinessController` and chart application own
render completion; the component enables actions only for finished applied options
and no primary pending/error state. These responsibilities remain in place.

A focused `useChartExport` hook will own the two mutually exclusive actions, capture
request validity, notification/feedback timer and cleanup. It delegates image work
to existing utilities and receives the chart instance and committed display context.
It does not render ECharts, query, persist, or become a general request framework.

## Verified coupling and gaps

The component duplicates copy/export busy/error/finally coordination. Existing
capture checks readiness only after PNG generation. A configuration/result change
before its next animation-frame application may still pass that check. Changes
while clipboard/save awaits can then report success for an obsolete chart; unmount
can still notify, and React state alone does not block two same-turn actions.
Invalidate on committed candidate revision/options, result identity and owner,
including view replacement; synchronously exclude repeated actions. Check validity
before capture, after image creation, and after platform completion. Context cleanup
suppresses late success/error/finally and clears transient state. Already-issued
clipboard writes/save dialogs cannot be physically undone; no cancellation promise
is added. Request a fresh explicit action on the new chart.

## Contracts and release handoff

Public props, persisted configuration shape/serialization, axis/default/aggregation
rules, chart rendering and query semantics remain unchanged. Existing image content,
dimensions, legend composition, filename, clipboard bridge, readiness requirements,
copy notifications and export feedback remain unchanged for current operations.
Pure and deferred-promise regressions protect transitions and lifecycle; existing
Phase 1/2A/2B tests remain retained. Live pixels/native clipboard belong to RC-05C.
All human acceptance cases remain pending for consolidated v0.2.1 testing.
