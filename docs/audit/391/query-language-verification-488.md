# Query-language verification — #488 / VIS-07

Verified against main `4994e7ca662681337e01418838059c33dfda667a` for the approved v0.2.1 scope. No additional reachable wrong-language labels were found. The original PromQL copy-label defect is already fixed by #453 / PR #458. This follow-up records coverage rather than manufacturing a production UI change.

| Datasource  | Query language shown | Meaningful dialect context                                                 |
| ----------- | -------------------- | -------------------------------------------------------------------------- |
| PostgreSQL  | SQL                  | PostgreSQL dialect in editor/formatter and AI context                      |
| BigQuery    | SQL                  | GoogleSQL dialect in editor/formatter and AI context                       |
| Local files | SQL                  | DuckDB dialect                                                             |
| SQLite file | SQL                  | Queried through DuckDB; a SQLite source does not imply SQLite query syntax |
| Prometheus  | PromQL               | Prometheus editor and generated Builder expression                         |
| Loki        | LogQL                | Loki raw editor and generated Builder expression                           |
| Tempo       | TraceQL              | Tempo raw editor and generated Builder expression                          |

## Reachable surface audit

- `ModeSwitch.tsx` derives the raw-mode label from `queryLanguageForSourceKind` and the active tab's profile. SQL mode's internal key remains `sql` for all providers; that persisted key is not presented as a language name. `App.tsx` blocks a restored workspace's query surface until its profile resolves, rather than rendering a guessed SQL editor for Loki/Tempo/Prometheus.
- `QueryEditor.tsx` serves SQL/PromQL; editor labels, formatting tooltip, fallback format error and Copy label distinguish them. The #458 accessible PromQL copy fix is preserved in Raw and Builder. `LokiExplorer.tsx` and `TraceExplorer.tsx` own their provider-specific editors, copy controls, formatting and query validation messages.
- `GeneratedQueryPanel.tsx` receives SQL, PromQL, LogQL or TraceQL from its respective Builder; disclosure heading, editor accessible label, Copy and Open-in-language action use the same prop. Provider Builder tests verify the actual callers and exact handoff query.
- `CopySqlButton.tsx` has a historical component name but receives the current display language. Its success/error announcements are language-neutral, not incorrect SQL announcements. Results Copy/Export controls describe CSV payloads; Loki diagnostics and Grafana handoff labels describe their respective payload/destination.
- SQL filter promotion's `Apply to SQL` and query-owned SQL badge are accurate in their reachable path: SQL `ResultExplorer` in Builder mode. Prometheus uses the raw result mode for its generated query, and Loki passes client filters to `GenericResultExplorer` without SQL promotion callbacks; Tempo has its own results. No generic filter abstraction or persisted-filter change is warranted by this audit.
- SQL AI messages are confined to supported SQL contexts; they do not appear as PromQL/LogQL/TraceQL controls. Existing dialect mapping and SQL generation are unchanged.

## Added verification coverage

- All seven providers' ModeSwitch names and accessible button names, Raw/Builder round trips, cold serialization/restoration with seven tabs, switching tabs, and rebinding the mounted tab's profile without stale terminology or query-text mutation.
- All four languages' generated headings, editor labels, Copy labels/payloads and handoff actions on the same mounted panel.
- All four languages' Copy accessible names and exact payloads with neutral live feedback, including PromQL's prior regression.
- Complete lower-case query-language mapping checks for Loki and local files in the existing query-default tests.

These are characterization/regression safeguards for behavior already present on main. They are expected to pass before this PR; they are not presented as newly reproduced failures.

## Consolidated manual acceptance — Pending

1. Open one tab per provider above. Verify Raw mode name, editor accessible name, Format tooltip where present, and Copy accessible name. SQL sources must retain their actual dialect behavior.
2. Switch to Builder. Expand Generated query where available: heading, preview, Copy and Open-in-language action must agree. Copy and explicit handoff must preserve the generated expression. Ordinary mode switching must preserve the separate raw draft.
3. Switch repeatedly between SQL, Prometheus, Loki and Tempo tabs, rebind a tab to another profile, then restart with restored tabs. No stale language label or query replacement should appear. No automatic query should run during restoration.
4. With a screen reader, verify PromQL is announced for its Copy control in Raw and Builder. Successful/error clipboard notifications may use neutral wording. Check CSV exports remain described as CSV.

No release tag/publication or consolidated manual pass is implied. This branch changes tests and this record only; it has no runtime dependency or production overlap with #492/#493/#494, #484 or #489.
