# DataKoala features

DataKoala is a local-first desktop application for querying and exploring relational data and observability sources. This is a **high-level product overview**; the [datasource feature inventory](datasource-feature-inventory.md) records per-source support, implementation entry points, intended UX ownership, and verification gaps.

> This page describes user-visible workflows as documented in the repository, not a complete end-to-end manual test of every datasource. Availability depends on connection configuration, backend capabilities, and result shape.

## Datasources

| Kind         | Primary workflow                                                                            | Language / engine    |
| ------------ | ------------------------------------------------------------------------------------------- | -------------------- |
| PostgreSQL   | Query relational tables, inspect schemas, build analytics, and optionally Explain / Analyze | SQL / PostgreSQL     |
| BigQuery     | Query datasets, build analytical queries, inspect results                                   | GoogleSQL / BigQuery |
| Local files  | Query CSV, TSV, Parquet, JSON, and JSONL data using DuckDB                                  | SQL / DuckDB         |
| SQLite files | Explore SQLite files through the DuckDB integration                                         | SQL / DuckDB         |
| Prometheus   | Explore metrics and time series using raw expressions or visual Builder                     | PromQL               |
| Loki         | Explore logs, log patterns and volume, using raw expressions or visual Builder              | LogQL                |
| Tempo        | Explore traces, spans, and service relationships using raw expressions or visual Builder    | TraceQL              |

The adapters and Builders differ by datasource: a visually similar control does not imply identical query semantics.

## Common workflows

- Create, save, edit, connect, reconnect, and remove datasource profiles; browse supported source metadata.
- Work in multiple query tabs with per-tab state and connection context.
- Use an editable query or datasource-specific visual Builder; execute and inspect the results.
- Save and restore exploration presets where supported.
- Reset a query, Builder state, and results using the shared reset action.
- Explore compatible tabular results in a table or as line, area, bar, scatter, treemap, or sunburst charts, depending on the datasource and returned shape.
- Filter and inspect rows, copy or export CSV from the table, and use chart-specific interactions when available.
- Export or copy supported chart output and query text.
- Use configured AI assistance for supported query authoring, repair, or visualization scenarios. AI availability is **not** universal across all sources.

## Datasource-specific experiences

### SQL sources

The SQL workspace supports raw SQL and a visual Builder for constructing analytical queries. Schema exploration, query formatting, editor completion, analytical controls, and query execution use provider-aware capabilities and dialects. PostgreSQL separately supports Explain and Analyze; these are not generic capabilities of all SQL providers.

A PostgreSQL profile can also open and keep a Teleport (`tsh`) tunnel for the connection's lifetime through an **Advanced** tab, with `tsh`-driven database-service discovery and clear handling of a missing or expired `tsh login`. See [`docs/architecture/pre-connect-command.md`](architecture/pre-connect-command.md).

### Prometheus

The PromQL Builder supports metric discovery, label selection, rate and range calculations, aggregation and grouping, with time-range and step controls. Charting is oriented toward numerical time series.

### Loki

The Loki workspace supports log search and inspection, indexed label matchers, severity filtering and grouping, parsed fields, log patterns, and log-volume visualizations. An optional volume query can be distinct from the primary log query. Its list, table, patterns and chart representations are intentionally not identical to SQL tables.

### Tempo

The Tempo workspace supports trace discovery and filtering, trace-list inspection, scatter-based exploration, service maps, and detailed trace/span information. Temporal filtering has trace-specific semantics; do not assume SQL-style row filtering.

### Observability handoff

Supported observability workspaces provide Grafana query/time-range handoff actions. The underlying providers and transports may require environment-specific configuration.

## Reliability and safety

The application is designed around read-only data exploration, with provider-specific protections, connection handling, and secure credential storage where applicable. Check source-specific limitations before using a production system. Saved secrets and query data are handled differently from ordinary profile metadata.

Query lifecycle and connection lifecycle behaviors are documented in [the query audit](history/query-lifecycle-audit.md) and [the connection audit](history/connection-lifecycle-audit.md); their earlier findings may describe defects since fixed. Consult the latest code and tests for operational guarantees.

## What should be shared?

Shared UX should cover tab identity, query progress, error states, common toolbar affordances, table/chart interactions, and persistence contracts where semantics match. Keep SQL dialects, observability query languages, log patterns, trace visualization, metrics controls, and provider-specific capabilities distinct. The [feature inventory](datasource-feature-inventory.md) is the detailed working matrix, not this overview.

See the [documentation index](README.md) for release instructions, architectural studies and ongoing engineering guidance.
