# CAP-22 — Tempo Builder service and protocol controls

**Parent:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration:** [draft #406](https://github.com/cubitouch/DataKoala/pull/406) · **Temporary draft:** [#423](https://github.com/cubitouch/DataKoala/pull/423)
**Integration base:** `9836b7fb0f75c64cd024a36e446ec34cfbde78d1`
**CAP branch:** `audit/391-cap-22-tempo-builder`
**Scenario generating commit:** `52fd2e08e82446fa37be3930c497b540f5f50dc2` (after focused fixture/test corrections)
**Final report commit:** recorded in final handoff (self-reference cannot be committed into itself).
**Viewport:** Electron 1440×900, DPR/zoom 1; synthetic Tempo IPC, no authenticated service.

## Disposition

**PARTIAL — the standalone runtime and all five native-resolution screenshots are now verified against generating commit `52fd2e08e82446fa37be3930c497b540f5f50dc2` (Visual Preview run `38778100440`, artifact `11994213479`).** Strict `EVIDENCE_COMPLETE` is withheld because the source contract still has unverified cases: failed/delayed/stale service metadata and empty metadata, some invalid/boundary values, raw Format/Copy, and real provider acceptance. No production behavior, centralized audit registers, shared runner, fixtures or other CAP modules were modified.

## Ownership and coverage matrix

| ID | Feature | Visual | Behavior | Ownership and named evidence | Open gap |
|---|---|---|---|---|---|
| T02 | TraceQL editor/format/copy | SO | BV (mode handoff only) | `TraceExplorer`, shared `QueryCodeEditor`, `CopySqlButton`, `formatTraceql`, `ModeSwitch`; CAP-22 raw handoff/no-run/draft-preservation scenario; existing `TraceExplorer.editor.test.tsx` | Native raw editing, Format and Copy not independently exercised in this batch; live provider unverified |
| T03 | TraceQL Builder | VV | BV | `TraceBuilderPanel` + `TraceExplorer.updateBuilder`, shared BuilderForm/Row/Field/GeneratedQueryPanel; CAP-22 generated-query and raw-mode transitions | Pending Electron result and full-resolution capture |
| T05 | Span kind/status/min duration | VV | BV | `TraceBuilderPanel` controls, `traceBuilder.buildTraceql`; CAP-22 span/status/duration/advanced predicate scenario; invalid negative-duration dispatch assertion | Runtime confirmation pending, lower/upper duration and provider acceptance unverified |
| T06 | Protocol/subsystem | VV | BV | `TraceBuilderPanel` conditional rows, `traceBuilder.buildTraceql`; CAP-22 HTTP↔RPC transition and no-auto-run scenario | Messaging/DB deliberately out of CAP-22 (CAP-23); runtime pending |
| T07 | HTTP method/route | VV | BV | HTTP detail row and `either` alias generation; CAP-22 GET/POST method, route with quotes, Run request identity/range | Runtime, metadata contract/provider acceptance pending |
| T08 | RPC system/service/method | VV | BV | RPC detail row and dedicated span RPC keys; CAP-22 RPC transition, quoted service/method, query dispatch/clearing | Runtime and live Tempo parsing unverified |

`VV`/`BV` mean the named subbehaviors passed real Electron checks at the generating SHA. T02 remains `SO` visually because raw TraceQL editor itself, Format and Copy were not independently captured/tested. T04 (namespace/service inventory owner) is exercised as **supporting evidence** for the six assigned IDs but remains independently owned by the integration register; do not rewrite it here.

## Fixture and protocol visibility

Four synthetic service records in two namespaces: payments / checkout-api, invoice-api; platform / gateway, worker. Three synthetic attributes cover `span.http.status_code`, `resource.cloud.region`, and `span.rpc.method`. IPC attribute/attribute-values are recorded; no live Tempo network.

| Mode | Always-present controls | Conditional controls | Inactive |
|---|---|---|---|
| Default / any | Namespace, Service, Span kind, Protocol or subsystem, Status, Min duration, Advanced filters | None | HTTP, RPC, messaging and database detail rows |
| HTTP | All core controls | HTTP method, Route / endpoint | RPC, messaging, DB detail rows |
| RPC | All core controls | RPC system, RPC service, RPC method | HTTP, messaging, DB detail rows |

The underlying Builder **retains** inactive HTTP values on protocol change; `buildTraceql` only emits predicates for the active protocol. Generic advanced attribute predicates are independent of the protocol selector; treating them as automatically discarded would change current semantics.

## Generated TraceQL and dispatch expectations

The module independently constructs and compares expected conditions (normalizing only whitespace introduced by the formatting view), then requires dispatched TraceQL to equal the **visible generated query byte-for-byte**.

| Scenario | Inputs and representative expected generated expression | Dispatch contract |
|---|---|---|
| Empty/default | `{ span:duration > 300ms }` | None |
| Namespace and service | `{ resource.service.namespace = "payments" && resource.service.name = "checkout-api" && span:duration > 300ms }` | Selection/search/keyboard Enter must not dispatch |
| Span/status/duration | Above, plus `span:kind = server`, quoted `span:name`, `span.http.status_code > 499`, `span:status = error`, `span:duration > 450ms` | None until explicit Run |
| HTTP | HTTP method POST generates an OR over `span.http.request.method` and `span.http.method`; a quoted route generates an OR over `span.http.route`, `span.url.template`, `span.url.path`, `span.http.target` | One explicit Run; request scoped to audit-tempo, custom UTC range 16:00–17:00, sample size 100 |
| RPC | `span.rpc.system = "grpc"`, quoted `span.rpc.service`, `span.rpc.method`; no inactive HTTP method/route predicate | One explicit Run; exact dispatched query matches generated view |
| Invalid negative duration | `-1` results in **no duration predicate** in `buildTraceql` by source inspection | CAP-22 requests a real Run, records whether the omitted constraint is nevertheless dispatched |

All valid matrix expressions passed their exact runtime assertion; two explicit Run operations dispatched the exact visible formatted TraceQL to `audit-tempo` with UTC range 2026-08-19 16:00–17:00 and sample size 100. Native `min=0` validation blocked the attempted `-1` duration query (`nativeInputValid=false`, `dispatched=false`). No provider acceptance claim is made.

## Interaction matrix

| Interaction | What CAP-22 asserts | Boundaries |
|---|---|---|
| Service discovery/selection | Namespace filters service options; search matches checkout only; native keyboard Enter selects it; service change has zero query requests | No authenticated discovery |
| Filter edits | Visible span kind, status, duration and advanced filter controls update the generated expression; no auto-Run | Advanced comparison and attribute values use synthetic IPC |
| HTTP/RPC switch | Correct conditional fields appear; previous protocol's dedicated predicates disappear from generated query | Inactive fields remain in saved Builder state |
| Explicit Run | Captures profile, full TraceQL, parameters, UTC range, sample size | Synthetic response, not Tempo acceptance |
| Builder → raw → Builder | Generated handoff is explicit and non-executing; arbitrary raw draft is not implicitly imported | Raw invalid text is injected into store, not typed through CodeMirror |
| Metadata refresh/state replacement | Injected pending/loaded metadata revision preserves selected Builder service | **Not** provider refresh, stale-response race, loading/failure UI or real failure-retry acceptance |
| Negative duration | Entering `-1` makes the number input invalid; native form validation suppresses Run | Verified `dispatched=false`; source generator omits the invalid predicate if invoked directly |

Unknown service/custom values, empty metadata, failed IPC and delayed responses require additional execution evidence. Do not infer them from fixture definitions alone.

## Screenshot manifest — individually inspected at original resolution

| Filename | Intended target | Dimensions / DPR / zoom | Generating SHA / inspection |
|---|---|---|---|
| `cap22-tempo-builder-default-desktop.png` | Populated metadata, default Builder | 1440×900 / 1 / 1 | `52fd2e0` / **inspected** |
| `cap22-tempo-selector-options-desktop.png` | Namespace-filtered, searched service listbox | 1440×900 / 1 / 1 | `52fd2e0` / **inspected** |
| `cap22-tempo-builder-filters-desktop.png` | Span kind/status/duration/advanced filters | 1440×900 / 1 / 1 | `52fd2e0` / **inspected** |
| `cap22-tempo-builder-http-desktop.png` | HTTP-only detail controls and query | 1440×900 / 1 / 1 | `52fd2e0` / **inspected** |
| `cap22-tempo-builder-rpc-desktop.png` | RPC-only detail controls and query | 1440×900 / 1 / 1 | `52fd2e0` / **inspected** |

All five PNGs were downloaded, extracted and opened individually at their original 1440×900 resolution. Image dimensions and `devicePixelRatio=1` / zoom=1 were independently confirmed. Each has `documentOverflow=false`, `builderOverflow=false` and a nonzero visible target. All expected controls are legible; the generated-query body is below the viewport fold in dense HTTP/RPC frames, but is internally scrollable and has no horizontal clipping. This is genuine visual inspection, not green-CI inference.

### Observed runtime and protocol caveats

The service selector displayed `Any service`, `checkout-api`, and `invoice-api` under `payments`; filtering to `checkout` displayed exactly `checkout-api`. Because custom values are supported, native Enter was tested on the exact discovered value `checkout-api` rather than treating the partial custom-value text as an option selection. Two dispatched queries had the correct profile, range and escaped POST/HTTP or RPC predicates. Neither Builder edits nor the raw-mode handoff dispatched any request. Advanced `span.http.status_code > 499` persists when switching to RPC as a protocol-agnostic manual filter; its expected product policy is not established, so this is an `UNVERIFIED` convergence candidate rather than an automatically confirmed defect. The synthetic result rows need not match the selected services and do not prove Tempo backend behavior.

## Visual Convergence Atlas candidates

| Candidate | Inventory | Classification pending runtime | Current evidence and owner | Impact / confidence / future direction |
|---|---|---|---|---|
| VC22-01 | T03/T05/T06 | `ALREADY_CONVERGED` (source + inspected Electron) | Shared FieldChrome/Combobox, BuilderForm/Row/Field, GeneratedQueryPanel; UX V-10 and `TraceBuilderPanel` | Shared fields are legible and conform to V-10 in all five frames; high confidence |
| VC22-02 | T05/T03 | `ALREADY_CONVERGED` (native form validation) | `traceBuilder.buildTraceql` omits invalid duration, `TraceExplorer.submitSearch` checks metadata refresh but not minDuration validity | Although the generator omits negative duration, HTML native `min=0` validation blocks Run: zero query requests. Other invalid state entry paths remain untested; do not call this confirmed defect |
| VC22-03 | T06/T07/T08 | `INTENTIONAL_DIFFERENCE` (inspected Electron) | Protocol-specific controls/query generation in `TraceBuilderPanel` / `traceBuilder`; V-10 shared controls | Keep Tempo-specific semantics for HTTP/RPC while reusing shared field chrome; high confidence based on screenshots and query assertions |
| VC22-04 | T03/T06 | `UNVERIFIED` | `TraceExplorer` metadata effects and revision; deterministic store injection only | Real slow/failed refresh and stale response arbitration requires separate provider-controlled interaction; medium priority, low runtime confidence |
| VC22-05 | T06/T07/T08 | `UNVERIFIED` (product policy) | Switching HTTP → RPC retains a manually chosen generic `span.http.status_code > 499` filter and HTTP-looking span name; `TraceBuilderPanel.advancedFilters` / `traceBuilder.buildTraceql` | Visible in RPC screenshot and dispatched RPC TraceQL. Could be surprising/conflicting, but advanced filters are deliberately independent of protocol; do not auto-clear without a product contract. Medium impact, high confidence in observation |

The classifications above use inspected screenshots and generated/dispatched TraceQL. Unverified metadata/provider or cross-protocol policy remains explicitly unresolved. Nothing is implemented in this batch.

## CI and provenance ledger

**Verified generating run:** [Visual Preview 38778100440](https://github.com/cubitouch/DataKoala/actions/runs/38778100440) **SUCCESS**; artifact **11994213479** (`datakoala-ux-audit-pr-423`, 38,206,136 bytes). `batches/CAP-22/measurements.json`, `status.json`, and `batches/index.json` all report `sourceHead = 52fd2e08e82446fa37be3930c497b540f5f50dc2`; the status and batch-index entries for CAP-18, CAP-20 and CAP-22 all say `success`. The file contains exactly five CAP-22 screenshots at 1440×900, individually opened and checked, plus five semantic observations and two explicit query dispatch records.

**CI:** [38778100101](https://github.com/cubitouch/DataKoala/actions/runs/38778100101): Unit tests, UI tests, Production build, DuckDB macOS runtime/package **SUCCESS**. Quality **FAILURE** on `Check formatting` only: 23 flagged files, mainly inherited convergence/CAP/NON work, **including this CAP-22 report**. This file's format warning is not inherited. [Documentation 38778100446](https://github.com/cubitouch/DataKoala/actions/runs/38778100446): **SUCCESS**. No local lint/format commands run.

**Previous attempt:** [Visual 38777205376](https://github.com/cubitouch/DataKoala/actions/runs/38777205376), artifact **11994277306**; CAP-18/CAP-20 passed, but CAP-22 stopped after the two initial images because the test incorrectly expected a partial custom service value to commit an existing discovered service. Fixed within CAP-22 via exact-match native Enter testing; the successful generating run supersedes it.

**Remaining gaps:** independently exercised Format/Copy, real delayed/failed/stale metadata requests and empty/missing service cases, additional duration boundaries, and provider acceptance.



## Completion gate / integration handoff

Remain **PARTIAL**: all six scoped IDs now have independent tested subbehavior dispositions, provenance and full-resolution visuals are verified, exact TraceQL dispatches and CAP-18/CAP-20 regressions pass. The strict acceptance requires more edge/provider evidence than this bounded runtime scenario supplies: empty/unknown/missing services, delayed/failed/stale metadata, broader invalid duration/conflicting filter cases, and raw Format/Copy. Do not mark `EVIDENCE_COMPLETE` or integrate the batch as final coverage yet. No merge, release, Phase 2, CAP-23, central-register edits or production code changes. The integration owner reconciles reviewed CAP-22 evidence into #406.
