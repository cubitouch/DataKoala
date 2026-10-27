# Compact BigQuery statistics — #519

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

One shared QueryStatistics consumer supplies both table and chart headers. Keep returned/visible rows, columns, request duration and a capped marker inline; move all existing detailed metrics into the standard accessible Modal. Zero/cache miss, Script-parent versus final-output scope, billed/processed bytes and total/capped rows retain their meanings. Metadata remains derived from the current displayed result; no provider request is added.

An open modal is tagged with the exact result object. Replacement/failure unmounts its old contents immediately, and tab/profile workspace unmount releases it. The current trigger is the focus-return target. Regressions cover zero/invalid/script/capped data, production table replacement, Escape/focus and replacement while open.

Retest: canonical G08–G13, D03/D15, chart header C01. Inspect normal/narrow Table and chart controls, full details and focus; use a script and capped result. Native rendering and live BigQuery acceptance Pending (local Electron socket restriction, exit 139). Automated checks are not human acceptance.
