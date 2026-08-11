# DataKoala

<img src="build/icon.png" alt="DataKoala logo" width="200"/>

A local-first desktop data explorer for PostgreSQL, BigQuery, SQLite, and local files. Connect a source, write SQL or use the visual Builder, then explore the result as a table or chart.

> Status: early working prototype. The core loop (connect → query/build → table → chart → export) works and is covered by automated tests and smoke checks.

## Why

SQL is excellent for getting rows out of a database, but exploratory work often needs a faster loop between querying, inspecting, filtering, and visualizing. DataKoala keeps SQL front and centre while adding an interactive result table, charts, a visual query Builder, and multiple data-source adapters.

## Features

- **PostgreSQL connections** with saved profiles, stored in Electron's `userData`.
- **BigQuery connections** using Google Cloud application credentials / `gcloud` authentication.
- **SQLite connections** opened read-only through DuckDB's SQLite extension.
- **Local file connections** powered by embedded DuckDB. Choose one or more CSV, TSV, Parquet, JSON, JSONL, or NDJSON files, give each a table alias, and query or chart them with the same object browser, table, and Builder workflow.
- **Paste a PostgreSQL connection string** to fill the form. Handles `postgres://`, `postgresql://`, a `jdbc:` prefix, a `psql ` prefix, surrounding quotes, and libpq `host=… dbname=…` keyword/value form. Percent-encoded usernames survive intact — e.g. `postgres://demo-reader%40proxy-test.example@host:55432/db` parses to the user `demo-reader@proxy-test.example`. Passwordless strings are supported for proxy / IAM / `.pgpass` auth, with a warning so it is not silently surprising.
- **Read-only by default.** PostgreSQL read-only mode is also enforced server-side via `default_transaction_read_only`. Local file and SQLite adapters are read-only.
- **SQL editor** with syntax highlighting (CodeMirror).
- **Visual Builder** for selecting source relations, axes, aggregations, series, time ranges, and filters without hand-writing SQL.
- **Results table** with sorting, text filtering, result filters, JSON exploration, and null/timestamp-aware rendering.
- **Charts** with configurable axes, aggregation, series, filters, anomaly detection, and PNG export/copy.
- **Result-filter promotion.** Keep filters client-side for exploration or use **Apply to SQL** to rerun supported SQL/Builder queries with parameterized predicates.
- **EXPLAIN / EXPLAIN ANALYZE** where supported by the source.
- **Export** SQL, chart PNGs, and result CSVs.

## Stack

Electron + React + TypeScript, bundled by electron-vite. PostgreSQL via `pg`, local files and SQLite via DuckDB, BigQuery via `@google-cloud/bigquery`, charts via ECharts, SQL AST handling via `node-sql-parser`, and application state via Zustand.

```text
src/main      Electron main process: data-source adapters, IPC handlers, exports
src/preload   contextBridge — the only surface the renderer can touch
src/renderer  React UI
src/shared    types + IPC channel names shared across the boundary
```

## Getting started

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

Then create a connection or local source from the left sidebar.

## macOS releases

Version tags matching `vX.Y.Z` build separate native macOS releases for Apple Silicon (`arm64`) and Intel (`x64`). The release workflow produces DMG and ZIP artifacts for both architectures, smoke-tests the packaged applications, generates SHA-256 checksums, and creates a **draft GitHub Release** for manual review before publication.

The macOS builds are currently **unsigned and not notarized** because DataKoala does not yet use an Apple Developer ID certificate. macOS Gatekeeper may therefore warn or block the first launch, and managed work Macs may apply stricter organization policies. Do not disable Gatekeeper globally to install DataKoala.

Published builds will be available from [GitHub Releases](../../releases).

## Development

```bash
pnpm dev            # run with HMR
pnpm build          # bundle main + preload + renderer into out/
pnpm typecheck      # tsc across the node, web and test projects
pnpm test           # Node tests (+ e2e tests, which skip if no database is up)
pnpm test:ui        # Vitest / Testing Library renderer tests
```

### Testing against a real Postgres

The PostgreSQL e2e and database smoke tests use a throwaway local container seeded with ~20k rows of synthetic time-series data:

```bash
pnpm db:up          # start Postgres on :55432 and seed test/seed.sql
pnpm test:e2e
pnpm build
pnpm smoke:db
pnpm smoke:flow
pnpm db:down
```

Override the test target when needed with the `DATAKOALA_TEST_*` variables, for example:

```bash
DATAKOALA_TEST_DB=postgresql://user:pass@host:5432/db pnpm smoke:db
```

### Test layers

| Layer | Command | What it proves |
| --- | --- | --- |
| Node tests | `pnpm test` | Core SQL/Builder logic, adapters, persistence and PostgreSQL e2e when the test DB is available |
| UI tests | `pnpm test:ui` | Renderer component behaviour in JSDOM |
| Renderer smoke | `pnpm smoke` | Electron boots, React mounts, preload bridge exists, chart/export path works |
| DB smoke | `pnpm smoke:db` | Real PostgreSQL adapter: connect, introspect, query, explain and read-only enforcement |
| Flow smoke | `pnpm smoke:flow` | Real UI connection → query → result flow |
| DuckDB smoke | `pnpm smoke:duckdb` | Embedded DuckDB native binding loads in Electron |
| SQLite smoke | `pnpm smoke:sqlite` / `pnpm smoke:sqlite:electron` | SQLite adapter and Electron runtime path |

`pnpm verify` runs typecheck, Node tests, build, renderer smoke, DB smoke and flow smoke in sequence. Additional UI/DuckDB/SQLite/package checks are run separately in CI.

## Notes and limitations

- The results table renders the first 1000 rows; use Export CSV for the full set.
- Promoted SQL-mode result filters wrap a safe single `SELECT`; unsupported statement shapes remain editable and can continue using client-only filters.
- Passwords are stored in plain JSON under Electron's `userData`. Moving these to the OS keychain is a known todo before this should touch anything sensitive.
- **PostgreSQL SSL encrypts but does not currently verify certificates.** The `ssl` toggle uses `rejectUnauthorized: false`. `sslmode=verify-ca` / `verify-full` in a pasted string are surfaced as a warning rather than silently presented as verified TLS.
- PostgreSQL statement timeout is 30s.
- PostgreSQL connections pass discrete fields to `pg` rather than a re-serialized connection string, so credentials are never round-tripped through percent-encoding.

## License

Copyright © 2026 Hugo Carnicelli.

DataKoala is open-source software licensed under the **GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)**. See [`LICENSE`](LICENSE) for the full terms.

The copyright holder may also offer DataKoala under separate commercial/proprietary terms. If outside contributions are accepted in the future, contributor terms should preserve the rights needed for any such dual-licensing model.

## Thanks

[Here is to our beautiful logo](https://www.flaticon.com/free-icon/koala_9308987?term=koala&page=1&position=7&origin=tag&related_id=9308987)
