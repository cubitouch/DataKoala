# DataKoala — Datasource feature inventory and UX ownership audit

**Reviewed:** 2026-10-13 · **Repository:** https://github.com/cubitouch/DataKoala · **Baseline:** `49ef6cd0a44041e200c362f7d707e5d22254f956` (merged #404).

## Read this first

This is a **source-guided audit**, not a live seven-datasource manual test. `Present` means an implementation entry point or relevant UI was found, **not** that execution has been tested end to end. `Conditional` means dependent on result representation, profile configuration or other conditions. `Verify` identifies behavior requiring further tests. `N/A` means deliberately not supported. Features and workflows in unmerged PRs are not counted as delivered. Issue #371 is completed (#383/#384/#386); #365 is completed through #404. Manual release acceptance remains pending in #382.

**UX ownership:** `Shared` = same user contract/control; `Hybrid` = shared shell/pattern, datasource-specific semantics; `Unique` = meaningful datasource-specific experience. This column describes UX, not proof of a single implementation. See the [archived Phase 1 convergence audit](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/architecture/ux-implementation-convergence-audit.md) for independent UX/implementation classifications, all 32 baseline Hybrid decisions, caller evidence, runtime limits and ranked follow-ups. Its Phase 1B visual coverage and V-01–V-12 ledger reassess Shared, Unique and unlisted patterns through real-renderer comparisons and DOM/interaction measurements. `Shared pattern/convention` likewise does not promise component reuse.

**Kinds:** `PG` PostgreSQL; `BQ` BigQuery; `LF` local-files/DuckDB; `SQ` SQLite via DuckDB; `PM` Prometheus; `LK` Loki; `TP` Tempo. `SQL4` = PG/BQ/LF/SQ; `OBS3` = PM/LK/TP; `ALL` = all seven.

## A. Shared shell and workspace

| ID  | Atomic feature                        | Kinds | Evidence / status                                   | UX owner | Manual verification                 |
| --- | ------------------------------------- | ----- | --------------------------------------------------- | -------- | ----------------------------------- |
| A01 | Create connection/profile             | ALL   | ConnectionModal + seven custom forms; UX-09/21      | Shared   | Create profile of each kind         |
| A02 | Edit profile                          | ALL   | Sidebar + custom forms; UX-09/21                    | Shared   | Edit and reconnect each kind        |
| A03 | Delete profile                        | ALL   | Sidebar; Present                                    | Shared   | Confirm tab binding and errors      |
| A04 | Connect on demand                     | ALL   | useStore, tabConnection; Present                    | Shared   | First activation, background tabs   |
| A05 | Disconnect / reconnect                | ALL   | useStore, ConnectionStatus; Present                 | Shared   | Disconnect mid-query                |
| A06 | Connection status/indicator           | ALL   | ConnectionStatus, Sidebar; Present                  | Shared   | Idle/connecting/failed/reconnecting |
| A07 | Failure recovery/feedback             | ALL   | useStore, connectionLifecycle; Verify               | Shared   | Transient vs invalid credentials    |
| A08 | Connection generation invalidation    | ALL   | useStore; Verify                                    | Shared   | Replace connection mid-query        |
| A09 | Discovery object loading              | ALL   | Sidebar, adapters; Present                          | Hybrid   | Source-specific hierarchy           |
| A10 | Search/filter object tree             | ALL   | Sidebar; Present                                    | Shared   | Token search and clear              |
| A11 | Object metadata refresh               | ALL   | Sidebar; Present                                    | Shared   | Refresh during active query         |
| A12 | Object metadata loading/error/retry   | ALL   | Sidebar; Present                                    | Shared   | Empty and failed metadata           |
| A13 | Lazy column/label/attribute discovery | ALL   | Source-specific resources; Conditional              | Hybrid   | Retry and stale responses           |
| A14 | New query tab                         | ALL   | QueryTabs; Present                                  | Shared   | Shortcut and identity               |
| A15 | Rename tab                            | ALL   | QueryTabs; Present                                  | Shared   | Persist after restart               |
| A16 | Close/switch tab                      | ALL   | QueryTabs; Present                                  | Shared   | Running query then remount          |
| A17 | Bind tab to profile                   | ALL   | useStore, Sidebar; Present                          | Shared   | Change while request pending        |
| A18 | Tab running indicator                 | ALL   | QueryTabs; Verify                                   | Shared   | Run, error, disconnect, explain     |
| A19 | Persist drafts/layout                 | ALL   | querySessions/useStore; Present                     | Shared   | Restore all seven kinds             |
| A20 | Query mode (raw/Builder)              | ALL   | ModeSwitch, source workspaces; Present              | Shared   | Toggle without losing state         |
| A21 | Saved exploration preset CRUD         | ALL   | PresetManagerAction; Present                        | Shared   | Save/load/rename/delete each kind   |
| A22 | Preset compatibility guard            | ALL   | explorationPresets; Present                         | Shared   | Load after changing source          |
| A23 | Reset exploration confirmation        | ALL   | QueryUtilityActions; Present                        | Shared   | Same meaning across kinds           |
| A24 | Notifications and clipboard feedback  | ALL   | Partial: NotificationArea; Loki copy bypass (UX-07) | Shared   | Success/failure accessibility       |
| A25 | Resizable workspace regions           | ALL   | App, source workspaces; Present                     | Shared   | Drag/keyboard/restoration           |

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
| C19 | PG Teleport (tsh) pre-connect tunnel | PG    | PostgresProfile, TeleportTunnelManager; Present   | Unique   | Login/expiry, tunnel drop          |

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

| ID  | Atomic feature                            | Kinds | Evidence / status                                   | UX owner         | Manual verification                              |
| --- | ----------------------------------------- | ----- | --------------------------------------------------- | ---------------- | ------------------------------------------------ |
| L01 | gcx profile/context/UID                   | LK    | LokiProfile; Present                                | Hybrid           | Context resolution                               |
| L02 | LogQL editor and format/copy              | LK    | LokiExplorer; Present                               | Hybrid           | Syntax and formatting                            |
| L03 | LogQL Builder                             | LK    | LokiBuilderPanel; Present                           | Unique           | Mode persistence                                 |
| L04 | Indexed label discovery                   | LK    | useLokiLabelsResource; Present                      | Unique           | Refresh/change profile                           |
| L05 | Label matcher and values                  | LK    | LokiBuilderPanel; Present                           | Unique           | Safe unfiltered query prevention                 |
| L06 | Line contains                             | LK    | LokiBuilderPanel; Present                           | Unique           | Escaping, empty text                             |
| L07 | Level/severity filter                     | LK    | LokiBuilderPanel; Present                           | Unique           | Indexed label mapping                            |
| L08 | Group by indexed labels                   | LK    | LokiBuilderPanel; Present                           | Hybrid           | Independent Level/grouping; merged #385          |
| L09 | Parser stages/expressions                 | LK    | LokiBuilderPanel; Present                           | Unique           | Invalid stages                                   |
| L10 | Field predicates                          | LK    | LokiBuilderPanel; Present                           | Unique           | Operator/value validation                        |
| L11 | Query time range and limit                | LK    | LokiExplorer; Present                               | Hybrid           | Time range, result size                          |
| L12 | Log list rendering                        | LK    | LogResultExplorer; Present                          | Unique           | Long messages and virtual scrolling              |
| L13 | Search loaded logs                        | LK    | LogResultExplorer; Present                          | Shared pattern   | Search/highlight scope                           |
| L14 | Severity badges                           | LK    | LogResultExplorer; Present                          | Unique           | Unknown severity                                 |
| L15 | Log inspector/resize                      | LK    | LogResultExplorer; Present                          | Shared inspector | Open/close and keyboard                          |
| L16 | Indexed labels/metadata/parsed fields     | LK    | LogResultExplorer; Present                          | Unique           | Missing and nested fields                        |
| L17 | Include/exclude via inspector             | LK    | LogResultExplorer; Present                          | Hybrid           | Local vs query filter scope                      |
| L18 | Copy message/raw/trace identifiers        | LK    | Direct clipboard calls; UX-07                       | Hybrid           | Clipboard failures                               |
| L19 | Patterns view/count/percentage            | LK    | LogPatternExplorer; Present                         | Unique           | Pattern grouping/variables                       |
| L20 | Pattern inspector/examples                | LK    | LogPatternExplorer; Present                         | Unique           | Large pattern sets                               |
| L21 | View logs for pattern                     | LK    | LokiExplorer/LogPatternExplorer; Present            | Unique           | Safe promotion vs local filter                   |
| L22 | Log volume trend                          | LK    | LokiExplorer; Present                               | Unique           | Pending background volume after remount          |
| L23 | Chart views for metric/volume             | LK    | GenericResultExplorer; Conditional                  | Shared           | Line/area/bar/scatter/tree views                 |
| L24 | Generic table view                        | LK    | GenericResultExplorer; Present                      | Shared           | Copy/export with filtered state                  |
| L25 | Separate primary/optional-query ownership | LK    | Session primary token + local trend guard; UX-01/17 | Hybrid           | Merged #384; provider remount acceptance pending |
| L26 | Grafana handoff                           | LK    | GrafanaHandoffActions; Present                      | Shared OBS3      | Query and time boundaries                        |

## F. Tempo

| ID  | Atomic feature                   | Kinds | Evidence / status                             | UX owner         | Manual verification                         |
| --- | -------------------------------- | ----- | --------------------------------------------- | ---------------- | ------------------------------------------- |
| T01 | gcx profile/context/UID          | TP    | TempoProfile; Present                         | Hybrid           | Context resolution                          |
| T02 | TraceQL editor/format/copy       | TP    | TraceExplorer; Present                        | Hybrid           | Formatting and errors                       |
| T03 | TraceQL Builder                  | TP    | TraceBuilderPanel; Present                    | Unique           | Raw/Builder parity                          |
| T04 | Namespace and service selectors  | TP    | TraceBuilderPanel; Present                    | Unique           | Discovery/revision                          |
| T05 | Span kind/status/min duration    | TP    | TraceBuilderPanel; Present                    | Unique           | Correct query semantics                     |
| T06 | Protocol/subsystem selection     | TP    | TraceBuilderPanel; Present                    | Unique           | Conditional fields                          |
| T07 | HTTP method/route                | TP    | TraceBuilderPanel; Present                    | Unique           | Missing attributes                          |
| T08 | RPC system/service/method        | TP    | TraceBuilderPanel; Present                    | Unique           | Nested choices                              |
| T09 | Messaging system/topic/operation | TP    | TraceBuilderPanel; Present                    | Unique           | Discovery failure                           |
| T10 | DB system/operation              | TP    | TraceBuilderPanel; Present                    | Unique           | Missing metadata                            |
| T11 | Advanced attributes/modes        | TP    | TraceBuilderPanel; Present                    | Unique           | Comparison vs multi-value                   |
| T12 | Exact span/operation name        | TP    | TraceBuilderPanel; Present                    | Unique           | Escaping                                    |
| T13 | Time range/sample size           | TP    | TraceExplorer; Present                        | Hybrid           | Sampling and cap                            |
| T14 | Trace ID lookup                  | TP    | TraceExplorer; Present                        | Unique           | Trace not found                             |
| T15 | Trace search and progress        | TP    | TraceExplorer; Present                        | Unique           | Partial progress and retry                  |
| T16 | Search list                      | TP    | TraceSearchResults; Present                   | Unique           | Sorting/search/detail                       |
| T17 | Scatter cohort view              | TP    | TraceExplorer/TraceScatterChart; Present      | Hybrid           | Brush and interval                          |
| T18 | Local time filtering             | TP    | TraceExplorer; Present                        | Shared semantics | Inclusive start/exclusive end               |
| T19 | Service Map                      | TP    | TraceExplorer/useTraceCohortAnalysis; Present | Unique           | Same filtered cohort as List/Scatter        |
| T20 | Trace details and span hierarchy | TP    | TraceExplorer and trace components; Present   | Unique           | Expand/select/collapse                      |
| T21 | Hide span kinds / async branches | TP    | TraceExplorer; Present                        | Unique           | Preserved state                             |
| T22 | Compress idle gaps               | TP    | TraceExplorer; Present                        | Unique           | Timing clarity                              |
| T23 | Inspector conventions            | TP    | SpanInspector custom responsive grid; UX-13   | Hybrid           | Distinct fixed grid vs resizable Loki shell |
| T24 | Grafana handoff                  | TP    | GrafanaHandoffActions; Present                | Shared OBS3      | Query and time fidelity                     |

## G. Shared result views, charts and filters

| ID  | Atomic feature                       | Kinds                   | Evidence / status                                  | UX owner | Manual verification               |
| --- | ------------------------------------ | ----------------------- | -------------------------------------------------- | -------- | --------------------------------- |
| R01 | Table view and column formatting     | SQL4/PM/LK              | ResultsTable/GenericResultExplorer; Present        | Shared   | Row caps, wide results            |
| R02 | Table sort                           | SQL4/PM/LK              | ResultsTable; Present                              | Shared   | Numeric/null sorting              |
| R03 | Table text filtering                 | SQL4/PM/LK              | ResultsTable; Present                              | Shared   | Filtered CSV semantics            |
| R04 | Column width resize                  | SQL4/PM/LK              | ResultsTable; Present                              | Shared   | Persistence across runs           |
| R05 | Copy filtered/sorted table CSV       | SQL4/PM/LK              | ResultsTable; Present                              | Shared   | Result count and escaping         |
| R06 | Export table CSV                     | SQL4/PM/LK              | ResultsTable; Present                              | Shared   | Full vs filtered distinction      |
| R07 | Bar view                             | SQL4/PM/LK              | ChartPicker/GenericResultExplorer; Conditional     | Shared   | Chart-compatible data             |
| R08 | Line view                            | SQL4/PM/LK              | Same; Conditional                                  | Shared   | Time gaps and timezones           |
| R09 | Area view                            | SQL4/PM/LK              | Same; Conditional                                  | Shared   | Stacking and nulls                |
| R10 | Scatter view                         | SQL4/PM/LK; TP distinct | ChartPicker, TraceScatterChart; Conditional        | Hybrid   | Chart vs trace-scatter semantics  |
| R11 | Treemap view                         | SQL4/PM/LK              | ChartPicker/GenericResultExplorer; Conditional     | Shared   | Hierarchy inputs                  |
| R12 | Sunburst view                        | SQL4/PM/LK              | Same; Conditional                                  | Shared   | Hierarchy ordering                |
| R13 | X/Y/series mapping                   | SQL4/PM/LK              | GenericResultExplorer; Conditional                 | Shared   | Builder-owned dimensions          |
| R14 | Hierarchy reorder                    | SQL4/PM/LK              | GenericResultExplorer; Conditional                 | Shared   | Move in/out                       |
| R15 | Axis scale and temporal units        | SQL4/PM/LK              | GenericResultExplorer; Conditional                 | Shared   | Log scale invalid values          |
| R16 | Legend, visibility/isolation         | SQL4/PM/LK              | GenericResultExplorer/ChartLegend; Present         | Shared   | Isolate and reset                 |
| R17 | Resizable legend                     | SQL4/PM/LK              | ChartLegend; Present                               | Shared   | Persist across views              |
| R18 | Chart zoom/point/context filtering   | SQL4/PM/LK              | GenericResultExplorer; Conditional                 | Shared   | Local vs promoted filters         |
| R19 | Client filter chips and clear        | SQL4/PM/LK, TP local    | ResultFilterBar; Conditional                       | Shared   | Scope and stale chips             |
| R20 | Query-side filter promotion          | SQL4                    | ResultExplorer/resultFilters; Conditional          | Hybrid   | Correct SQL and params            |
| R21 | Chart PNG copy/export                | SQL4/PM/LK              | GenericResultExplorer/chartImage; Present          | Shared   | Full legend and disabled states   |
| R22 | AI line-chart anomaly analysis       | SQL4/PM/LK              | GenericResultExplorer; Conditional                 | Shared   | Configured AI + visible line      |
| R23 | Anomaly markers/analysis details     | SQL4/PM/LK              | GenericResultExplorer; Conditional                 | Shared   | Coverage and unsampled series     |
| R24 | Chart readiness/animation and resize | SQL4/PM/LK              | GenericResultExplorer; Present                     | Shared   | Tab switch and pending results    |
| R25 | Loading/error/empty presentations    | ALL                     | Partial shared primitives + specific states; UX-17 | Hybrid   | Alignment, retries, screen reader |

## H. AI, export and interoperability

| ID  | Atomic feature                   | Kinds               | Evidence / status                                  | UX owner          | Manual verification                    |
| --- | -------------------------------- | ------------------- | -------------------------------------------------- | ----------------- | -------------------------------------- |
| X01 | AI settings / OpenRouter setup   | ALL app setting     | AI settings and main; Present                      | Shared            | Save/error/unconfigured                |
| X02 | Secure AI credential persistence | ALL app setting     | main secure storage; Present                       | Shared            | Migration and insecure backend         |
| X03 | AI proposal accept/reject/diff   | SQL4                | AiQueryCopilot, QueryEditor; Conditional           | Shared pattern    | Review before executing                |
| X04 | AI query repair                  | SQL4                | AiQueryRepair; Conditional                         | Hybrid            | Sanitize errors                        |
| X05 | AI anomaly summary/markers       | SQL4/PM/LK          | GenericResultExplorer; Conditional                 | Shared            | Sample limits                          |
| X06 | Copy current query               | ALL                 | CopySqlButton; PM raw label mismatch (UX-06)       | Shared            | Consistent labels                      |
| X07 | Copy/export CSV                  | SQL4/PM/LK          | ResultsTable; Present                              | Shared            | Not equivalent to copying all raw logs |
| X08 | PNG chart copy/export            | SQL4/PM/LK          | GenericResultExplorer; Present                     | Shared            | Offscreen legend                       |
| X09 | Open/Copy Grafana link           | OBS3                | GrafanaHandoffActions; Present                     | Shared            | Correct URL and range                  |
| X10 | Copy log payload and IDs         | LK                  | Direct clipboard calls; no shared recovery (UX-07) | Hybrid            | Contents/notifications                 |
| X11 | Copy trace details/identifiers   | TP                  | Trace UI content; clipboard capability unverified  | Shared convention | Compare Loki                           |
| X12 | Diagram clipboard / Excalidraw   | Applicable diagrams | TP map PNG/Excalidraw; PG text/JSON only; UX-20    | Hybrid            | No PG plan graph copy/export control   |

## I. Confirmed architectural observations

- `App.tsx`: SQL/Prometheus use the shared `QueryEditor` + `ResultExplorer` route. Loki and Tempo use separate `LokiExplorer` and `TraceExplorer` workspaces.
- `src/shared/types.ts`: seven datasource kinds and six engines; SQL4 map to PostgreSQL, GoogleSQL or DuckDB dialects.
- `src/shared/types.ts`: only PostgreSQL has native application capabilities `explain: true` and `analyze: true`.
- `QueryTabs.tsx`: tab running indicator reads session state; semantic parity depends on each source updating that state correctly.
- `QueryUtilityActions.tsx`: one shared preset/reset action exists.
- `ResultsTable.tsx`: explicit **Copy CSV** and **Export CSV** controls exist; Copy describes filtered, sorted CSV.
- `ChartPicker.tsx`: list, table, patterns, bar, line, area, scatter, treemap and sunburst are defined, but workspaces restrict available choices.
- `LokiBuilderPanel.tsx`: independent Level filtering and Group by selection were delivered by #359 / merged #385; unavailable indexed labels retain explicit behavior.
- `TraceBuilderPanel.tsx`: many service/protocol-specific controls make its Builder meaningfully distinct from SQL/PromQL/LogQL.
- `docs/history/query-lifecycle-audit.md`: historical disparity evidence is superseded by merged #384/#386. Current session-owned operation tokens, independent Run/Explain slots and guarded optional work are intentional; #371 is closed.
- `docs/features.md` is a maintained high-level overview. Use this inventory for granular per-datasource evidence and verification statuses.

## J. Current convergence decisions

The [original Phase 1 evidence ledger and coverage map](https://github.com/cubitouch/DataKoala/blob/7cfc8a3b5ac92a471f2a8930599dabe68f9291db/docs/architecture/ux-implementation-convergence-audit.md) are preserved at the immutable archive commit; current conclusions and package ownership are in the [final #391 report](audit/391/final-report.md) and [Atlas](audit/391/aggregation/agg-03-atlas.json). No proposed follow-up is implemented by the audit. Existing Shared and Unique entries were sampled by callers, not accepted solely from labels. Navigation aliases (e.g. S18/R20, S25/X04, R21/X08) are retained, not counted as separate duplication.

| Priority | Topic / ledger                                                        | Current decision                                                                                                                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Raw Loki Format ownership / UX-05                                     | Existing two reproduced overwrites; correctness fix recommended before release                                                       |
| 2        | Nested Modal/Popover Escape / V-02                                    | Settings selector Escape dismisses parent too; targeted shared ownership fix before release                                          |
| 3        | Openable log/pattern/trace rows / V-01, #405                          | Real 42/58/68 px row-density and chevron difference; one composable shell, not three CSS patches; plan after release unless selected |
| 4        | Tempo detail toolbar containment / V-04                               | Pane652 in window900 clips timing action by35 px; small container-responsive fix before release                                      |
| 5        | Loki clipboard recovery / V-07                                        | Actual synthetic denial produces unhandled rejection/no feedback; existing helper reuse before release                               |
| —        | PromQL Copy label / V-08                                              | Confirmed current DOM mismatch; small caller fix candidate                                                                           |
| —        | Result picker, error retention and inspector chrome / V-05/06/09      | Confirmed current presentation differences; scoped alignment or product-policy decisions                                             |
| —        | Connection modal focus/backdrop / V-03                                | Actual Tab/Escape divergence across custom forms; broader migration deferred                                                         |
| —        | Shared raw toolbar/Builder field chrome / V-10/11                     | Visually consistent where compared; leave shared primitives intact                                                                   |
| —        | AI composer, keyboard/resize mechanics, gcx forms / V-12, UX-12/14/21 | Preserve capability/geometry/UID semantics; defer targeted reuse, not universal components                                           |

### Cross-cutting interaction index

These entries are patterns, not new datasource capabilities. Full evidence/acceptance is in the ledger; the examples originally named in #391 did not exhaust the investigation.

| ID  | Interaction / applicable surfaces                                  | Implementation ownership / decision                                                      |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| N01 | Async raw formatting / PM and LK                                   | Separate caller policies; LK overwrite reproduced; UX-05                                 |
| N02 | Modal focus, dismissal and backdrop / app dialogs                  | Modal shared for reset/presets/settings; custom connections/delete; UX-09                |
| N03 | Selector active-option keyboard/search policy / Builders and forms | Shared option/popover shell; duplicated single/multi navigation; UX-12                   |
| N04 | Pointer/keyboard resize mechanics / inspectors, legend, workspace  | Legend/detail mechanics repeat, geometry legitimately distinct; UX-14                    |
| N05 | AI composer and review shell / SQL raw and Builder                 | Same JSX pattern; separate capability hooks/grounding retained; UX-19                    |
| N06 | Loaded-record clipboard failure/retry / logs, JSON, query, CSV     | Shared text helper bypassed by LK; payload/feedback styles intentionally distinct; UX-07 |
| N07 | Result view switch chrome / generic, LK, TP                        | ChartPicker vs TraceSearchResults buttons; engine semantics distinct; UX-08              |

### Additional visual component patterns

| ID  | Pattern / ledger                            | Current conclusion                                                                                               |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| N08 | Openable list rows / V-01, #405             | Unique data presentations contain a shared scan/open shell; log/pattern primitives do not own common row density |
| N09 | Nested overlay Escape / V-02                | Already-shared Modal/Popover compose incorrectly in Settings; tested parent dismissal                            |
| N10 | Secondary toolbar pane containment / V-04   | Viewport media query misses a narrow pane inside a wide window                                                   |
| N11 | Retained result while failed/loading / V-06 | Shared store retains data; shared Table/chart parent still presents it differently                               |

## K. Scenario navigation (not a separate release acceptance matrix)

Issue #382 owns execution and evidence. These are workflow navigation hints; use its RC cases once and extend only for selected implemented changes. Nothing below is marked passed.

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
