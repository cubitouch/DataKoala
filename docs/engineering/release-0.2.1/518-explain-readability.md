# EXPLAIN readability and explicit height — #518

Refreshed main: `d51abb4ed247371bc678c4c6262876c9b93cbf2d`. Owner clarification supersedes the earlier automatic-height-only implementation.

A visible horizontal separator directly resizes the actual diagram canvas, independently of zoom or application window size. Drag in either direction; focus it and use Up/Down (24px), Home/End (bounds). Accessible orientation/name/current/min/max values follow the actual graph height. Height remains session-local across node selection, inspector changes and ordinary rerenders. Window/container measurement clamps it to available viewport space; the content remains scrollable to reach the inspector at narrow widths.

Pointer capture handles release, cancellation, loss and unmount without global move listeners. JointJS continues observing its container: resize does not rebuild the plan, Fit it, reset pan/zoom or execute work. Larger fonts, compact cards, readable initial scale and explicit Fit remain intact. No storage migration.

Focused tests cover actual slot resizing, pointer identity/cancel/unmount, keyboard/bounds/window shrink and graph mount stability. Dedicated native before/after captures include two pointer-selected heights in the same 1440×1000 window, selected node/transform preservation, actual canvas/SVG dimensions, keyboard min/max and window shrink, short/branching plans, native pan/zoom/Fit and query/AI call counts. Final artifacts/checks are linked in the PR receipt. Local Electron native sockets and disposable DB prerequisites remain unavailable; this is not a local verify pass.

Retest extension E01: mouse/keyboard height changes in one window → node/inspector/pan/Fit → short/narrow window shrink and bounds. Reuse prior Explain/Analyze acceptance; human/live acceptance remains Pending against the selected exact candidate. No merge/tag/release.
