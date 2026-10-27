# Tempo local Scatter viewport — #522

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

The chart always forced searchRange onto its x-axis, regardless of the active local interval. Forward the local interval into the display domain. Preserve half-open membership in the parent and tiny-drag rejection. Empty selected cohorts retain the Scatter canvas with the selected axis.

The search controller records resolved request bounds against the loaded result in a runtime WeakMap. Returning to the tab restores the original extent without resolving a rolling range against a later clock. No query-range mutation, fetch or durable serialization is introduced; result replacement gets its own bounds.

Retest canonical V/local temporal-filter and C brush scenarios (RC-05/16): forward/reverse, replacement/clear, empty/single trace, repeated brush after fit and tab isolation. Check exact millisecond start-inclusive/end-exclusive membership against List/map and preserve sampling language. Real ECharts geometry remains Pending due local Electron socket restrictions; mock option assertions alone do not establish native acceptance. Coordinate adjacent chart-lifecycle #524 without duplicating this change.
