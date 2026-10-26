# EXPLAIN readability — #518

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

The graph row only had an intrinsic 380px minimum; the surrounding column left unused height. Give the row a viewport-responsive minimum and allow it to grow. Narrow screens retain a tall graph above the inspector.

Initial scale now starts at 85–100% with the root visible rather than shrinking the entire tall/branching plan into a tiny overview. Explicit Fit plan still supplies the full overview; zoom, pan, keyboard node selection and inspector are unchanged. Node titles/metrics are larger, optional lines close up, and sparse cards shrink to their actual content.

Evidence: the existing EXPLAIN native Visual Preview fixture covers a tall branching Analyze plan. Local Electron capture cannot launch (native sockets blocked, exit 139); rendered before/after evidence and short/tall/narrow pan/Fit/inspector checks remain Pending. No graph interaction reruns EXPLAIN or AI.

Owner retest: canonical EXPLAIN section and RC-14. Use short, tall and branching plans in tall/short/narrow windows; check initial root readability, Fit overview, zoom/pan and node details. Human and native acceptance Pending.
