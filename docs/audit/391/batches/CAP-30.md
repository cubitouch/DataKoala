# CAP-30 — Clipboard, Grafana and diagram sharing audit

**Parent:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration PR:** [#406](https://github.com/cubitouch/DataKoala/pull/406) · **Isolated draft PR:** [#437](https://github.com/cubitouch/DataKoala/pull/437)

**Disposition: PARTIAL — audit scenario authored; all assertions, CI and native visual evidence must be reconciled with the final generating commit before acceptance.** Known product defects are not accepted simply because characterized.

## A. Execution metadata and provenance

| Field | Value |
| --- | --- |
| Integration base at isolation | 88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85 |
| Branch | audit/391-cap-30-sharing |
| Target branch | audit/391-ux-convergence (not main) |
| Source scenario | scripts/visual-preview/audit-batches/cap-30.mjs |
| Initial scenario commit | 0044e7dd7846e555ace41cc434030fbc50e87a27 |
| Corrected scenario commit | ef551888d0e529a59c11bbcc4b25c8fd5f835415 |
| Report commit | Separate commit; see PR history |
| Validation | GitHub Actions Visual Preview for final commit is required; no final-head evidence claimed here |
| Environment | Electron renderer, synthetic IPC, intercepted clipboard and external navigation |
| Viewport | 1440 × 900, DPR 1 and zoom 1 required |

The scenario is audit-only. The production application, shared clipboard helpers, shared audit runner, canonical fixtures, workflows, coverage register, inventory and integration PR were not edited. No real provider credentials or network calls are used by CAP-30.

## B. Authoritative inventory coverage

The supplied brief conflates several IDs. The authoritative inventory specifies the following separate rows; this report preserves their meaning.

| ID | Actual inventory feature | Visual | Behavior |
| --- | --- | --- | --- |
| P17 | Prometheus Grafana handoff | UV — new screenshots pending inspection | SO — URL construction; CAP-30 native assertions pending |
| X06 | Copy current query for applicable sources | UV — new query frames pending inspection | SO — CopySqlButton and clipboard helper; CAP-30 pending |
| X09 | Open or copy Grafana link across observability sources | UV — menu not separately pictured | SO — UI/menu and URL parser; CAP-30 pending |
| X10 | Copy Loki log payload and IDs | UV — new inspector frame pending inspection | SO and prior CAP-19 native characterization, CAP-30 pending |
| X11 | Copy Tempo trace details and identifiers | UV — dedicated controls not proven | SO for TraceQL copy; trace/span identifier copy UV |
| X12 | Diagram clipboard and Excalidraw | UV — new map/plan frames pending inspection | SO for supported exports; CAP-30 pending |
| C06 (related) | PostgreSQL EXPLAIN plan diagram | UV — new diagram frame pending inspection | SO for text and JSON copy; CAP-30 pending |

Legend: VV = each original full-resolution image inspected; BV = native executed deterministic behavior; SO = source or existing tests only; UV = unverified. A screenshot generated but not reviewed is not VV. Separate visual and behavioral dispositions must not be inferred from one another.

## C. Clipboard exact-payload matrix

| Actual source/action | Exact fixture or payload identity | Expected invocation and feedback | Current disposition |
| --- | --- | --- | --- |
| PostgreSQL raw query Copy | Two-line SELECT with nested single/double quotes and preserved newline | One text write; success; no SQL execution | SO, native CAP-30 pending |
| SQL rejected Copy | Same exact SQL | Rejected text write, error notification, no unhandled rejection or draft loss | SO, pending |
| SQL recovery Copy | Same exact SQL | Successful retry, no stale contradictory error | SO, pending |
| PromQL raw Copy | sum(rate(http_requests_total{service="checkout"}[5m])) | Exact PromQL text; existing action label incorrectly says SQL | SO, historical V-08 |
| LogQL raw Copy | {service_name="checkout"} with CAP30 literal line filter | Exact query text, not log data | SO, pending |
| TraceQL raw Copy | { resource.service.name = "checkout" } | Exact current TraceQL text | SO, pending |
| Loki Copy message | Quoted, backslashed, multiline parsed message | Full message bytes, no truncation or refetch | SO, pending |
| Loki Copy raw log | JSON log text carrying message and IDs | Full raw JSON, distinct from displayed message | SO, pending |
| Loki Copy Trace ID | 00000000000000000000000000000301 | Full untruncated identifier | SO, pending |
| Loki Copy Span ID | 0000000000000303 | Full untruncated identifier | SO, pending |
| Loki Copy region and retry | eu-west-1 and 2 | Exact scalar field text | SO, pending |
| Loki rejected raw Copy | Same raw JSON log | Historical known defect: one unhandled rejection and no error message | CAP-19 BV corroboration; independent CAP-30 pending |
| Loki recovery | Same raw JSON log | Transport succeeds again without provider query; feedback may remain absent | SO, pending |
| PostgreSQL Copy plan JSON | Pretty-printed tree root 0, children 0.0 and 0.1 | Parse and deep equality to current plan; no SQL rerun | SO, pending |
| PostgreSQL Copy text plan | CAP30 synthetic text plan | Exact textual clipboard payload | SO, pending |

The scenario records: source surface, real UI action, expected value, actual intercepted payload, invocations, completion/rejection, notifications, provider-request delta and recovery. It separates click, API call, promise completion, exact clipboard bytes and visual feedback. Unsupported actions are not automatically counted as successes.

The SQL raw fixture is a two-line SELECT of a quoted value from the quoted example.events relation. Selected-text versus full-query, repeated content edits and OS pasteboard permissions are not independently accepted unless assertions demonstrate them.

## D. Grafana handoff URL matrix

Synthetic target origin: https://grafana.example.invalid ; path: /explore ; orgId: 17 ; schemaVersion: 1. Custom interval: 2026-08-19 16:00–17:00 UTC; expected epoch-millisecond bounds: 1787155200000 to 1787158800000.

| Source | Datasource UID/type | Query representation | Scope |
| --- | --- | --- | --- |
| Prometheus | cap30-prometheus / prometheus | expr with raw PromQL | Query-level Explore handoff |
| Loki | cap30-loki / loki | expr with queryType=range | Query-level Explore handoff |
| Tempo | cap30-tempo / tempo | query with queryType=traceql | Query-level Explore handoff, not span deep link |

The native scenario should click the menu actions Open in Grafana and Copy Grafana link, intercept external IPC, and assert parsed URL origin/path, organization, datasource UID/type, refId, exact query, query type and UTC range. URL copy must exactly match intercepted navigation. No actual external browser, Grafana authentication or provider acceptance is claimed. Relative ranges and span-deep-link semantics remain UV.

## E. Diagram sharing matrix and intentional formats

| Feature | Action | Intended payload identity | Validation |
| --- | --- | --- | --- |
| Tempo service map | Copy image | PNG data URL of current gateway → checkout → database graph | Decode actual intercepted image bytes, PNG signature, nonzero dimensions, nonflat pixels, hash; pending native |
| Tempo service map | Copy for Excalidraw | Structured excalidraw/clipboard envelope with service node and edge elements | Parse elements and verify three service labels and relationships; pending native |
| Tempo service map | Export SVG | Graph SVG text containing gateway, checkout and database | Intercept save request and validate graph labels; pending native |
| PostgreSQL plan | Copy plan JSON | Tree root Hash Join (0), children Seq Scan (0.0) and Index Scan (0.1) | Exact JSON parse/deep identity with seeded current plan; pending native |
| PostgreSQL plan | Copy text plan | Text plan, distinct from JSON | Exact payload; pending native |

The supported model is deliberately **Tempo PNG/SVG/Excalidraw versus PostgreSQL textual/JSON**; PostgreSQL does not currently expose an equivalent graph-image Copy control. Neither export type should be forced into a universal schema. Native Excalidraw paste and filesystem export are UV.

## F. Notification and recovery characterization

Shared CopySqlButton uses the text-clipboard helper and catches rejection. Source notifications are Copied to clipboard for success and Could not copy: CAP30 clipboard denied for rejected SQL text. Successful recovery must remove the contradictory error. Grafana Copy displays Grafana link copied; image Copy displays Image copied to clipboard; service-map Excalidraw displays Diagram copied to clipboard for Excalidraw; PostgreSQL plan actions display Plan JSON copied and Text plan copied.

Loki LogResultExplorer instead invokes navigator.clipboard.writeText directly. CAP-19 already characterized a synthetic rejected promise with an unhandled rejection and no error toast (V-07). CAP-30 uses a strict known-defect assertion for that *observed* failure and a succeeding retry; this assertion must change once production is fixed. It must not declare the product clipboard contract accepted.

## G. Screenshot manifest and inspection

Maximum five isolated CAP-30 images:

1. cap30-clipboard-query-success-desktop.png
2. cap30-clipboard-query-error-desktop.png
3. cap30-clipboard-log-success-desktop.png
4. cap30-tempo-diagram-export-desktop.png
5. cap30-postgres-plan-share-desktop.png

**Inspection not yet verified in this report.** Before marking VV: download final-head audit artifact, individually inspect each original 1440 × 900 PNG for button identities, query-language labels, feedback, overlapping/clipped text, active inspector, diagram labels, sharing affordances, and readability. Verify DPR/zoom 1, positive semantic geometry, exact manifest, measurements.json, status.json, batches/index.json and all three sourceHead values against the *generating PR head*, not Actions' synthetic merge commit.

## H. Visual Convergence Atlas candidates

| ID | Classification | Owner / inventory | Finding and future direction |
| --- | --- | --- | --- |
| VC30-01 | ALREADY_CONVERGED (native CAP-30 pending) | CopySqlButton / clipboardText, X06 | Existing query-copy rejection/retry has bounded success/error feedback; retain transport |
| VC30-02 | CONFIRMED_DEFECT (V-08, native CAP-30 pending) | QueryEditor PromQL caller, X06 | PromQL accessible Copy action labels SQL; pass correct language to existing control |
| VC30-03 | CONFIRMED_DEFECT (V-07 / CAP-19, CAP-30 pending) | LogResultExplorer, X10 | Direct Loki write rejects without feedback; use existing shared text recovery policy |
| VC30-04 | INTENTIONAL_DIFFERENCE (source) | TraceServiceMap, X12 | PNG, SVG and Excalidraw represent distinct sharing destinations; retain format-specific exporters |
| VC30-05 | INTENTIONAL_DIFFERENCE (source) | ExplainPane, C06/X12 | PostgreSQL plan text/JSON is not equivalent to Tempo graph PNG/Excalidraw |

Comparison references V-07, V-08, UX-20 and reports CAP-19, CAP-21, CAP-23 and CAP-25. Functional defects are separate from harmless differences in implementation ownership. No production corrections are authorized in CAP-30.

## I. Final acceptance, limitations and stop

**PARTIAL.** Scenario authored; no verified final-head screenshot/artifact or successfully executed native assertion is claimed in this report. Outcome must be revised only with demonstrated GitHub Actions success, original-image inspection and exact source provenance. Potentially missing X11 dedicated Tempo identifier-copy controls, limited selected/full-query and alternate time-range tests, native OS paste, and authenticated provider behavior remain explicit UV gaps.

A green characterization scenario can coexist with **failed product acceptance** for the Loki rejection and PromQL label defects. Never turn known defects into passes by silently broadening expectations.

**Stop after CAP-30.** Do not merge, modify #406 or central register, run local lint/format, start AGG-01/Phase 2, or create the final Atlas.
