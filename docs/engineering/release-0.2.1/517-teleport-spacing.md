# Teleport form spacing — #517

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

The revealed grid had no separation from its preceding checkbox. A scoped 12px top margin now separates the fields in both create and edit dialogs. No connection or submission code changed.

`manual-17` captures create at 1440×900 and edit at 900×900, measures the rendered gap, and verifies collapse. The Teleport Spacing Regression workflow publishes its screenshots and measurements. Local Electron capture is unavailable: native socket creation is blocked (exit 139). Rendered evidence remains Pending until that workflow succeeds; no screenshots are claimed here.

Owner retest: canonical D03/D15 and T02/T03 — enable/disable Teleport in create/edit, check spacing and keyboard focus at normal/narrow widths. Live/native acceptance remains Pending. Do not rerun CI locally.
