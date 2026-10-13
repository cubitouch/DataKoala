# DataKoala — Datasource feature inventory and UX ownership audit

**Reviewed:** 2026-10-13 · **Repository:** https://github.com/cubitouch/DataKoala · **Scope:** default-branch source inspection, read-only.

## Read this first

This is a **source-guided audit**, not a live seven-datasource manual test. `Present` means an implementation entry point or relevant UI was found, **not** that execution has been tested end to end. `Conditional` means dependent on result representation, profile configuration or other conditions. `Verify` identifies behavior requiring further tests. `N/A` means deliberately not supported. Features and workflows in unmerged PRs are not counted as delivered. Lifecycle audit findings may be superseded by ongoing issue #371 changes.

**UX ownership:** `Shared` = same user contract/control; `Hybrid` = shared shell/pattern, datasource-specific semantics; `Unique` = meaningful datasource-specific experience.

**Kinds:** `PG` PostgreSQL; `BQ` BigQuery; `LF` local-files/DuckDB; `SQ` SQLite via DuckDB; `PM` Prometheus; `LK` Loki; `TP` Tempo. `SQL4` = PG/BQ/LF/SQ; `OBS3` = PM/LK/TP; `ALL` = all seven.

## A. Shared shell and workspace

| ID  | Atomic feature                        | Kinds | Evidence / status                            | UX owner | Manual verification                 |
| --- | ------------------------------------- | ----- | -------------------------------------------- | -------- | ----------------------------------- |
| A01 | Create connection/profile             | ALL   | Sidebar, ConnectionModal; Present            | Shared   | Create profile of each kind         |
| A02 | Edit profile                          | ALL   | Sidebar connection actions; Present          | Shared   | Edit and reconnect each kind        |
| A03 | Delete profile                        | ALL   | Sidebar; Present                             | Shared   | Confirm tab binding and errors      |
| A04 | Connect on demand                     | ALL   | useStore, tabConnection; Present             | Shared   | First activation, background tabs   |
| A05 | Disconnect / reconnect                | ALL   | useStore, ConnectionStatus; Present          | Shared   | Disconnect mid-query                |
| A06 | Connection status/indicator           | ALL   | ConnectionStatus, Sidebar; Present           | Shared   | Idle/connecting/failed/reconnecting |
| A07 | Failure recovery/feedback             | ALL   | useStore, connectionLifecycle; Verify        | Shared   | Transient vs invalid credentials    |
| A08 | Connection generation invalidation    | ALL   | useStore; Verify                             | Shared   | Replace connection mid-query        |
| A09 | Discovery object loading              | ALL   | Sidebar, adapters; Present                   | Hybrid   | Source-specific hierarchy           |
| A10 | Search/filter object tree             | ALL   | Sidebar; Present                             | Shared   | Token search and clear              |
| A11 | Object metadata refresh               | ALL   | Sidebar; Present                             | Shared   | Refresh during active query         |
| A12 | Object metadata loading/error/retry   | ALL   | Sidebar; Present                             | Shared   | Empty and failed metadata           |
| A13 | Lazy column/label/attribute discovery | ALL   | Source-specific resources; Conditional       | Hybrid   | Retry and stale responses           |
| A14 | New query tab                         | ALL   | QueryTabs; Present                           | Shared   | Shortcut and identity               |
| A15 | Rename tab                            | ALL   | QueryTabs; Present                           | Shared   | Persist after restart               |
| A16 | Close/switch tab                      | ALL   | QueryTabs; Present                           | Shared   | Running query then remount          |
| A17 | Bind tab to profile                   | ALL   | useStore, Sidebar; Present                   | Shared   | Change while request pending        |
| A18 | Tab running indicator                 | ALL   | QueryTabs; Verify                            | Shared   | Run, error, disconnect, explain     |
| A19 | Persist drafts/layout                 | ALL   | querySessions/useStore; Present              | Shared   | Restore all seven kinds             |
| A20 | Query mode (raw/Builder)              | ALL   | ModeSwitch, source workspaces; Present       | Shared   | Toggle without losing state         |
| A21 | Saved exploration preset CRUD         | ALL   | PresetManagerAction; Present                 | Shared   | Save/load/rename/delete each kind   |
| A22 | Preset compatibility guard            | ALL   | explorationPresets; Present                  | Shared   | Load after changing source          |
| A23 | Reset exploration confirmation        | ALL   | QueryUtilityActions; Present                 | Shared   | Same meaning across kinds           |
| A24 | Notifications and clipboard feedback  | ALL   | NotificationArea and source actions; Present | Shared   | Success/failure accessibility       |
| A25 | Resizable workspace regions           | ALL   | App, source workspaces; Present              | Shared   | Drag/keyboard/restoration           |

## B. SQL family: PG / BQ / LF / SQ

| ID  | Atomic feature                             | Kinds | Evidence / status                              | UX owner | Manual verification                |
| --- | ------------------------------------------ | ----- | ---------------------------------------------- | -------- | ---------------------------------- |
| S01 | SQL editor (CodeMirror)                    | SQL4  | QueryEditor; Present                           | Hybrid   | Language and shortcuts by dialect  |
| S02 | SQL syntax highlighting                    | SQL4  | QueryCodeEditor; Present                       | Hybrid   | PG, GoogleSQL, DuckDB              |
| S03 | Metadata-aware completion                  | SQL4  | QueryEditor/buildSqlCompletionSchema; Present  | Hybrid   | Qualified names and suggestions    |
| S04 | SQL format command                         | SQL4  | QueryEditor; Present                           | Shared   | Dialect correctness                |
| S05 | Run SQL command/shortcut                   | SQL4  | QueryEditor; Present                           | Shared   | Errors and blank query             |
| S06 | Copy SQL                                   | SQL4  | CopySqlButton; Present                         | Shared   | Clipboard errors                   |
| S07 | SQL result table                           | SQL4  | ResultExplorer/ResultsTable; Present           | Shared   | Data typing and limits             |
| S08 | SQL Builder relation selector              | SQL4  | builder/sql/BuilderPanel; Present              | Shared   | Schema/table search                |
| S09 | Independent Builder time column            | SQL4  | BuilderPanel; Present                          | Shared   | Non-temporal X with time filter    |
| S10 | Time range incl. rolling/custom            | SQL4  | BuilderPanel/TimeRangeField; Present           | Shared   | Endpoints/timezones                |
| S11 | Time bucket                                | SQL4  | BuilderPanel; Present                          | Shared   | Minute/year, empty buckets         |
| S12 | X-axis selector                            | SQL4  | BuilderPanel; Present                          | Shared   | Type restrictions                  |
| S13 | Y-axis selector                            | SQL4  | BuilderPanel; Present                          | Shared   | Count without Y                    |
| S14 | Grouping series selectors                  | SQL4  | BuilderPanel; Present                          | Shared   | Multi-series cardinality           |
| S15 | Aggregation Count/Sum/Avg/Min/Max          | SQL4  | BuilderPanel; Present                          | Shared   | Generated SQL and types            |
| S16 | Safe generated SQL                         | SQL4  | builderSql/adapters; Present                   | Hybrid   | Parameterization and escaping      |
| S17 | Generated SQL preview/copy                 | SQL4  | BuilderPanel; Present                          | Shared   | Correct dialect                    |
| S18 | Promote compatible filters to source query | SQL4  | ResultExplorer, resultFilters; Conditional     | Hybrid   | Promotion, demotion, provenance    |
| S19 | Local/client result filtering              | SQL4  | GenericResultExplorer; Present                 | Shared   | Chart/table transition             |
| S20 | Export/copy result as CSV                  | SQL4  | ResultsTable; Present                          | Shared   | Filtered vs full retained rows     |
| S21 | JSON/structured value inspector            | SQL4  | ResultsTable; Conditional                      | Shared   | Native and string JSON             |
| S22 | EXPLAIN plan view                          | PG    | DATA_SOURCE_CAPABILITIES, ExplainPane; Present | Unique   | Query without executing changes    |
| S23 | EXPLAIN ANALYZE view                       | PG    | DATA_SOURCE_CAPABILITIES, QueryEditor; Present | Unique   | Lifecycle and guard, #371          |
| S24 | AI query proposal and review               | SQL4  | AiQueryCopilot, QueryEditor; Conditional       | Hybrid   | Each SQL dialect                   |
| S25 | AI query error repair                      | SQL4  | AiQueryRepair, QueryEditor; Conditional        | Hybrid   | Trigger and action safety          |
| S26 | AI metadata context expansion              | SQL4  | AI workflow; Conditional                       | Hybrid   | Context budgets and discovery      |
| S27 | Multiple SQL statements                    | SQL4  | QueryEditor/adapters; Varies                   | Hybrid   | Validate allowed syntax by adapter |
| S28 | Source-specific safe read-only execution   | SQL4  | adapters/types; Present                        | Hybrid   | Rejected writes and failures       |

## C. Connection-type-specific features

| ID  | Atomic feature                       | Kinds | Evidence / status                                 | UX owner | Manual verification                |
| --- | ------------------------------------ | ----- | ------------------------------------------------- | -------- | ---------------------------------- |
| C01 | PG host/port/database/user/password  | PG    | PostgresConnectionModal; Present                  | Unique   | Test validation                    |
| C02 | PG pasted connection-string formats  | PG    | PostgresConnectionModal; Present                  | Unique   | JDBC/libpq/psql cases              |
| C03 | PG TLS mode and PEM CA               | PG    | PostgresProfile, PostgresConnectionModal; Present | Unique   | Insecure/verifying modes           |
| C04 | PG OS-backed password storage        | PG    | main secure-store; Present                        | Unique   | Save/migration/unavailable storage |
| C05 | PG read-only profile option          | PG    | PostgresProfile; Present                          | Unique   | Enforced server-side               |
| C06 | PG explain plan diagram              | PG    | ExplainPane, ExplainNode; Present                 | Unique   | Diagram interaction/export         |
| C07 | BQ billing project                   | BQ    | BigQueryProfile/adapter; Present                  | Unique   | Missing permissions                |
| C08 | BQ project/dataset/location          | BQ    | BigQueryProfile; Present                          | Unique   | Discovery across projects          |
| C09 | BQ maximum bytes billed              | BQ    | BigQueryProfile; Present                          | Unique   | Limit hit and error                |
| C10 | BQ ADC/gcloud auth                   | BQ    | BigQuery adapter; Present                         | Unique   | Expired credentials                |
| C11 | BQ script phases/DECLARE/SET         | BQ    | README, adapter; Conditional                      | Unique   | Final SELECT and unsafe scripts    |
| C12 | BQ processed bytes/cache data        | BQ    | QueryExecutionInfo; Conditional                   | Unique   | UI exposes values where available  |
| C13 | Local file multi-selection           | LF    | LocalFilesConnectionModal; Present                | Unique   | Missing/moved files                |
| C14 | Local file alias per file            | LF    | LocalFilesProfile; Present                        | Unique   | Collisions and renaming            |
| C15 | CSV/TSV/Parquet/JSON/JSONL ingestion | LF    | README/adapters; Present                          | Unique   | Formats and schema inference       |
| C16 | Read-only DuckDB file sandbox        | LF    | local-files-adapter; Present                      | Unique   | Arbitrary external file access     |
| C17 | SQLite single database file          | SQ    | SqliteFileConnectionModal; Present                | Unique   | Invalid path and locks             |
| C18 | Read-only SQLite via DuckDB          | SQ    | sqlite-file-adapter; Present                      | Unique   | Read restriction and schema        |

## D. Prometheus

| ID  | Atomic feature                     | Kinds | Evidence / status                           | UX owner    | Manual verification          |
| --- | ---------------------------------- | ----- | ------------------------------------------- | ----------- | ---------------------------- |
| P01 | gcx profile/context/UID            | PM    | PrometheusProfile/connection modal; Present | Hybrid      | Context resolution           |
| P02 | Metric discovery/search            | PM    | PromqlBuilderPanel/Sidebar; Present         | Unique      | Large catalogs               |
| P03 | Metric type/help/unit metadata     | PM    | shared/types; Conditional                   | Unique      | Unknown metric type          |
| P04 | PromQL code editor                 | PM    | QueryEditor; Present                        | Hybrid      | Formatting and errors        |
| P05 | PromQL Builder metric choice       | PM    | PromqlBuilderPanel; Present                 | Unique      | Metric reset                 |
| P06 | Calculation selection              | PM    | PromqlBuilderPanel; Present                 | Unique      | Raw/rate/increase etc.       |
| P07 | Histogram representation selection | PM    | PromqlBuilderPanel; Present                 | Unique      | Classic/native/unknown       |
| P08 | Percentile                         | PM    | PromqlBuilderPanel; Present                 | Unique      | Value validation             |
| P09 | Aggregation                        | PM    | PromqlBuilderPanel; Present                 | Hybrid      | Grouping vs none             |
| P10 | Rate window                        | PM    | PromqlBuilderPanel; Present                 | Unique      | Appropriate ranges           |
| P11 | Group by labels                    | PM    | PromqlBuilderPanel; Present                 | Hybrid      | Independent of filtering     |
| P12 | Filter by labels                   | PM    | PromqlBuilderPanel; Present                 | Hybrid      | Grouping coexistence         |
| P13 | Label value multi-selection        | PM    | PromqlBuilderPanel; Present                 | Hybrid      | High-cardinality lookup      |
| P14 | Query time range                   | PM    | QueryEditor, TimeRangeField; Present        | Shared      | Range and timezone           |
| P15 | Step/resolution                    | PM    | QueryEditor; Present                        | Unique      | Auto vs explicit             |
| P16 | Metric result as table/chart       | PM    | ResultExplorer; Present                     | Shared      | Missing data and many series |
| P17 | Grafana handoff                    | PM    | GrafanaHandoffActions; Present              | Shared OBS3 | Query/range fidelity         |

## E. Loki

| ID  | Atomic feature                            | Kinds | Evidence / status                        | UX owner            | Manual verification                     |
| --- | ----------------------------------------- | ----- | ---------------------------------------- | ------------------- | --------------------------------------- |
| L01 | gcx profile/context/UID                   | LK    | LokiProfile; Present                     | Hybrid              | Context resolution                      |
| L02 | LogQL editor and format/copy              | LK    | LokiExplorer; Present                    | Hybrid              | Syntax and formatting                   |
| L03 | LogQL Builder                             | LK    | LokiBuilderPanel; Present                | Unique              | Mode persistence                        |
| L04 | Indexed label discovery                   | LK    | useLokiLabelsResource; Present           | Unique              | Refresh/change profile                  |
| L05 | Label matcher and values                  | LK    | LokiBuilderPanel; Present                | Unique              | Safe unfiltered query prevention        |
| L06 | Line contains                             | LK    | LokiBuilderPanel; Present                | Unique              | Escaping, empty text                    |
| L07 | Level/severity filter                     | LK    | LokiBuilderPanel; Present                | Unique              | Indexed label mapping                   |
| L08 | Group by indexed labels                   | LK    | LokiBuilderPanel; Present                | Hybrid              | Level independence pending #359         |
| L09 | Parser stages/expressions                 | LK    | LokiBuilderPanel; Present                | Unique              | Invalid stages                          |
| L10 | Field predicates                          | LK    | LokiBuilderPanel; Present                | Unique              | Operator/value validation               |
| L11 | Query time range and limit                | LK    | LokiExplorer; Present                    | Hybrid              | Time range, result size                 |
| L12 | Log list rendering                        | LK    | LogResultExplorer; Present               | Unique              | Long messages and virtual scrolling     |
| L13 | Search loaded logs                        | LK    | LogResultExplorer; Present               | Shared pattern      | Search/highlight scope                  |
| L14 | Severity badges                           | LK    | LogResultExplorer; Present               | Unique              | Unknown severity                        |
| L15 | Log inspector/resize                      | LK    | LogResultExplorer; Present               | Shared inspector    | Open/close and keyboard                 |
| L16 | Indexed labels/metadata/parsed fields     | LK    | LogResultExplorer; Present               | Unique              | Missing and nested fields               |
| L17 | Include/exclude via inspector             | LK    | LogResultExplorer; Present               | Hybrid              | Local vs query filter scope             |
| L18 | Copy message/raw/trace identifiers        | LK    | LogResultExplorer; Present               | Shared copy pattern | Clipboard failures                      |
| L19 | Patterns view/count/percentage            | LK    | LogPatternExplorer; Present              | Unique              | Pattern grouping/variables              |
| L20 | Pattern inspector/examples                | LK    | LogPatternExplorer; Present              | Unique              | Large pattern sets                      |
| L21 | View logs for pattern                     | LK    | LokiExplorer/LogPatternExplorer; Present | Unique              | Safe promotion vs local filter          |
| L22 | Log volume trend                          | LK    | LokiExplorer; Present                    | Unique              | Pending background volume after remount |
| L23 | Chart views for metric/volume             | LK    | GenericResultExplorer; Conditional       | Shared              | Line/area/bar/scatter/tree views        |
| L24 | Generic table view                        | LK    | GenericResultExplorer; Present           | Shared              | Copy/export with filtered state         |
| L25 | Separate primary/optional-query ownership | LK    | LokiExplorer; Verify                     | Hybrid              | #371 remount regression                 |
| L26 | Grafana handoff                           | LK    | GrafanaHandoffActions; Present           | Shared OBS3         | Query and time boundaries               |

## F. Tempo

| ID  | Atomic feature                   | Kinds | Evidence / status                             | UX owner         | Manual verification                  |
| --- | -------------------------------- | ----- | --------------------------------------------- | ---------------- | ------------------------------------ |
| T01 | gcx profile/context/UID          | TP    | TempoProfile; Present                         | Hybrid           | Context resolution                   |
| T02 | TraceQL editor/format/copy       | TP    | TraceExplorer; Present                        | Hybrid           | Formatting and errors                |
| T03 | TraceQL Builder                  | TP    | TraceBuilderPanel; Present                    | Unique           | Raw/Builder parity                   |
| T04 | Namespace and service selectors  | TP    | TraceBuilderPanel; Present                    | Unique           | Discovery/revision                   |
| T05 | Span kind/status/min duration    | TP    | TraceBuilderPanel; Present                    | Unique           | Correct query semantics              |
| T06 | Protocol/subsystem selection     | TP    | TraceBuilderPanel; Present                    | Unique           | Conditional fields                   |
| T07 | HTTP method/route                | TP    | TraceBuilderPanel; Present                    | Unique           | Missing attributes                   |
| T08 | RPC system/service/method        | TP    | TraceBuilderPanel; Present                    | Unique           | Nested choices                       |
| T09 | Messaging system/topic/operation | TP    | TraceBuilderPanel; Present                    | Unique           | Discovery failure                    |
| T10 | DB system/operation              | TP    | TraceBuilderPanel; Present                    | Unique           | Missing metadata                     |
| T11 | Advanced attributes/modes        | TP    | TraceBuilderPanel; Present                    | Unique           | Comparison vs multi-value            |
| T12 | Exact span/operation name        | TP    | TraceBuilderPanel; Present                    | Unique           | Escaping                             |
| T13 | Time range/sample size           | TP    | TraceExplorer; Present                        | Hybrid           | Sampling and cap                     |
| T14 | Trace ID lookup                  | TP    | TraceExplorer; Present                        | Unique           | Trace not found                      |
| T15 | Trace search and progress        | TP    | TraceExplorer; Present                        | Unique           | Partial progress and retry           |
| T16 | Search list                      | TP    | TraceSearchResults; Present                   | Unique           | Sorting/search/detail                |
| T17 | Scatter cohort view              | TP    | TraceExplorer/TraceScatterChart; Present      | Hybrid           | Brush and interval                   |
| T18 | Local time filtering             | TP    | TraceExplorer; Present                        | Shared semantics | Inclusive start/exclusive end        |
| T19 | Service Map                      | TP    | TraceExplorer/useTraceCohortAnalysis; Present | Unique           | Same filtered cohort as List/Scatter |
| T20 | Trace details and span hierarchy | TP    | TraceExplorer and trace components; Present   | Unique           | Expand/select/collapse               |
| T21 | Hide span kinds / async branches | TP    | TraceExplorer; Present                        | Unique           | Preserved state                      |
| T22 | Compress idle gaps               | TP    | TraceExplorer; Present                        | Unique           | Timing clarity                       |
| T23 | Inspector conventions            | TP    | TraceExplorer; Verify                         | Shared pattern   | Compare with Loki inspector          |
| T24 | Grafana handoff                  | TP    | GrafanaHandoffActions; Present                | Shared OBS3      | Query and time fidelity              |

## G. Shared result views, charts and filters

| ID  | Atomic feature                       | Kinds                   | Evidence / status                               | UX owner | Manual verification               |
| --- | ------------------------------------ | ----------------------- | ----------------------------------------------- | -------- | --------------------------------- |
| R01 | Table view and column formatting     | SQL4/PM/LK              | ResultsTable/GenericResultExplorer; Present     | Shared   | Row caps, wide results            |
| R02 | Table sort                           | SQL4/PM/LK              | ResultsTable; Present                           | Shared   | Numeric/null sorting              |
| R03 | Table text filtering                 | SQL4/PM/LK              | ResultsTable; Present                           | Shared   | Filtered CSV semantics            |
| R04 | Column width resize                  | SQL4/PM/LK              | ResultsTable; Present                           | Shared   | Persistence across runs           |
| R05 | Copy filtered/sorted table CSV       | SQL4/PM/LK              | ResultsTable; Present                           | Shared   | Result count and escaping         |
| R06 | Export table CSV                     | SQL4/PM/LK              | ResultsTable; Present                           | Shared   | Full vs filtered distinction      |
| R07 | Bar view                             | SQL4/PM/LK              | ChartPicker/GenericResultExplorer; Conditional  | Shared   | Chart-compatible data             |
| R08 | Line view                            | SQL4/PM/LK              | Same; Conditional                               | Shared   | Time gaps and timezones           |
| R09 | Area view                            | SQL4/PM/LK              | Same; Conditional                               | Shared   | Stacking and nulls                |
| R10 | Scatter view                         | SQL4/PM/LK; TP distinct | ChartPicker, TraceScatterChart; Conditional     | Hybrid   | Chart vs trace-scatter semantics  |
| R11 | Treemap view                         | SQL4/PM/LK              | ChartPicker/GenericResultExplorer; Conditional  | Shared   | Hierarchy inputs                  |
| R12 | Sunburst view                        | SQL4/PM/LK              | Same; Conditional                               | Shared   | Hierarchy ordering                |
| R13 | X/Y/series mapping                   | SQL4/PM/LK              | GenericResultExplorer; Conditional              | Shared   | Builder-owned dimensions          |
| R14 | Hierarchy reorder                    | SQL4/PM/LK              | GenericResultExplorer; Conditional              | Shared   | Move in/out                       |
| R15 | Axis scale and temporal units        | SQL4/PM/LK              | GenericResultExplorer; Conditional              | Shared   | Log scale invalid values          |
| R16 | Legend, visibility/isolation         | SQL4/PM/LK              | GenericResultExplorer/ChartLegend; Present      | Shared   | Isolate and reset                 |
| R17 | Resizable legend                     | SQL4/PM/LK              | ChartLegend; Present                            | Shared   | Persist across views              |
| R18 | Chart zoom/point/context filtering   | SQL4/PM/LK              | GenericResultExplorer; Conditional              | Shared   | Local vs promoted filters         |
| R19 | Client filter chips and clear        | SQL4/PM/LK, TP local    | ResultFilterBar; Conditional                    | Shared   | Scope and stale chips             |
| R20 | Query-side filter promotion          | SQL4                    | ResultExplorer/resultFilters; Conditional       | Hybrid   | Correct SQL and params            |
| R21 | Chart PNG copy/export                | SQL4/PM/LK              | GenericResultExplorer/chartImage; Present       | Shared   | Full legend and disabled states   |
| R22 | AI line-chart anomaly analysis       | SQL4/PM/LK              | GenericResultExplorer; Conditional              | Shared   | Configured AI + visible line      |
| R23 | Anomaly markers/analysis details     | SQL4/PM/LK              | GenericResultExplorer; Conditional              | Shared   | Coverage and unsampled series     |
| R24 | Chart readiness/animation and resize | SQL4/PM/LK              | GenericResultExplorer; Present                  | Shared   | Tab switch and pending results    |
| R25 | Loading/error/empty presentations    | ALL                     | Per-workspace and GenericResultExplorer; Verify | Shared   | Alignment, retries, screen reader |

## H. AI, export and interoperability

| ID  | Atomic feature                   | Kinds               | Evidence / status                        | UX owner          | Manual verification                    |
| --- | -------------------------------- | ------------------- | ---------------------------------------- | ----------------- | -------------------------------------- |
| X01 | AI settings / OpenRouter setup   | ALL app setting     | AI settings and main; Present            | Shared            | Save/error/unconfigured                |
| X02 | Secure AI credential persistence | ALL app setting     | main secure storage; Present             | Shared            | Migration and insecure backend         |
| X03 | AI proposal accept/reject/diff   | SQL4                | AiQueryCopilot, QueryEditor; Conditional | Shared pattern    | Review before executing                |
| X04 | AI query repair                  | SQL4                | AiQueryRepair; Conditional               | Hybrid            | Sanitize errors                        |
| X05 | AI anomaly summary/markers       | SQL4/PM/LK          | GenericResultExplorer; Conditional       | Shared            | Sample limits                          |
| X06 | Copy current query               | ALL                 | CopySqlButton/query surfaces; Present    | Shared            | Consistent labels                      |
| X07 | Copy/export CSV                  | SQL4/PM/LK          | ResultsTable; Present                    | Shared            | Not equivalent to copying all raw logs |
| X08 | PNG chart copy/export            | SQL4/PM/LK          | GenericResultExplorer; Present           | Shared            | Offscreen legend                       |
| X09 | Open/Copy Grafana link           | OBS3                | GrafanaHandoffActions; Present           | Shared            | Correct URL and range                  |
| X10 | Copy log payload and IDs         | LK                  | LogResultExplorer; Present               | Shared convention | Contents/notifications                 |
| X11 | Copy trace details/identifiers   | TP                  | Trace UI; Verify                         | Shared convention | Compare Loki                           |
| X12 | Diagram clipboard / Excalidraw   | Applicable diagrams | Diagram-related components; Verify       | Hybrid            | Plan vs Service Map behavior           |

## I. Confirmed architectural observations

- `App.tsx`: SQL/Prometheus use the shared `QueryEditor` + `ResultExplorer` route. Loki and Tempo use separate `LokiExplorer` and `TraceExplorer` workspaces.
- `src/shared/types.ts`: seven datasource kinds and six engines; SQL4 map to PostgreSQL, GoogleSQL or DuckDB dialects.
- `src/shared/types.ts`: only PostgreSQL has native application capabilities `explain: true` and `analyze: true`.
- `QueryTabs.tsx`: tab running indicator reads session state; semantic parity depends on each source updating that state correctly.
- `QueryUtilityActions.tsx`: one shared preset/reset action exists.
- `ResultsTable.tsx`: explicit **Copy CSV** and **Export CSV** controls exist; Copy describes filtered, sorted CSV.
- `ChartPicker.tsx`: list, table, patterns, bar, line, area, scatter, treemap and sunburst are defined, but workspaces restrict available choices.
- `LokiBuilderPanel.tsx`: has both a Level filter and Group by selection; #359 is the intended decoupling.
- `TraceBuilderPanel.tsx`: many service/protocol-specific controls make its Builder meaningfully distinct from SQL/PromQL/LogQL.
- `docs/history/query-lifecycle-audit.md`: records historical shared-session and local request coordination disparities; reconcile against current main and merged #383/#384 before implementing remaining #371 slices.
- `docs/features.md` is a maintained high-level overview. Use this inventory for granular per-datasource evidence and verification statuses.

## J. Audit candidates / decisions, in priority order

| Priority | Topic                                                     | Classification                        | Product contract                                                                 |
| -------- | --------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| P0       | Query operation identity across tab remounts              | Under active correction (#371)        | Old work never owns new state; activity clears correctly                         |
| P0       | Explain/Analyze indicators and cleanup                    | Under active correction (#371)        | Same tab-running contract as Run                                                 |
| P0       | Level filter vs Group by Level                            | Planned (#359)                        | Grouping never implies severity filtering                                        |
| P1       | Reset/Clear semantics for raw/Builder and special results | Needs comparative manual verification | Predictable and reversible where practical                                       |
| P1       | Scope of filter chips after switching views               | Needs comparative manual verification | Local/query/visibility scopes explicit; no hidden filters accidentally cleared   |
| P1       | Time range, timezone and selected interval behavior       | Needs comparative manual verification | Consistent endpoints and obvious scope                                           |
| P1       | Builder selector presentation and search                  | UX consistency candidate              | Same field treatment without generic query model                                 |
| P1       | Table CSV vs log/traces export semantics                  | UX consistency candidate              | Same verbs mean same action; differences explicit                                |
| P1       | Inspector resize/close/copy keyboard behavior             | UX consistency candidate              | Same interaction primitives; distinct content                                    |
| P2       | AI action availability by dialect                         | Needs compatibility tests             | Hide/disable unsupported operations, never imply compatibility                   |
| P2       | Full preset serialization matrix                          | Needs round-trip tests                | Every saved supported state restores, incompatible state handled                 |
| P2       | Source-specific cost/query diagnostics                    | Product choice                        | Surface BigQuery bytes and Prometheus/Tempo performance without fake equivalence |
| P2       | Documentation feature list drift                          | Confirmed documentation gap           | Keep documentation derived from code/capability inventory                        |

## K. Suggested regression smoke scenarios

1. For each kind: create connection → open tab → switch Builder/raw → run → switch away/back before resolution → verify result and indicator → change connection during a pending request.
2. For each SQL dialect: select schema/relation → Builder aggregation/series/time filter → preview/copy/run → chart → local filter → promote when safe → copy/export CSV → save preset → restore.
3. For Prometheus: select metric, discover label values, set `Group by` and `Filter by` independently, change rate window/histogram representation, verify legend and step controls.
4. For Loki: indexed-label matchers, severity and grouping independence, parsers, logs/volume/patterns/table, pattern → View logs, chart visibility, pending volume on tab remount.
5. For Tempo: namespace/service/protocol advanced filters, list/scatter/service-map cohort parity, trace inspector, span visibility/timing, query changes with pending search.
6. For all chart-capable sources: every compatible view; legend visibility/isolate/resize; hover, point filter, PNG export, rerun, resize and tab switch.
7. For all preset-capable sources: save/load/rename/delete with non-default Builder, query, filters, time range and selected result view.

## L. Source map and useful existing tests

- [App / workspace routing](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/App.tsx)
- [Datasource kinds/capabilities](https://github.com/cubitouch/DataKoala/blob/main/src/shared/types.ts)
- [Query editor](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/query/QueryEditor.tsx)
- [SQL Builder](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/builder/sql/BuilderPanel.tsx)
- [Prometheus Builder](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/builder/prometheus/PromqlBuilderPanel.tsx)
- [Loki Builder](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/builder/loki/LokiBuilderPanel.tsx)
- [Tempo Builder](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/builder/tempo/TraceBuilderPanel.tsx)
- [Generic results](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/results/GenericResultExplorer.tsx)
- [Table](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/results/ResultsTable.tsx)
- [Loki workspace](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/workspaces/loki/LokiExplorer.tsx)
- [Tempo workspace](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/workspaces/tempo/TraceExplorer.tsx)
- [Presets](https://github.com/cubitouch/DataKoala/blob/main/src/renderer/src/components/query/PresetManagerAction.tsx)
- [Existing lifecycle audit](https://github.com/cubitouch/DataKoala/blob/main/docs/history/query-lifecycle-audit.md)
- [Current feature overview](https://github.com/cubitouch/DataKoala/blob/main/docs/features.md)

**Representative test paths already observed through source/code references:** `src/renderer/src/components/results/GenericResultExplorer.test.tsx`, `src/renderer/src/components/results/GenericResultExplorer.ai.test.tsx`, `src/renderer/src/components/results/logs/LogResultExplorer.ui.test.tsx`, `src/renderer/src/components/results/logs/LogPatternExplorer.ui.test.tsx`, `src/renderer/src/components/builder/prometheus/PromqlBuilderPanel.test.tsx`, `src/renderer/src/components/builder/tempo/TraceBuilderPanel.test.tsx`, `src/renderer/src/components/workspaces/loki/LokiExplorer.ui.test.tsx`, `src/renderer/src/components/query/QueryEditor.test.tsx`, `src/renderer/src/components/query/PresetManagerAction.test.tsx`. This is a representative list, **not a verified exhaustive test mapping**.
