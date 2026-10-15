# CAP-22 — Tempo Builder service and protocol controls

**Parent:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration:** [draft #406](https://github.com/cubitouch/DataKoala/pull/406) · **Temporary draft:** [#423](https://github.com/cubitouch/DataKoala/pull/423)
**Integration base:** `9836b7fb0f75c64cd024a36e446ec34cfbde78d1`
**CAP branch:** `audit/391-cap-22-tempo-builder`
**Scenario commits:** `89edfed604376b958597bacd105feac3d05873b0` → `c7a3c254ac3f4fbd8d70878eb389dff993681cd4` → `e1949577ce736633c3b5b8018454076e39e3be61` (native form-validity distinction)
**Final report commit:** recorded in final handoff (self-reference cannot be committed into itself).
**Viewport:** Electron 1440×900, DPR/zoom 1; synthetic Tempo IPC, no authenticated service.

## Disposition

**PARTIAL — screenshot artifact and CI execution pending inspection.** Do not treat this report, a successful source parse or a green workflow as `EVIDENCE_COMPLETE`. The module has test assertions for the six inventory IDs but evidence statuses below can be promoted only after a successful generating run and full-resolution review of each screenshot and its `measurements.json`. No production behavior, centralized audit registers, shared runner, fixtures or other CAP modules were modified.

## Ownership and coverage matrix

| ID | Feature | Visual | Behavior | Ownership and named evidence | Open gap |
|---|---|---|---|---|---|
| T02 | TraceQL editor/format/copy | SO | SO | `TraceExplorer`, shared `QueryCodeEditor`, `CopySqlButton`, `formatTraceql`, `ModeSwitch`; CAP-22 raw handoff/no-run/draft-preservation scenario; existing `TraceExplorer.editor.test.tsx` | Native raw editing, Format and Copy not independently exercised in this batch; live provider unverified |
| T03 | TraceQL Builder | SO | SO | `TraceBuilderPanel` + `TraceExplorer.updateBuilder`, shared BuilderForm/Row/Field/GeneratedQueryPanel; CAP-22 generated-query and raw-mode transitions | Pending Electron result and full-resolution capture |
| T05 | Span kind/status/min duration | SO | SO | `TraceBuilderPanel` controls, `traceBuilder.buildTraceql`; CAP-22 span/status/duration/advanced predicate scenario; invalid negative-duration dispatch assertion | Runtime confirmation pending, lower/upper duration and provider acceptance unverified |
| T06 | Protocol/subsystem | SO | SO | `TraceBuilderPanel` conditional rows, `traceBuilder.buildTraceql`; CAP-22 HTTP↔RPC transition and no-auto-run scenario | Messaging/DB deliberately out of CAP-22 (CAP-23); runtime pending |
| T07 | HTTP method/route | SO | SO | HTTP detail row and `either` alias generation; CAP-22 GET/POST method, route with quotes, Run request identity/range | Runtime, metadata contract/provider acceptance pending |
| T08 | RPC system/service/method | SO | SO | RPC detail row and dedicated span RPC keys; CAP-22 RPC transition, quoted service/method, query dispatch/clearing | Runtime and live Tempo parsing unverified |

`SO` is deliberately conservative until Electron assertions run. T04 (namespace/service inventory owner) is exercised as **supporting evidence** for the six assigned IDs but remains independently owned by the integration register; do not rewrite it here.

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

These are **expected source-derived values**, not yet measured output of a successful Electron run. No provider acceptance claim is made.

## Interaction matrix

| Interaction | What CAP-22 asserts | Boundaries |
|---|---|---|
| Service discovery/selection | Namespace filters service options; search matches checkout only; native keyboard Enter selects it; service change has zero query requests | No authenticated discovery |
| Filter edits | Visible span kind, status, duration and advanced filter controls update the generated expression; no auto-Run | Advanced comparison and attribute values use synthetic IPC |
| HTTP/RPC switch | Correct conditional fields appear; previous protocol's dedicated predicates disappear from generated query | Inactive fields remain in saved Builder state |
| Explicit Run | Captures profile, full TraceQL, parameters, UTC range, sample size | Synthetic response, not Tempo acceptance |
| Builder → raw → Builder | Generated handoff is explicit and non-executing; arbitrary raw draft is not implicitly imported | Raw invalid text is injected into store, not typed through CodeMirror |
| Metadata refresh/state replacement | Injected pending/loaded metadata revision preserves selected Builder service | **Not** provider refresh, stale-response race, loading/failure UI or real failure-retry acceptance |
| Negative duration | Reproduces input `-1`, absent duration predicate and possible explicit Run | Potential defect: classify confirmed only if IPC record proves it |

Unknown service/custom values, empty metadata, failed IPC and delayed responses require additional execution evidence. Do not infer them from fixture definitions alone.

## Screenshot manifest (unverified until inspected)

| Filename | Intended target | Dimensions / DPR / zoom | Generating SHA / inspection |
|---|---|---|---|
| `cap22-tempo-builder-default-desktop.png` | Populated metadata, default Builder | 1440×900 / 1 / 1 | Pending / **not inspected** |
| `cap22-tempo-selector-options-desktop.png` | Namespace-filtered, searched service listbox | 1440×900 / 1 / 1 | Pending / **not inspected** |
| `cap22-tempo-builder-filters-desktop.png` | Span kind/status/duration/advanced filters | 1440×900 / 1 / 1 | Pending / **not inspected** |
| `cap22-tempo-builder-http-desktop.png` | HTTP-only detail controls and query | 1440×900 / 1 / 1 | Pending / **not inspected** |
| `cap22-tempo-builder-rpc-desktop.png` | RPC-only detail controls and query | 1440×900 / 1 / 1 | Pending / **not inspected** |

All five are required to be opened **individually at original resolution**. The loader verifies PNG dimensions and scale-1 semantic observation when run, but does not inspect pixels.

## Visual Convergence Atlas candidates

| Candidate | Inventory | Classification pending runtime | Current evidence and owner | Impact / confidence / future direction |
|---|---|---|---|---|
| VC22-01 | T03/T05/T06 | `ALREADY_CONVERGED` (source only) | Shared FieldChrome/Combobox, BuilderForm/Row/Field, GeneratedQueryPanel; UX V-10 and `TraceBuilderPanel` | Preserve shared presentation; source confidence high, visual CAP-22 pending |
| VC22-02 | T05/T03 | `UNVERIFIED` (source suggests defect) | `traceBuilder.buildTraceql` omits invalid duration, `TraceExplorer.submitSearch` checks metadata refresh but not minDuration validity | Risk: a Run with invalid user-entered duration silently widens search. Characterize before proposing validation; source confidence high, user-trigger confirmation pending |
| VC22-03 | T06/T07/T08 | `INTENTIONAL_DIFFERENCE` (source only) | Protocol-specific controls/query generation in `TraceBuilderPanel` / `traceBuilder`; V-10 shared controls | Keep provider semantics in Tempo rather than generalize across Loki/SQL; confidence high in ownership |
| VC22-04 | T03/T06 | `UNVERIFIED` | `TraceExplorer` metadata effects and revision; deterministic store injection only | Real slow/failed refresh and stale response arbitration requires separate provider-controlled interaction; medium priority, low runtime confidence |

Each candidate's classification must be revisited after the generated screenshots and request records have been inspected. Nothing is proposed for implementation in this batch.

## CI and provenance ledger

- Scenario commits: `89edfed604376b958597bacd105feac3d05873b0`, `c7a3c254ac3f4fbd8d70878eb389dff993681cd4` and `e1949577ce736633c3b5b8018454076e39e3be61`.
- Current scenario run: [CI 38776599117](https://github.com/cubitouch/DataKoala/actions/runs/38776599117), [Visual preview 38776599080](https://github.com/cubitouch/DataKoala/actions/runs/38776599080), [Documentation 38776599244](https://github.com/cubitouch/DataKoala/actions/runs/38776599244). CI Unit/UI/Build green; Quality failed trailing whitespace in this report (addressed in a subsequent commit). The workflow on this report correction must be checked afresh.
- Results: **pending**. Artifact name should be `datakoala-ux-audit-pr-423`; **artifact ID unverified**.
- Exact tests, passed/failed job steps, changes relative to inherited formatting/typecheck failures: pending job logs.
- `measurements.json`, `status.json`, aggregate `batches/index.json`, five original PNGs and canonical-regression preservation: **not yet inspected**.
- Provenance rule: only promote evidence if `sourceHead` equals the **specific commit actually generating the artifact**, even after report commits or CI reruns.

## Completion gate / integration handoff

Remain **PARTIAL** until all six rows have runtime dispositions, source provenance is verified, each of five actual screenshots is individually visually inspected, request assertions and relevant existing scenarios pass, and any detected defect is distinguished from source-only inference. No merge, release, Phase 2, CAP-23, central-register edits or production code changes. The integration owner reconciles reviewed CAP-22 evidence into #406.
