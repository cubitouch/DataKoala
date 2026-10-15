# NON-05 — Safe generated SQL and dialect boundaries

## A. Metadata

- Parent: #391; integration PR: #406 (`audit/391-ux-convergence`).
- Inventory: **S16**; classification: Hybrid; original register status: PARTIAL / NON-05 NOT_STARTED.
- Exact integration base fetched before writing: **906960284260175f88761d9ff93fe2fd79351dbd**.
- Isolated branch: **audit/391-non-05-safe-sql**.
- Temporary **draft PR #418**, targeting `audit/391-ux-convergence` rather than `main`.
- Characterization test commits: **a6cade6300e554f453121b63da15c1bb017e356b** (initial 12 cases), **e50b8f7796382767cd0da424f4996c88a4aa7dc2** (multi-column tuple case; final test source).
- Final report commit: refer to PR #418 final HEAD at handoff (a commit cannot accurately contain its own SHA).
- Date: 2026-10-15. Nonvisual audit only; no production, fixture, workflow, coverage-register or integration-PR edits. No local linting or formatting.

Preparation: root `AGENTS.md`, datasource inventory S16, UX implementation audit/coverage register, SQL Builder transition/async architecture notes, existing `builderSql`/`builderPromotedFilters`/series tests, NON-04 provider-boundary report, generator, Builder UI handoff, query IPC and four providers were inspected. The explicit batch instruction not to run local lint/format overrides generic repository guidance.

Evidence legend: **BV** = named assertion executed successfully in GitHub Actions (including expected-failure characterization); **SO** = current-source or existing-test inspection, without asserting that a provider executed; **UV** = provider/host behavior unverified; **N/A** = visual evidence inapplicable. An expected-failure test passing as expected is *evidence of the presently failing desired invariant*, not evidence of a fixed defect.

## B. Coverage disposition

| Inventory | Behavioral | Visual | Implementation owner | Named evidence / residual gaps |
| --- | --- | --- | --- | --- |
| **S16** | **BV (13 NON-05 assertions in CI; 3 expected failures)** plus SO for existing tests | **N/A — nonvisual** | `src/renderer/src/lib/builderSql.ts`, `builderPromotedFilters.ts`, `resultFilters.ts`, `src/shared/seriesCardinality.ts`; `BuilderPanel.tsx` owns generation/preview/dispatch/handoff; `src/main/db.ts` and adapters own execution | `non05-safe-sql.test.ts` plus existing `builderSql.test.ts`, `builderPromotedFilters.test.ts`, `BuilderPanel.generatedSql.test.tsx` and `NON-04.md`. Provider syntax/permissions, BigQuery quoting conformance, SQL-open behavior with native renderer, pathological values and production databases remain UV. |

Result: **PARTIAL**. Generator and handoff contracts are meaningfully characterized, but three concrete correctness invariants currently fail, and dialect/provider semantics cannot all be demonstrated locally. Do not rewrite the authoritative coverage register from this isolated branch.

## C. Dialect capability matrix

| Boundary | PostgreSQL | BigQuery / GoogleSQL | DuckDB (local files) | SQLite via DuckDB |
| --- | --- | --- | --- | --- |
| Dialect owner | `postgres` | `google-sql` | `duckdb` | `duckdb`; **not** an independent SQLite generator |
| Quoted columns | ANSI double quote, internal `"` doubled; BV including reserved/unicode/semicolon | Backticks, embedded backticks doubled in `builderSql`; BV generated output, provider grammar UV | Same double-quote path as PG; BV | Same shared DuckDB path; SO |
| Qualified table | Each schema/name separately double-quoted; embedded schema periods remain one quoted name | Single backtick-quoted `project.dataset.table` composite, assembled from split schema plus name; BV basic qualified shape | Schema/table quoted separately; BV | Catalog/schema mapped by adapter; same DuckDB SQL quoting, server-side mapping UV |
| Filters | Promoted filter helper emits `$1`… positional params; null checks inline, nested tuples parenthesized | Helper first builds PG-style text then globally converts `"` to backtick and `$n` to `?`; BV common names, **broken for source names containing double quotes** | Same PG-style positional params; BV | Same as DuckDB |
| Time bounds | Custom `$n` params, rolling validated interval expressions, PG time-zone-specific `date_trunc` | Custom `CAST(? AS DATE/DATETIME/TIMESTAMP)`, rolling DATE/DATETIME/TIMESTAMP expressions; BV basic order, real provider UV | Custom `$n`, DuckDB timestamptz expression special-case, PG-like non-tz expressions | Same DuckDB generator and dispatch |
| Run parameterization | `pg client.query({text,values})`, SO | SDK `createQueryJob({query,params})`, dry-run/read-only scanner, SO | `streamAndReadUntil(sql, limit, parameters)` after prepared-statement guard, SO | DuckDB bound values after guard and read-only attachment, SO |
| SQL-mode handoff | Inline materialization replaces `$n` lexically; **quoted `$1` rewritten** (BV expected failure) | Inline materialization replaces all `?` lexically; **quoted `?` consumed** (BV expected failure); escaping syntax shared with PG | Same `$n` materializer and limitation | Same DuckDB materializer and limitation |
| Unsupported Builder predicates | LIKE/IN, arbitrary operators and generic OR groups are not Builder filter options; invalid restored operators filtered; BV | Same scope; GoogleSQL-specific casts of promoted time-bucket values need provider review | Same scope | Same scope |

`ResultFilter` scalar operators are equals, notEquals, isNull, isNotNull; range/notRange exist for result filters but only compatible promoted bounds can be serialized to source SQL. No generic LIKE/IN escaping or user-written predicate interpolation occurs in this Builder path. Raw SQL is a distinct feature and does not become “safe generated SQL” merely by using the common editor.

No source-level guarantee is inferred for empty or malformed identifiers: quoted empty strings are constructed rather than rejected by the generator; actual metadata/provider constraints and parser outcome are UV. NUL/control-character and BigQuery backslash-quote behavior likewise lack provider acceptance evidence.

## D. Trust-boundary / handoff map

1. **Renderer/Builder state:** `BuilderPanel` reads tab-scoped relation, selected X/Y/Series, independent time source/range and promoted result filters. UI constrains many choices with loaded metadata. A forged or stale renderer input is not thereby guaranteed safe.
2. **Generator:** `generateBuilderQuery` produces {`sql`, `parameters`}; relation/axis identifiers are directly interpolated after dialect quoting, filter values and custom bounds remain separate parameters. `resolveBuilderPromotedFilters` validates provenance/available Builder columns and builds PG-style predicates. `builderSql` then remaps their parameters and transforms their dialect syntax.
3. **Preview:** `formatSqlOrOriginal(generatedSql, formatterDialect)` supplies the visible/copyable generated **template SQL**; parameters are displayed separately. Preview/copy is *not* an executed SQL/parameter payload and is not proof of provider validity.
4. **Explicit Builder Run:** `api.query.run(profileId, generatedSql, generatedQuery.parameters)` sends the **parameterized** pair via preload/`IPC.QUERY_RUN`, not the materialized preview. `db.runQuery` dispatches this pair to the connected `DataSourceSession`. Existing Builder lifecycle guards own tab/profile freshness, not SQL security.
5. **Explicit “Open in SQL mode”:** `materializeSqlParameters` lexically inlines values then `formatSqlOrOriginal` copies text into the raw editor. The separate raw Run subsequently sends this text with **no original Builder parameter array**. Thus the editing handoff is a correctness-sensitive *different* path from Builder Run; the three expected-failure test cases concern this conversion/generation boundary.
6. **Main/IPC:** `src/main/index.ts` accepts runtime `id/sql/parameters` and wraps `db.runQuery` failures. TypeScript types are not a runtime trust boundary. Provider restrictions are distinct: PG leading-token check and connection/role read-only configuration; BigQuery script scanner + dry-run + IAM; DuckDB/SQLite one prepared SELECT/EXPLAIN plus native filesystem/read-only settings.
7. **Actual provider:** None of these deterministic tests proves database parsing, permission enforcement, escape interpretation, BigQuery SDK coercion, transaction behavior or hostile provider execution. NON-04 owns that broader assessment; its PARTIAL security leads remain independent.

A correctly escaped *parameter value at Builder Run* must not be confused with a correctly materialized *raw SQL string*. Nor is correct identifier quoting equivalent to proof of a safe database role.

## E. Adversarial case ledger

All BV below were executed on the final test source in CI **run 38769180343**, job **116540386872**, at `e50b8f7796382767cd0da424f4996c88a4aa7dc2`. The isolated test file had **13 cases: ten ordinary passes and three expected failures**, all reported successful by Vitest. Examples give key actual SQL fragments, not complete queries.

| Input and intended invariant | Actual result/evidence | Confidence |
| --- | --- | --- |
| PG/DuckDB schema `Mi"xed.schema`, table `orders; -- drop`, column `na"me; /* comment */`, reserved `select`, Unicode | `FROM "Mi""xed.schema"."orders; -- drop"`; quote doubled; column/series safely delimited syntactically by generator; no bound values | BV generator; provider parsing UV |
| GoogleSQL `billing-prod.analytics.order events`, `select`, Unicode, embedded backtick | `FROM \`billing-prod.analytics.order events\`` and `\`a\`\`b\``; no `NULLS LAST`. Real GoogleSQL escape conformance unverified | BV source output / UV grammar |
| Strings containing apostrophe, semicolon, fake DROP/comment markers, `?` and `$1`; backslashes | Values only in ordered parameters; template has `$1/$2` or `?/?`, no inline payload | BV generator; provider bind execution UV |
| `IS NULL` and `notEquals false` combined | `IS NULL AND … IS DISTINCT FROM`, bound `false`; order preserved | BV |
| Restored operator `like` and valid `equals` | Deserializer discards unsupported operator; valid filter remains and is parameterized | BV |
| Non-time-bucket range on categorical axis, unknown source column | `generateBuilderQuery` rejects promotion with "no longer matches" | BV |
| Independent custom temporal range plus categorical query filter | First two bound values are time limits; third is query filter; BigQuery custom bounds use `CAST(? AS TIMESTAMP)` | BV |
| Multiple query predicates and null check | `WHERE "region" = $1 AND "status" IS NOT NULL`; ordered scalar predicates | BV |
| Two-column promoted Series tuple (`region=EU`, `channel=web`) | `WHERE ("region" IS NOT DISTINCT FROM $1 AND "channel" IS NOT DISTINCT FROM $2)` with exactly two bound values | BV |
| Literal apostrophe/NULL/bool/finite numbers/NaN or Infinity; missing `?` | Apostrophe doubled, NULL/TRUE/FALSE/numbers rendered, non-finite rejected, missing positional parameter rejected | BV in materializer only |
| PG materialization with quoted `"$1"` plus real `$1` | **Desired invariant fails:** substitution also changes identifier text to `"'safe'"` | BV expected failure, **NON05-01** |
| GoogleSQL materialization with quoted `\`status?\`` and one real `?` | **Desired invariant fails:** quoted `?` consumes the first binding; subsequent `?` reports missing value | BV expected failure, **NON05-02** |
| GoogleSQL promoted source column `a"b` | **Desired invariant fails:** intermediate `"a""b"` becomes `\`a\`\`b\`` rather than preserving the double quote; SELECT and WHERE now reference different strings | BV expected failure, **NON05-03** |

No live database, credentials, destructive SQL execution, screenshots or Electron runner changes were used. Values resembling malicious SQL were passed only to pure generators/materializers.

## F. Findings and future Atlas candidates

| ID | Classification / impact | Source evidence and owner | Remediation direction (not implemented) |
| --- | --- | --- | --- |
| **NON05-01** | **Confirmed correctness defect (high)** — PG/DuckDB “Open in SQL mode” can alter quoted identifier text containing `$n`, potentially changing the subsequent raw SQL semantics | BV expected failure; `builderSql.materializeSqlParameters` regex, `BuilderPanel.openGeneratedSqlMode` | Use SQL-aware/token-aware materialization or explicit safe representation; verify exact raw/open parity, strings/comments and binding counts |
| **NON05-02** | **Confirmed correctness defect (high)** — GoogleSQL quoted `?` causes materializer to consume parameter positions or throw during handoff | BV expected failure; same owners | Lexer-aware binding replacement, with BigQuery quoted identifier/literal tests and explicit error UI |
| **NON05-03** | **Confirmed generated-query identifier mismatch (medium/high)** — GoogleSQL promoted field with embedded `"` differs between SELECT and WHERE; actual database error/provider interpretation UV | BV expected failure; `builderPromotedFilters` emits PG double quotes, `builderSql` replaces all double quote characters | Quote columns in dialect-aware predicate generator rather than global character replacement; preserve existing tuple/provenance semantics |
| **NON05-04** | **Unverified dialect syntax and unnecessary duplication candidate (medium)** — GoogleSQL quoting logic differs between Builder `quoteIdentifier`/relation names, `seriesCardinality.quoteGoogle` and `wrapSqlWithResultFilters`; backtick, backslash and control-char escaping policy not unified | SO: three independently authored quoted-identifier strategies; provider grammar UV | Establish GoogleSQL lexical contract with parser/provider tests before any focused deduplication; do not impose universal cross-dialect escaping |
| **NON05-05** | **Unverified materialized literal semantics (medium)** — one `formatPostgresLiteral` emits raw backslashes/controls for PostgreSQL, DuckDB and GoogleSQL despite different string literal rules; renderer only uses it for editable handoff, not parameterized Builder Run | SO; exact escaped apostrophe BV but provider interpretation UV | Compare materialized raw execution with parameterized run using disposable provider fixtures; consider dialect-aware materialization or avoid inline substitution |
| **NON05-06** | **Unverified provider type compatibility (medium)** — promoted GoogleSQL time bucket and scalar comparisons may use uncast `?` where independent time limits explicitly cast to temporal type | SO: `resolveBuilderPromotedFilters` and `buildBuilderPredicates`; CI checks strings only | Check DATE/DATETIME/TIMESTAMP filters against BigQuery typed parameters and generated SQL before deciding on casts |
| **NON05-07** | **Intentional / already converged** — standard Builder Run keeps values bound; dialect adapters enforce distinct execution rules; SQLite reuses DuckDB, and supported filter vocabulary intentionally excludes arbitrary LIKE/IN/free-form SQL expressions | BV/SO, NON-04 | Preserve separated generator and provider policy; do not conflate visual query preview with execution validation |

All are **nonvisual Atlas candidates** for the eventual integration ledger; do not invent a screenshot. NON05-01/02 are materialized raw-mode correctness defects, **not a proved successful SQL injection or database write**. NON05-03 demonstrates a mismatched generated column reference, with provider acceptance still UV.

## G. CI and provenance

- Exact base: `906960284260175f88761d9ff93fe2fd79351dbd`; test commits `a6cade6300e554f453121b63da15c1bb017e356b` and `e50b8f7796382767cd0da424f4996c88a4aa7dc2`.
- New test: `src/renderer/src/lib/non05-safe-sql.test.ts`.
- Deterministic command in CI: `pnpm test`, which runs Node main/shared tests, Vitest renderer suite and visual-preview script tests; `pnpm smoke:sqlite` follows. No local test, lint or formatter was invoked.
- Verified final-test-source run: [CI run 38769180343](https://github.com/cubitouch/DataKoala/actions/runs/38769180343), unit job 116540386872 **success**. Renderer Vitest reported 86 test files passed; **661 ordinary passes and four expected failures** across the whole renderer suite (including **three** newly added NON-05 expected failures). Node suite: 492 passes/zero failures; preview script suite: 31 passes/zero failures; SQLite smoke: one passing file. Production build job 116540387015 **success**. Earlier [run 38768467671](https://github.com/cubitouch/DataKoala/actions/runs/38768467671) independently passed the initial 12-case test source.
- **Quality failed on formatting in 18 files** in run 38769180343: **2 NON-05-owned files** (`docs/audit/391/batches/NON-05.md`, `src/renderer/src/lib/non05-safe-sql.test.ts`) plus **16 inherited/integration-owned files** (coverage register, CAP-18, NON-01/02/03/04/06 reports and their separate tests). Later lint/typecheck did not execute. None was formatted locally; do not mislabel the result as green or conflate independent agents' changes with NON-05 regressions.
- Other jobs (UI, macOS/packaging, previews) have separate statuses and do not establish correctness of SQL provider execution. Check final PR #418 runs for their definitive conclusions.

## H. Completion disposition

**PARTIAL — concrete source-level correctness failures remain, and dialect/provider semantics are UV.**

S16 has an explicit behavioral/visual/ownership disposition, dialect matrix, trust-boundary trace, adversarial generator assertions, stable findings and repeatable CI provenance. The ten ordinary passing assertions and three expected failures provide bounded evidence; they do not repair the failures or verify a live BigQuery/PostgreSQL/DuckDB/SQLite execution contract. Native renderer handoff, empty/malformed names, provider parameter coercions and genuine injection resistance still require targeted follow-up.

Integration agent: reconcile S16 into #406 from this temporary draft PR after reviewing failure dispositions and CI; include NON05-01 through NON05-06 as semantic Atlas candidates. Do **not** mark S16 EVIDENCE_COMPLETE, modify the authoritative register directly from NON-05, merge this PR, apply production fixes, execute another batch or begin Phase 2.
