# DataKoala features

_DataKoala is an early-stage desktop application for exploring PostgreSQL databases and local data files with SQL, visual queries, tables and charts._

It is designed for the moment when you have a database or exported dataset and want to understand it quickly, without importing it into a spreadsheet or deploying a BI platform.

## The core workflow

1. Connect to PostgreSQL or select one or more local data files.
2. Write SQL or build an analytical query visually.
3. Inspect the returned rows in an interactive table.
4. Turn the result into a chart.
5. Filter, investigate anomalies and refine the query.
6. Export the SQL, result data or chart.

The same result-table and visualization workflow is shared across PostgreSQL and local-file connections.

## Data sources

### PostgreSQL

DataKoala supports saved PostgreSQL connection profiles with:

- connection testing before saving;
- hostname, port, database, username, password and SSL fields;
- pasted PostgreSQL connection strings;
- PostgreSQL, JDBC, psql-command and libpq keyword/value formats;
- passwordless proxy, IAM and pgpass-style connections;
- database object and column browsing;
- reconnect and unexpected-disconnection handling.

Connections are read-only by default. For PostgreSQL, this is enforced by the database session through default transaction read-only mode rather than by attempting to recognize mutating SQL text. Read-only mode can be disabled explicitly for an individual profile.

### Local files

Local-file connections are powered by an embedded DuckDB runtime. A connection can contain one or more files, each exposed through an editable table alias.

Currently supported file families include:

- CSV and other delimited text, including TSV and TXT;
- Parquet;
- JSON;
- JSON Lines, JSONL and NDJSON.

Selected files can be queried independently or joined together with DuckDB SQL. DataKoala infers schemas, exposes relations and columns through the object browser, and uses the same Builder, results table and charts as PostgreSQL.

Local-file sessions are sandboxed and read-only. Queries may access the selected canonical files while arbitrary file reads, writes, extension loading, attaching databases and persistent secrets are blocked.

## SQL workspace

The SQL workflow includes:

- a CodeMirror editor with SQL syntax highlighting;
- Run and keyboard-shortcut execution;
- SQL formatting;
- saved query tabs that survive application restarts;
- lazy switching between connections;
- schema, relation and column browsing;
- clear separation between clearing results and resetting a query;
- SQL export;
- PostgreSQL EXPLAIN and EXPLAIN ANALYZE.

Queries and workspace drafts persist locally. Query results and runtime execution state are deliberately not stored as part of the workspace.

## Visual query Builder

Builder provides an alternative to writing SQL by hand while keeping the generated query visible and reusable.

### Datasource and column selection

Builder supports:

- schema and table/view selection;
- searchable metadata-aware selectors;
- a dedicated time column for filtering;
- an X axis that can be temporal, categorical, numeric, boolean or otherwise groupable;
- an optional numeric Y axis;
- zero, one or several Series dimensions.

The time column is independent from the X axis. A user can therefore filter a dataset by time while grouping the chart by something else, such as category, region or status.

### Aggregation

Available aggregations include:

- Count without requiring a Y column;
- Sum;
- Average;
- Minimum;
- Maximum.

Multiple Series columns remain separate dimensions in generated SQL. They are grouped and ordered deterministically, while the visualization layer creates readable combined labels when needed.

### Time controls

Builder includes:

- rolling and custom time ranges;
- independent start and end boundaries;
- recurring time windows;
- Minute, Hour, Day, Week, Month, Quarter and Year buckets;
- a default recent-time range for new Builder sessions;
- safeguards that prevent overly dense minute-level queries for long ranges;
- explicit UTC handling for PostgreSQL timestamp and timestamptz values.

The time bucket appears only when the X axis is temporal. Time filtering remains available for non-temporal X axes.

### Generated SQL

Generated SQL can be:

- previewed without running it;
- copied;
- opened in SQL mode;
- executed with safely materialized parameters.

This keeps Builder transparent: it helps create SQL but does not hide what will be sent to the datasource.

## Results table

Query results can be explored through a table with:

- column sorting;
- text filtering;
- null-aware and timestamp-aware rendering;
- horizontal overflow for wide results;
- client-side result filters;
- safe handling of large numeric and structured DuckDB values;
- bounded rendering for responsiveness.

Native PostgreSQL JSON/JSONB values and conservatively detected JSON-shaped text can be opened in a read-only formatted JSON explorer. The explorer supports scrolling and copying the complete formatted value while safely handling malformed input.

The visible table is intentionally bounded for responsiveness. Exports operate on the complete result retained by the application, subject to datasource result limits.

## Result filtering and query promotion

Filters can begin as client-side exploratory filters without rerunning the query.

When a filter should become part of execution, Apply to SQL promotes compatible filters into parameterized query predicates and reruns the query. This works with both hand-written SQL and Builder queries where the source-column relationship can be preserved safely.

The promotion system understands:

- equality and range filters;
- null, text, numeric, boolean and temporal values;
- time-bucket boundaries;
- single and multiple Series dimensions;
- source-column provenance across compatible Builder changes.

Unsupported or ambiguous filters remain client-side instead of being silently rewritten into unsafe SQL.

## Charts

DataKoala can visualize query results as:

- bar charts;
- line charts;
- area charts.

Chart configuration includes:

- X and Y column selection;
- Count, Sum, Average, Minimum and Maximum aggregation;
- optional single or multiple Series dimensions;
- linear and logarithmic value axes;
- deterministic category and Series ordering;
- interactive legends;
- one-click Series isolation;
- bounded, scrollable tooltips;
- safeguards for excessive points or high-cardinality Series.

Chart settings are stored per query tab and survive compatible reruns.

## Anomaly detection

Charts include optional client-side anomaly detection based on a rolling median and median absolute deviation (MAD).

The feature:

- evaluates each visible Series independently;
- highlights anomalous chart points without modifying source rows;
- recomputes from the currently filtered result;
- handles constant and zero-MAD baselines conservatively;
- provides eligibility and status feedback;
- persists the preference per query tab.

Anomaly detection affects only chart presentation. It does not alter SQL, table values, CSV exports or copied result data.

This is intended as a lightweight exploratory signal, not as a replacement for domain-specific monitoring or statistical modelling.

## Export and sharing

The current workflow can export or copy:

- generated or hand-written SQL;
- result data as CSV;
- charts as real PNG images;
- chart images directly to the system clipboard;
- formatted JSON values from the result explorer.

PNG capture preserves chart and legend state while excluding transient hover tooltips and crosshairs.

## Persistent desktop workspace

DataKoala retains enough local state to resume an investigation:

- saved connection profiles;
- named query tabs;
- SQL and Builder drafts;
- active datasource and query-mode choices;
- compatible chart preferences;
- pane and layout state.

Connections are established lazily when required. Explicit Clear results and Reset query actions make it possible to remove derived state without accidentally discarding the whole workspace.

## Reliability and safety controls

The application includes safeguards for exploratory work:

- PostgreSQL read-only sessions by default;
- strict local-file query sandboxing;
- direct read-only SQLite attachments with source-path allowlisting;
- bounded local-file result sets;
- chart point and Series-cardinality limits;
- stale asynchronous response protection;
- cancellation of superseded connection attempts;
- graceful handling of dropped database connections;
- cleanup during disconnect and application shutdown;
- parameterized Builder queries and promoted filters.

## Technology and distribution

DataKoala is built with Electron, React and TypeScript. PostgreSQL access uses pg, local analytical files use DuckDB, charts use Apache ECharts, and application state is managed with Zustand.

The repository is licensed under the MIT License.

## Current limitations

DataKoala is still an early working prototype. In particular:

- Excel workbooks are not yet supported;
- BigQuery is planned but not implemented;
- CodeMirror currently provides syntax highlighting but not schema/table/column autocomplete;
- saved PostgreSQL passwords are currently stored in plain JSON inside Electron userData;
- the SSL toggle encrypts traffic but currently uses rejectUnauthorized false, so it does not verify the server certificate;
- PostgreSQL statements have a 30-second timeout;
- packaged and large-file behavior still needs broader cross-platform release testing.

These limitations should be considered before using the prototype with sensitive credentials or production-critical workflows.

## In one sentence

> DataKoala turns a PostgreSQL database or local data file into an interactive SQL, table and chart workspace—with a transparent visual Builder and lightweight anomaly detection, entirely from a desktop application.
