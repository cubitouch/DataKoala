# Single-line Loki rows and stable Patterns columns — #523/#529

Refreshed main: `d51abb4ed247371bc678c4c6262876c9b93cbf2d`. Owner clarification adds numeric-column alignment to the prior severity-only correction.

Patterns uses distinct fixed grid slots for count and percentage, right-aligned with tabular numerals; a stable label/separator slot separates them. Count is bounded to five character widths, percentage to six. Larger values ellipsize and retain exact values in title/accessibility text and the unchanged inspector. Percentage display retains the established one-decimal policy; its title exposes the unrounded value. No count/clustering/query/filter computation changes.

Both Logs/Patterns retain the shared 88px severity slot, including missing/custom levels, and one-line ellipsized previews with original details/copy. The small row-gap adjustment is scoped to Patterns so narrow main panes still contain the chevron. Ordinary Logs and Tempo row policies are unchanged.

Native geometry now uses a coherent 10,000-log fixture with counts 1/10/990/1000/7999 and 0.1%/9.9%/10.0% values, plus a single 10,000/100.0% pattern. It measures count, percentage and severity widths and all start positions at desktop/narrow widths, with an inspector, and after scrolling a 600-pattern virtualized list. Existing 5,000-log virtualization, keyboard/detail identity and original-copy unit checks remain. The workflow captures the previous draft with the same mixed-count fixture and the corrected head. Final artifacts/checks are linked in the PR receipt.

Retest extension W01–W06/L09/L10: mixed count/percentage/level lengths → alignment → narrow/scroll/inspector → original copy/details and View logs. This supersedes Loki W04's old natural-height wording; Tempo is outside the one-line policy. Human/live acceptance remains Pending against an exact selected candidate. No merge/tag/release.
