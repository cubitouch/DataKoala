# Query-tab anomaly retention — #528

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

The hook previously kept analysis/request/sample state inside the mounted chart and cancelled on cleanup. Give production consumers a stable query-tab/scope owner. Runtime resources retain completed analysis, exact submitted sample mapping, loading/error and visibility; inactive completion publishes only to its resource. Returning does not submit another AI/query request. Standalone consumers keep component ownership.

Source result/revision, query-context/profile and connection generation guard retirement. Store observation releases closed/reset/replaced inactive owners and cancels their pending requests; replacement analysis retires the old request. Nothing is serialized to workspace/profile storage. Presentation-only chartTimeDomain is removed from the semantic AI key so a relative-axis rerender does not discard identical sampled data. Actual X/Y/series/view/filter changes retain invalidation.

Settings initially loading on remount are distinguished from confirmed disabled configuration, preserving pending analysis until configuration is known.

Deterministic regressions cover complete away/back, sample-to-point mapping and display toggle, independent A/B resources, inactive completion, replacement/removal and late responses, alongside existing supersession/cancellation tests. Native overlay/details inspection and live-provider acceptance Pending (local Electron sockets blocked).

Retest canonical AI/chart RC-05B: analyze A, switch to B/analyze differently, return A; repeat delayed inactive completion, visibility toggle, point/details mapping and new-result invalidation. Count no automatic AI/query reruns. Human acceptance Pending.
