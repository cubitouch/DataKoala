# Tempo presentation — #521 / #526

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

Trace timestamps now lead each row with unchanged formatting. The trailing ID column is removed; operation fallbacks, internal identity and details retain the ID. Status, duration and matched-span counts remain.

Tempo uses the existing View toolbar with only List, Scatter and Service map. The shared picker gains the map icon and an optional disabled list to preserve the prior search-in-progress policy. Default SQL/Loki choices are unchanged. No provider or map-analysis behavior changed.

Retest canonical V07 and W01–W06: normal/missing-root rows, long service/operation names at desktop and narrow widths, pointer/Enter/Space opening, ID in details/copy, all three views and an existing SQL/Loki picker. Preserve coverage and local-filter summary while switching; verify zero primary requests and no automatic map analysis. Native rendering and human acceptance Pending (local Electron socket restrictions).
