# CAP-30 — Clipboard, Grafana and diagram sharing

**Parent issue:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration PR:** [#406](https://github.com/cubitouch/DataKoala/pull/406) · **Isolated draft PR:** [#437](https://github.com/cubitouch/DataKoala/pull/437)

**Final disposition: PARTIAL.** The CAP-30 Electron characterization ran successfully and all five screenshots were inspected, but confirmed product defects and unsupported X11 identifier-copy controls prevent full product acceptance. An expected known-defect assertion is not a production fix.

## A. Execution metadata and provenance

| Item | Verified value |
| --- | --- |
| Integration base at isolation | 88c8ba58c95a2ab4faadfc07a8227cbb9b2ade85 |
| Branch | audit/391-cap-30-sharing |
| PR base | audit/391-ux-convergence, not main |
| Scenario | scripts/visual-preview/audit-batches/cap-30.mjs |
| First scenario commit | 0044e7dd7846e555ace41cc434030fbc50e87a27 |
| Verified generating scenario HEAD | e9c893853586a3218d4b0c3ed3e103c82d04d9b3 |
| Report-only verification commit | See subsequent commit on PR #437; it does not change the generating scenario HEAD |
| Visual Preview workflow | [Run #38815371248](https://github.com/cubitouch/DataKoala/actions/runs/38815371248) — SUCCESS |
| Native audit ZIP | Artifact 12010408386, downloaded and inspected |
| CAP-30 result | SUCCESS in status.json and batches/index.json |
| Viewport | 1440 × 900, DPR 1, zoom 1 |
| Execution | Actual Electron renderer, deterministic synthetic IPC and intercepted clipboard/navigation |

The full GitHub Actions Visual Preview workflow passed. All standalone modules CAP-18 through CAP-27 also had successful status entries. The screenshots, measurements.json, status.json and batches/index.json agree on the full generating sourceHead e9c893853586a3218d4b0c3ed3e103c82d04d9b3, rather than the temporary GitHub Actions merge checkout.

Only this report and the CAP-30 module were modified on the isolated PR. No production code, clipboard helper, shared Electron runner, canonical fixture, GitHub Actions workflow, central coverage register, datasource inventory, another batch or the integration branch was changed. No local linting or formatting was performed.

## B. Authoritative inventory coverage

The original brief mismatched several IDs. Correct coverage based on the source inventory is:

| ID | Actual feature | Visual | Behavioral |
| --- | --- | --- | --- |
| P17 | Prometheus Grafana handoff | UV: no menu-specific capture | BV: actual Open and Copy actions, parsed URL |
| X06 | Copy current query | VV: query success/error | BV: SQL, PromQL, LogQL, TraceQL exact writes; SQL rejection/retry |
| X09 | Open/copy Grafana link | UV: no standalone menu capture | BV: Prometheus, Loki, Tempo URL open and exact copy |
| X10 | Loki log payload and IDs | VV: selected inspector | BV: message, raw line, trace/span IDs and fields; known failed-rejection behavior |
| X11 | Tempo trace details and identifiers | UV: dedicated identifier-copy controls not verified | BV only for TraceQL query copy; identifier-copy capability UV |
| X12 | Diagram clipboard / Excalidraw | VV: Tempo and PostgreSQL diagrams | BV: PNG bytes, Excalidraw structure, SVG; PostgreSQL JSON/text |
| C06 (related) | PostgreSQL EXPLAIN plan diagram | VV: three-node plan | BV: exact JSON tree/text clipboard without SQL rerun |

VV means independently inspected original screenshot, BV means an executed real renderer interaction with deterministic assertions, SO means source only, and UV means not verified. A click or success toast alone does not count as valid clipboard content.

## C. Clipboard payload, failure and recovery matrix

The synthetic clipboard boundary recorded 14 rows. Every recorded actual text payload matched its full expected value, with zero provider-request delta for each Copy action. This verifies intercepted payload semantics, not acceptance by an actual OS clipboard.

| Surface and actual action | Exact assertion | Execution |
| --- | --- | --- |
| PostgreSQL Copy query | Two-line SELECT with nested single/double quotes and preserved newline, same displayed editor draft | BV success |
| PostgreSQL rejected Copy | Same SQL; intercepted rejection; red error alert; no unhandled rejection | BV product success |
| PostgreSQL retry | Same SQL; intercepted success; error replaced by success status | BV product success |
| PromQL query Copy | sum(rate(http_requests_total{service="checkout"}[5m])) | BV exact, but incorrectly labeled Copy SQL (product FAIL) |
| LogQL query Copy | {service_name="checkout"} with exact CAP30 literal line filter | BV success, correct LogQL label |
| TraceQL query Copy | { resource.service.name = "checkout" } | BV success, correct TraceQL label |
| Loki Copy message | Exact multiline parsed message with quote and backslash | BV payload, direct action gives no attributable new success toast |
| Loki Copy raw log | Exact JSON line, different from parsed message | BV payload |
| Loki Copy Trace ID | 00000000000000000000000000000301 | BV complete 32-character ID |
| Loki Copy Span ID | 0000000000000303 | BV complete 16-character ID |
| Loki Copy region/retry | eu-west-1 and 2 respectively | BV each scalar |
| Loki rejected raw Copy | Exact attempted raw JSON, one unhandled rejection and no new failure notification | BV known-defect characterization; product FAIL |
| Loki recovery | Subsequent raw write completes with exact payload, no refetch | BV transport recovery |
| PostgreSQL Copy plan JSON/text | JSON deeply equal to current plan; text equals synthetic plan exactly | BV both; no rerun |

The ledger distinguishes click, API invocation, rejection/resolution, exact text and observed notification snapshot. The successful Loki log-copy feedback snapshots still include the previous query-copy toast: **that does not prove a new log-copy notification**. The collected unhandled-rejection array is cumulative after the Loki rejection and should not be misattributed to a later TraceQL Copy.

## D. Grafana URL handoff matrix

All three actual UI Open in Grafana actions were intercepted before launching a browser, and all three Copy Grafana link actions wrote the exact constructed URL. Parsing rather than substring comparisons verified each field.

| Provider | Datasource UID / type | Exact query key/type | Result |
| --- | --- | --- | --- |
| Prometheus | cap30-prometheus / prometheus | expr containing exact PromQL | BV |
| Loki | cap30-loki / loki | expr containing exact LogQL, queryType=range | BV |
| Tempo | cap30-tempo / tempo | query containing exact TraceQL, queryType=traceql | BV |

Each URL has origin https://grafana.example.invalid, path /explore, schemaVersion 1, orgId 17 and matching datasource UID in both pane and query. Custom UTC range 2026-08-19 16:00–17:00 was serialized exactly to 1787155200000–1787158800000 in epoch milliseconds. No Grafana action triggered a new provider request. These are **query-level** Explore handoffs; deep linking to individual trace/span IDs, relative time-range behavior and acceptance by an authenticated Grafana server remain UV.

## E. Diagram export and identity matrix

| Feature | Export | Native validation |
| --- | --- | --- |
| Tempo service map | Copy image / PNG | Electron decoded the intercepted PNG bytes; valid signature, 1208 × 228 pixels, 19,398 bytes, 154 sampled colors, nonblank graph |
| Tempo service map | Copy for Excalidraw | Parsed excalidraw/clipboard envelope with 8 elements; graph retained gateway, checkout, database and connected relationships |
| Tempo service map | Export SVG | Intercepted SVG save payload contained all three service labels |
| PostgreSQL EXPLAIN | Copy plan JSON | Parsed JSON exactly equals the current Hash Join root (0), Seq Scan child (0.0) and Index Scan child (0.1) |
| PostgreSQL EXPLAIN | Copy text plan | Exact text payload, independent of the JSON |

The Tempo PNG SHA-256 is 615a8b5324d241ff15a1b84cc97f9f07ffa2787f0f0c2e61a13910fd1187d0f0. Provider ledger contains two Tempo requests for initial deterministic data preparation, but **zero additional requests for Copy, Share, Export or Grafana handoff**.

The **Tempo PNG/SVG/Excalidraw versus PostgreSQL JSON/text** distinction is intentional. There is no supported equivalent Copy graph image control on the PG plan. This does not validate a real Excalidraw paste, filesystem save or OS clipboard image write; those remain UV.

## F. Notifications, rejected operations and recovery

PostgreSQL success screenshot shows a clear Copied to clipboard status. The rejected-write screenshot shows a red Could not copy: CAP30 clipboard denied alert, with the SQL draft preserved. Native assertions confirmed subsequent successful retry cleared the error. No uncontrolled SQL query or unhandled rejection occurred.

In contrast, Loki LogResultExplorer directly calls navigator.clipboard.writeText without failure feedback. Its rejection caused **one unhandled rejection and no new alert**, matching CAP-19/V-07. The characterization asserts that precise present behavior, so a future production fix changes the assertion and requires explicit audit expectation updates. Product acceptance remains failed.

A separate cross-surface visual observation: the PostgreSQL plan screenshot displays Text plan copied locally while the earlier Tempo Diagram copied to clipboard for Excalidraw toast is still visible. This might reflect a normal short-lived global toast during a rapid synthetic switch; it is documented as an **unverified UX candidate**, not a confirmed production defect.

## G. Screenshot manifest and original full-resolution review

Exactly five original 1440 × 900 PNGs were individually opened, not merely checked for existence or dimensions.

| Screenshot | Inspected evidence |
| --- | --- |
| cap30-clipboard-query-success-desktop.png | SQL query, Copy control and clear bottom success notification; no clipping |
| cap30-clipboard-query-error-desktop.png | Same intact draft and clearly differentiated red failure alert; no clipping |
| cap30-clipboard-log-success-desktop.png | One selected Loki entry, multiline message, full trace/span IDs, accessible log inspector; preceding query toast is not per-log feedback |
| cap30-tempo-diagram-export-desktop.png | Three labeled service nodes, two edges, PNG/SVG/Excalidraw affordances and Excalidraw success toast, all readable |
| cap30-postgres-plan-share-desktop.png | Three plan nodes, Copy text plan and Copy plan JSON controls, readable inspector; residual unrelated Excalidraw toast is visible |

All observations have positive semantic target geometry, DPR=1 and zoom=1. Native PNG headers establish 1440 × 900, and the manifest contains exactly these images. No primary control clipping or overlapping content was seen. The Tempo graph uses only the top portion of its canvas but service labels and links remain clear.

## H. Visual Convergence Atlas candidates

| ID | Classification | Owner and inventory | Evidence, UX impact and direction |
| --- | --- | --- | --- |
| VC30-01 | ALREADY_CONVERGED | CopySqlButton / clipboardText, X06 | High confidence BV and VV: query rejection/retry preserves payload and accessible feedback; retain shared behavior |
| VC30-02 | CONFIRMED_DEFECT | Prometheus QueryEditor caller, X06/V-08 | High confidence BV: actual PromQL Copy exposes Copy SQL accessible label; pass correct language to existing control |
| VC30-03 | CONFIRMED_DEFECT | LogResultExplorer, X10/V-07 | High confidence BV, CAP-19 corroboration: rejected log copy has no failure notification and produces one unhandled rejection; adopt shared text-copy error policy later |
| VC30-04 | INTENTIONAL_DIFFERENCE | TraceServiceMap export helpers, X12/UX-20 | High confidence BV/VV: PNG, SVG and Excalidraw each serve a distinct destination; preserve formats |
| VC30-05 | INTENTIONAL_DIFFERENCE | ExplainPane, C06/X12/UX-20 | High confidence BV/VV: PG plan text/JSON differs semantically from Tempo graph-image and Excalidraw payloads; preserve formats |
| VC30-06 | UNVERIFIED | NotificationArea, X06/X12/UX-20 | Medium confidence visual observation: earlier Tempo Excalidraw success toast remains visible on the later PG plan screenshot; determine desired cross-workspace toast policy before calling it a defect |

Related comparison references: V-07, V-08, UX-20, CAP-19, CAP-21, CAP-23 and CAP-25. No Atlas implementation changes were made.

## I. Acceptance and stop

**CAP-30 scenario and screenshot-provenance audit: PASS.** Final sourceHead e9c893853586a3218d4b0c3ed3e103c82d04d9b3; Visual Preview [run #38815371248](https://github.com/cubitouch/DataKoala/actions/runs/38815371248) SUCCESS; artifact 12010408386 retrieved; five images personally inspected; 14 exact clipboard text rows, 3 parsed Grafana handoffs and 2 diagram export families verified.

**Product acceptance: PARTIAL.** PromQL's accessible Copy language label and Loki's rejected direct Copy remain confirmed defects. X11 dedicated Tempo identifier copying, selection/full-query differences, real OS clipboard/paste, Excalidraw import, authenticated Grafana and additional time-range variants are UV, not silently accepted.

**Other CI:** Docs, unit/UI tests, production build and macOS runtime succeeded on the generating head; the Quality formatting job failed (31 files including this report at its earlier draft), which is separate from the successful Electron Visual Preview. No local linting or formatting was performed.

**Stop after CAP-30:** do not merge PR #437 or #406, modify the integration branch or central coverage register, start AGG-01, begin Phase 2 or generate the final Atlas.
