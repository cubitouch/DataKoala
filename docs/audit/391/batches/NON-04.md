# NON-04 — Provider execution and read-only restrictions

## A. Metadata

- Parent: #391; integration: #406, branch **audit/391-ux-convergence**.
- Exact integration base (fetched before writing): **369061f0641cd3ae86c79e9c85998dcef97c8412**.
- Isolated branch: **audit/391-non-04-provider-execution**.
- Temporary draft PR: see linked PR in the handoff, targeting the integration branch (not main).
- Characterization source commits: **4ac9c82cc6b5d8f74b317004792264d1d8222dd1** (provider guards), **b497b1b7f52f12d4f614921f76ef028e73eff18c** (file boundaries).
- Final report commit and verification head: see draft PR head at handoff; a commit cannot contain its own SHA without altering that SHA.
- Date: 2026-10-15. Inventory: **C11, C15, C16, C18, S27, S28**.
- Audit only. No production changes, shared fixtures, Electron runner, workflows, master inventory or authoritative coverage register changes. No local lint or formatting commands.

Preparation: read root AGENTS.md (no applicable nested AGENTS.md found), datasource inventory, UX implementation audit, coverage register, README, adapter sources/tests, session registry/IPC/preload and PostgreSQL lifecycle read-only checks. The batch-specific prohibition on local lint/format supersedes generic root guidance.

**Evidence legend:** BV = a named behavioral test executed with a recorded result; SO = source or existing-test inspection without a newly verified run; UV = not verified; N/A = genuinely nonvisual contract. Tests newly added here are *proposed characterization* until CI confirms them. A mock of a BigQuery job is not a real BigQuery permission test.

## B. Independent coverage matrix

| ID | Behavior | Visual | Ownership | Named assertions and remaining gaps |
| --- | --- | --- | --- | --- |
| **C11** | **SO; pending BV** | N/A | bigquery-script.ts parser; BigQuerySession.query, dry-run and SDK job execution | Existing bigquery-script.test.ts cases permit DECLARE/SET/final SELECT, reject DML/DDL/dynamic scripts and malformed quotes. New non04-provider-guards.test.ts checks dry-run first, permitted SCRIPT final output, validation-before-job and no job after a rejected dry-run statement type. No live BigQuery SCRIPT job, IAM or remote script child-job verification. |
| **C15** | **SO; pending BV** | N/A | LocalFilesAdapter.open/registerFileView, DuckDB readers/aliases | Existing local-files-adapter.vitest.ts exercises format detection, Parquet/JSONL/delimited fixtures and binary refusal. New non04-file-boundaries.vitest.ts adds explicit TSV/JSONL/canonical selected symlink and unselected neighbour rejection. Inference variability, malformed-but-valid-looking text, file churn during connection and cross-platform native addon remain UV. |
| **C16** | **SO; pending BV** | N/A | configureFileSandbox, realpath/allowed_paths, DuckDB settings, assertDuckDBReadOnlyQuery | Existing native adapter test: allowed file reads, six unselected read APIs, glob rejection, locked settings and COPY rejection. New test checks adjacent file and symlink, immutable source hashes and no output file. Filesystem boundary not proven against all DuckDB versions, arbitrary functions or platform/TOCTOU races. |
| **C18** | **SO** | N/A | validateSqliteOriginal, packaged SQLite extension, openDatabase ATTACH READ_ONLY, shared DuckDB guard | Existing sqlite-file-adapter.test.ts validates missing, empty, invalid header, WAL and extensionless files; sqlite-file-adapter.integration.vitest.ts checks read-only catalog flag, discovery, SELECT, write/ATTACH/read_csv/COPY/LOAD rejection, source SHA/size/mtime and no sidecar files, corrupted data, external update/reconnect. **Integration test was inspected, not newly executed**; extension/packaged Electron availability UV. |
| **S27** | **SO; pending BV** | N/A | PG runQuery + pg client/server; BQ script scanner/SDK; DuckDB extractStatements; shared QueryEditor passes raw text | Existing BQ scanner permits supported phases and multiple SELECTs; local and SQLite enforce exactly one extracted statement; PG client forwards SQL and parameters, with read-only starter check only. New tests characterize comment/quoted semicolons and PG lexical multi-statement limitation. Actual PG multi-results, partially committed scripts and server transaction semantics UV. |
| **S28** | **SO; pending BV** | N/A | Adapter-specific guards + database settings/permissions; main query dispatch | Existing PG server read-only smoke has DELETE and data-modifying CTE checks; BQ guards + dry-run statementType; DuckDB extracted type + locked external access; SQLite attach READ_ONLY. New tests check the first three. Real provider bypass resistance and hostile host runtime UV; the PG starter-only precheck is not a security boundary. |

These dispositions are deliberately conservative: an existing test file or new committed test is not proof that its assertions ran successfully in this NON-04 revision. CI/provenance in section G controls any later upgrade to BV.

## C. Provider capability matrix

| Contract | PostgreSQL | BigQuery | Local files / DuckDB | SQLite via DuckDB |
| --- | --- | --- | --- | --- |
| Normal SELECT | Supported via pg client; true server result | Supported; lexical precheck then dry-run metadata then execution job | Supported via streamAndReadUntil; 10,000 returned rows maximum | Supported on attached SQLite tables; 10,000 returned rows maximum |
| Multi-statement | SQL forwarded to pg without application splitter; acceptance and output shape depend on pg protocol and parameters; **not uniformly certified** | Supported subset of DECLARE, user SET and SELECT/WITH; final statement SELECT/WITH; scripts rely on BigQuery SDK returning final result | **Rejected** when extractStatements count differs from one; quoted semicolons remain inside one statement | **Rejected**, same DuckDB guard |
| DML/DDL | Read-only profile adds default_transaction_read_only startup setting; first keyword heuristics reject obvious writes; user can intentionally disable profile read-only | Explicit application scanner rejects top-level mutations/control flow/dynamic SQL, plus dry-run statementType only SELECT/SCRIPT. Real IAM governs underlying permissions | SQL starter denylist plus prepared StatementType SELECT/EXPLAIN; views created by adapter only during controlled setup | Same DuckDB statement guard, plus SQLite ATTACH with READ_ONLY |
| External file access | PostgreSQL server privileges/filesystem, not a client-local sandbox | BigQuery IAM/storage controls, not client-local filesystem | Canonical user-selected allowed_paths; external access, extension autoload/install, persistent secrets disabled; configuration locked | Packaged extension loaded before lockdown; canonical SQLite path allowlisted and attached READ_ONLY; external access disabled/locked |
| Validation owner | First-token UX hint in main postgres.ts; PostgreSQL server/role actual enforcement | Main adapter scanner; SDK dry-run, statementType metadata, BigQuery IAM | DuckDB extract/prepare; DuckDB connection settings plus selected-path allowlist | SQLite original-file validation; DuckDB adapter SQL guard; SQLite scanner/attachment and DuckDB settings |
| Partial execution / failure | PG result and transaction semantics depend on server and pg protocol; unverified | Script phases can have provider-level effects/partial execution if local scanner or dry-run semantics prove inadequate; live side effects not tested | Multiple statements fail before execution; individual SELECT/EXPLAIN effects limited by DuckDB/OS controls, not an arbitrary-SQL proof | Same single-statement rule; source is attached read-only; sidecar/permission behavior depends on extension and OS |

**Intentional difference:** PG allows an explicitly writable connection; BQ/LF/SQ profile types are read-only. BQ has a restricted scripting subset; DuckDB rejects multiple statements. Never unify these policies merely to make the UI similar.

## D. Security and execution boundaries

1. **Renderer → preload → main:** QueryEditor sends raw text and parameters using preload.query.run and IPC.QUERY_RUN. Main src/main/index.ts maps IPC to db.runQuery, wrapping query errors in QueryRunResponse. TypeScript annotations at IPC do not validate arbitrary runtime payloads by themselves. Query probe, series statistics, and PG EXPLAIN are separate explicit IPC operations and require independent trust-boundary review.
2. **Main dispatch:** src/main/db.ts SessionManager identifies the connected session, then dispatches QueryRequest through its DataSourceSession.query. No universal SQL parser is applied in this dispatch; source adapters own policy.
3. **PostgreSQL:** postgres.ts assertReadonly examines only the leading keyword. buildPoolConfig sets '-c default_transaction_read_only=on' for a read-only profile at pool creation; actual server transaction settings and role permissions own write refusal. The application does **not** prove an immutable session-level restriction against settings mutation or multiple statements.
4. **BigQuery:** bigquery-script.ts scans statement separators outside comments/quotes, allows SELECT/WITH/DECLARE and limited user SET, rejects explicit system SET and pipe syntax. BigQuerySession.query performs SDK dry-run and accepts reported SELECT or SCRIPT before issuing the execution job; maximumBytesBilled is optional. Script children, dry-run completeness and IAM remain provider-side; estimateQuery only performs a dry run; cardinality probes execute separately generated/validated SQL rather than accepting arbitrary query text.
5. **Local files:** adapter resolves each selected path with realpath, configures DuckDB allowed_paths, disables external filesystem access and extension/persistent-secret facilities, registers selected files as views, then locks configuration. User SQL must extract to one prepared SELECT or EXPLAIN, plus starter denylist. The DuckDB engine and operating system ultimately enforce path access. A selected symlink permits the resolved target, not the containing directory.
6. **SQLite:** validates readable regular file and SQLite header, rejects a non-empty WAL; loads a packaged sqlite_scanner extension, allowlists canonical original, ATTACHes SQLite database READ_ONLY, disables external access and locks settings. SQL uses the same DuckDB single-statement guard. Read-only SQLite attachment is not by itself a complete DuckDB filesystem sandbox.

## E. Scenarios and evidence

| Category | Expected / observed by source or existing test | Side effects | Confidence and limitations |
| --- | --- | --- | --- |
| BQ safe script with DECLARE/SET/intermediate SELECT/final SELECT | Existing scanner test permits syntax; new injected SDK test expects dry-run then execution and final result only | None in deterministic mock | Pending CI; real BigQuery child jobs UV |
| BQ mutating/admin/EXECUTE IMMEDIATE script | Scanner rejects before createQueryJob; existing and new tests assert refusal | Zero mocked jobs expected | No live remote verification |
| BQ dry-run reports non-SELECT/non-SCRIPT | Adapter raises validation before execution job; new test checks only one dry-run | Zero execution jobs expected | Synthetic metadata, not proof of actual provider classification |
| PG read-only connection / writable opt-out | buildPoolConfig startup option conditional; existing main smoke checks server rejection for DELETE/data-modifying CTE; new test checks generated option | New test opens no connections | Server smoke from existing source not rerun; role and session configuration UV |
| PG multiple statements with read-only SELECT prefix | Leading-token guard does not inspect later statements; new characterization passes text to classifier **only** | Zero database calls | Potential bypass lead, not evidence of successful mutation |
| LF CSV/TSV/Parquet/JSON/JSONL | Existing adapters choose readers by extension hint with fallbacks; existing Parquet/JSONL/TSV coverage, new explicit .tsv/.jsonl expected readable | Synthetic fixture reads only | CI pending; parser/schema inference not guaranteed for every data shape |
| LF unselected absolute/symlink paths, glob and writes | Existing adapter test expects filesystem-disabled errors for unselected files and denied COPY; new test preserves SHA and checks no output | No intended file modification | Native DuckDB version/platform and exotic paths UV |
| LF comments, quoted semicolons, multi-statement SQL | Prepared statement classifier should accept one quoted semicolon, reject two statements and forbidden DML/config SET | No intended modification | Native test pending |
| SQ missing/empty/corrupt/WAL source | Existing SQLite validation tests expect precise errors; existing integration rejects corrupt database and confirms read-only attachment | Source preserved according to existing assertions | Source/test inspection only here; packaged extension not newly run |
| SQ source preservation and read-only query | Existing real-adapter integration test hashes source before/after, checks no -wal/-shm/-journal and refusal for DELETE, COPY, LOAD, ATTACH, unselected CSV | Existing test asserts no source mutation; not re-executed | Native integration, SQLite driver/extension/OS verification pending |

No live, remote or user-owned database was targeted. No intentionally destructive SQL was executed: rejected-operation fixtures are confined to disposable synthetic resources, and PostgreSQL potential multi-statement bypass text is passed only to a local precheck.

## F. Findings / future Atlas candidates

| ID | Classification | Inventory / impact | Evidence / owner | Follow-up direction |
| --- | --- | --- | --- | --- |
| **NON04-01** | **Unverified security boundary; priority high** | S28/S27; PG read-only setting is a startup default, and the first-keyword precheck alone accepts a string beginning with SELECT followed by more statements | postgres.ts assertReadonly/buildPoolConfig/runQuery; new synthetic lexical characterization | Security review of session settings mutability, protocol multi-statement effects and DB role restrictions **on disposable local PG only**. Do not claim proven write exploit or remediate in audit. |
| **NON04-02** | **Intentional difference / already-converged dispatch** | S27/S28/C11; BQ scripts vs DuckDB single-statement vs configurable PG | db.ts dispatch, BQ scanner, DuckDB extracted StatementType tests | Preserve adapter-specific policies; shared IPC/query-result contract is sufficient. |
| **NON04-03** | **Unverified security boundary** | C16/S28/C18; DuckDB allows prepared EXPLAIN in addition to SELECT, and security also depends on native settings/OS | local-files-adapter.ts assertDuckDBReadOnlyQuery; sqlite-file-adapter.ts config | Review EXPLAIN ANALYZE/side-effectful functions and file/extension operations in an isolated, disposable DuckDB environment. No real-file or exploit attempt here. |
| **NON04-04** | **Intentional provider behavior / residual verification** | C11/S28; dry-run statementType SCRIPT is not per-child policy evidence | bigquery-script.ts, BigQuerySession.query; existing and new mock tests | Validate dry-run and child-job guarantees with permission-restricted sacrificial BigQuery project if approved; retain local scanner. |
| **NON04-05** | **Already-converged shared implementation** | C15/C16/C18/S28; local-file and SQLite SQL queries share DuckDB classification and result cap | assertDuckDBReadOnlyQuery/queryResultFromDuckDBReader; existing real-adapter tests | Preserve reuse. Their connection setup and allowed paths should stay deliberately separate. |
| **NON04-06** | **Unverified file-boundary limitations** | C15/C16/C18; selected-file canonicalization and SQLite WAL handling have platform/TOCTOU and external native-extension dependencies | realpath, allowed_paths, sqlite_scanner attachment and fingerprint tests | Characterize symlink replacement, malformed shape and packaged extension across supported platforms; do not overstate sandbox completeness. |

**Atlas:** These are semantic, nonvisual candidates for the future convergence ledger, not invented screenshot entries. No new visual image is appropriate. No confirmed production defect has been established by the NON-04 additions at report creation.

## G. CI, test commands and provenance

- Base: 369061f0641cd3ae86c79e9c85998dcef97c8412.
- New isolated test files: src/main/adapters/non04-provider-guards.test.ts (Node 24 strip-types test); src/main/adapters/non04-file-boundaries.vitest.ts (Vitest/native DuckDB).
- Existing named evidence sources: bigquery-script.test.ts, bigquery-adapter.test.ts, local-files-adapter.vitest.ts, sqlite-file-adapter.test.ts, sqlite-file-adapter.integration.vitest.ts and src/main/index.ts PostgreSQL smoke.
- Focused proposed commands: node --experimental-strip-types --test src/main/adapters/non04-provider-guards.test.ts ; pnpm exec vitest run --config vitest.renderer.config.ts src/main/adapters/non04-file-boundaries.vitest.ts ; and separately pnpm smoke:sqlite where packaged SQLite extension is available.
- **At report creation:** runtime and CI results for new tests are pending; no local node_modules/working checkout or authenticated external providers in this agent environment. No local tests, lint or formatting have been claimed.
- Existing preintegration tests are inspected as assertions, not newly credited as executed. Formatting/typecheck failures, if any, need attribution from actual CI logs, not inference.

## H. Completion disposition

**PARTIAL — CI/test evidence pending.** The six inventories have independent source-level dispositions and provider execution boundaries are mapped, but new tests are not yet confirmed running; packaged SQLite extension, PostgreSQL server enforcement in this branch and authenticated BigQuery remain UV. Do not mark EVIDENCE_COMPLETE or update PR #406/authoritative register on source inspection alone.

Integration owner follow-ups: once tests are green, reassess each ID's BV status and whether scoped nonvisual evidence is adequate; carry NON04-01/03/04/06 security leads into a targeted follow-up review, and reconcile six coverage register rows without converting mock/source evidence into live-provider guarantees. Stop at NON-04.
