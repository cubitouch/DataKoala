# CAP-23 — Tempo advanced subsystem fields (recovery of #424)

**Final disposition: PARTIAL — evidence recovered, native images individually inspected, scoped behavior verified; missing branches and provider acceptance are explicitly unresolved.**

## 1. Metadata, provenance, and isolation

- Date: 2026-10-15. Parent issue: [#391](https://github.com/cubitouch/DataKoala/issues/391). Original draft PR: [#424](https://github.com/cubitouch/DataKoala/pull/424). Integration draft PR: [#406](https://github.com/cubitouch/DataKoala/pull/406).
- Original PR branch: `audit/391-cap-23-tempo-advanced`; frozen live HEAD checked before recovery: `8306fb19cd476d2125153fa297bd00a86f5e63f0`. The supplied checkpoint matches the live HEAD.
- Dedicated recovery branch: `audit/391-cap-23-recovery`, created **from exactly that commit**. Recovery PR targets `audit/391-ux-convergence`. PR #424, its branch, the integration branch, and their CI jobs were not modified.
- Scope: **T09** messaging, **T10** database, **T11** advanced comparator/value behavior, **T12** exact span/time ownership, **T13** sample and request range. Five new screenshot files only; existing standalone module `scripts/visual-preview/audit-batches/cap-23.mjs` reused without changes.
- Runtime source of truth: [Visual preview run 38779965647](https://github.com/cubitouch/DataKoala/actions/runs/38779965647), completed **success**, generated at `8306fb19cd476d2125153fa297bd00a86f5e63f0`; original unmodified ZIP artifact **11994998803**, `datakoala-ux-audit-pr-424`, 38,212,826 bytes. Its five source PNGs were downloaded and individually opened at **1440×900**.
- Associated [CI run 38779965587](https://github.com/cubitouch/DataKoala/actions/runs/38779965587) and [Documentation run 38779965575](https://github.com/cubitouch/DataKoala/actions/runs/38779965575) were generated at the same SHA. A report-only recovery commit is **not** the screenshot-generating commit.
- Reviewed guidance: root `AGENTS.md`; `docs/engineering/visual-documentation.md`; `docs/datasource-feature-inventory.md`; `docs/architecture/ux-implementation-convergence-audit.md`; `docs/architecture/ux-convergence-coverage-register.md`; the separate CAP-22 report on the integration branch; CAP-23 module and relevant source/tests. The register still labels CAP-23 `NOT_STARTED` at the frozen baseline: **this recovery deliberately does not edit that central register**.

**Evidence vocabulary:** **VV** = original screenshot viewed independently at full resolution; **BV** = an asserted interaction actually executed in the Electron audit process (deterministic IPC); **SO** = deterministic source or existing test without a newly executed CAP-23 Electron scenario for that branch; **UV** = not verified. Captured-but-unreviewed and authenticated Tempo results must not be relabeled VV or BV.

## 2. Independent coverage dispositions

| ID | Visual and execution | Verified acceptance subset | Remaining scope and disposition |
| --- | --- | --- | --- |
| **T09** messaging system/topic/operation | **VV + BV**: messaging image; real combobox/text-entry transitions; exact generated query; synthetic discovery record | Kafka system selection, typed destination with quotation/backslash characters, Publish operation; switching away and returning restores inactive draft without leaking it to other protocols; no automatic dispatch | No actual Tempo parser acceptance, metadata failure/retry visual state, delayed stale response or arbitrary custom provider metadata. **PARTIAL** |
| **T10** DB system/operation | **VV + BV**: database image and exact generator assertion | Database row shown exclusively in Database mode; PostgreSQL, quoted DB operation; aliases for old/new DB semantic keys; no messaging predicate leakage | No DB metadata provider IPC exercised (systems are predefined UI options), empty/unknown system and backend acceptance not tested. **PARTIAL** |
| **T11** advanced attributes/modes | **VV + BV**: comparator image plus all six comparator mutations and clears | Select discovered `span.http.status_code`; `>`, `>=`, `<`, `<=` with numeric `500`; `=~` and `!~` with quoted regex `v2-.*`; clearing scalar removes predicate while retaining filter draft; unselecting facet removes it | Include/exclude/multi-value, resource-scope comparison, mixed types, malformed/unsupported combinations, invalid facet identities and provider parsing remain **SO/UV**, not newly BV. **PARTIAL** |
| **T12** exact span/time ownership | **VV + BV**: exact-span image, generated TraceQL, one actual Run and recorded request | `span:name` exact string with quotes/backslash; `span:duration > 125ms`; UTC custom bounds appear in dispatch `options.start/end`, **not** as TraceQL predicates; changing protocol does not manufacture a time predicate | Temporal window picker was opened then cancelled, not changed/committed; alternative/time invalid states and live Tempo semantics unverified. **PARTIAL** |
| **T13** sample size/request boundaries | **VV + BV** for one path: exact-span and no-options images; one captured synthetic dispatch | Select `100 traces` before first query, explicitly Run, assert `sampleSize: 100` and range bound to active session/profile, no extra request on builder changes or picker open/cancel | `250`/`500`/`all` requests, post-result sample-change auto-run, custom range editing, invalid/recurring ranges and provider cap enforcement are **source/test only or UV** in this run. **PARTIAL** |

Five IDs have real Electron evidence, but **none is fully accepted across all required states**. Report-level disposition remains **PARTIAL**, not `EVIDENCE_COMPLETE`.

## 3. Messaging/database controls and state matrix

| Selected protocol | Visible conditional controls | Observed state / generated ownership | Runtime status |
| --- | --- | --- | --- |
| Any | No messaging/DB detail row | Default `{ span:duration > 300ms }`; no auto-dispatch | **BV** |
| Messaging | Messaging system searchable/custom Combobox, Destination/topic text, Messaging operation searchable/custom Combobox | Kafka, `orders."vip"\main`, Publish; emits `span.messaging.system`; destination.name OR legacy destination; operation.type OR legacy operation | **BV/VV** |
| Database | Database system searchable/custom Combobox; DB operation text | PostgreSQL, `SELECT "audit"`; emits `span.db.system.name` OR `span.db.system`, and `span.db.operation.name` OR `span.db.operation` | **BV/VV** |
| Messaging → Database | Messaging controls hidden; DB controls visible | Previous Kafka draft remains in stored `tempoBuilder`, but its messaging clauses are absent from active DB query; protocol switch does not Run | **BV** |
| Database → Messaging → Any | Only active protocol-specific controls shown | Messaging query restored; Any removes both subsystem-specific predicates without losing inactive drafts | **BV** |
| Messaging with optional discovery returning empty | Messaging system defaults to Any; no attributes selected; Advanced selector explicitly says no attributes discovered | `span.messaging.system != nil` is **expected protocol-presence fallback**, not a stale Kafka equality | **BV/VV** |
| Messaging metadata rejects, loads slowly or returns stale after reconnection | Loading/error/retry UI is implemented in source, not exercised by CAP-23; `failAttributes` defined in fixture but never enabled | **No error or race acceptance claim** | **SO/UV** |

The fixture intercepts `connections:tempo:attributes` and `connections:tempo:attribute-values` with deterministic lists and later empty arrays. Recorded discoveries comprise two attribute-list calls and three value calls: messaging system normal + empty, HTTP status code values normal. The source stores synthetic requests only; this is not an authenticated provider or real network test.

## 4. Advanced comparator/value matrix

Every BV row below is an actual selection/edit followed by an **exact assertion against the rendered Generated TraceQL** in the Electron process, normalizing whitespace only. Baseline also appends the default duration condition `span:duration > 300ms`.

| Attribute / action | Resulting expected predicate | Evidence |
| --- | --- | --- |
| Select `span.http.status_code`, value `500`, Greater than | `span.http.status_code > 500` | **BV** |
| Greater than or equal | `span.http.status_code >= 500` | **BV + VV** |
| Less than | `span.http.status_code < 500` | **BV** |
| Less than or equal | `span.http.status_code <= 500` | **BV** |
| Matches regex, `v2-.*` | `span.http.status_code =~ "v2-.*"` | **BV** |
| Does not match regex | `span.http.status_code !~ "v2-.*"` | **BV** |
| Change to `>=` and `500` | `span.http.status_code >= 500` | **BV** |
| Clear comparison scalar | No advanced predicate; draft filter array still length one | **BV** |
| Unselect attribute | Advanced filter array length zero | **BV** |
| Include (=), Exclude (!=), multi-value, resource attribute, numeric-looking strings/durations, illegal combinations | Implemented/tested to varying degrees by `TraceBuilderPanel` and `traceBuilder.buildTraceql`; **not driven by this CAP-23 Electron scenario** | **SO / UV** |

The numeric `500` is serialized without quotes by `scalarLiteral`, while regex values are quoted. The source supports numeric/duration literal classification and otherwise quotes strings. That alone does **not** establish that every selected operator is valid for every backend attribute type. The visible comparator menu is not type-specific; any unsupported provider combinations need explicit product/parser validation.

## 5. TraceQL and API request parameter matrix

| User state/action | Generated TraceQL or request data | Dispatch observed? |
| --- | --- | --- |
| Empty Builder | `{ span:duration > 300ms }` | No |
| Messaging | Kafka, quoted destination on both alias keys, Publish on both alias keys, default duration | No; exact generated query asserted |
| Database | PostgreSQL on both DB-system keys, `SELECT "audit"` on both DB-operation keys, default duration | No; exact generated query asserted |
| Advanced comparator | Six exact operator-specific expressions, one active facet | No |
| Exact name + duration | `{ span:name = "POST /\"checkout\"\\audit" && span:duration > 125ms }` | **Yes**, after explicit Run |
| Dispatch identity | `profileId = "audit-tempo"`; `parameters = []`; query string equals exact-span expression | **Yes**, one request |
| Dispatch bounds | `options.start = "2026-08-19T16:00:00.000Z"`, `options.end = "2026-08-19T17:00:00.000Z"`; `options.sampleSize = 100` | **Yes**, one request |
| Picker opened then Cancel | Same persisted range, no new request | **BV** no dispatch |
| Empty optional discovery | `{ span.messaging.system != nil && span:duration > 300ms }` | No new dispatch |
| Sample size changes **after** a result exists | `TraceExplorer.changeSampleSize` may automatically call `runSearch` if search rows/notice exist and a nonempty query is active | **SO**; CAP-23 only chose 100 *before* results existed |
| Sample `all`, invalid/recurring range | `useTempoTraceSearchController` omits `sampleSize` for `all`; rejects recurring windows and invalid ranges before calling `api.query.run` | **SO** from source and existing hook tests; no CAP-23 Electron scenario |

Exact **TraceQL is the predicate language; start/end/sample are API-level search options**. No syntax for a time-bound predicate was generated. The source also has distinct span-duration filtering and search-window semantics. The synthetic `auditTraceResult` only verifies renderer completion and does not show that Tempo accepted, interpreted or constrained the query.

## 6. Missing, empty, stale and invalid metadata assessment

- **Executed:** on connection-generation increment, synthetic optional attribute and messaging-value lookups return empty arrays. Actual UI renders `Any messaging system`, `Select attributes` and the expanded dropdown text **“No attributes discovered.”** The previously selected messaging system was explicitly reset before the refresh. The synthetic discovery log proves the new response path ran; the absence of a stale equality predicate is asserted.
- **Not executed:** CAP-23 never flips `failAttributes` to true; no synthetic attribute error or retry UI assertion; no artificial slow-response interleaving; no stale-selected-value-with-empty-options assertion. The empty state is **not** evidence of correct cancellation of a pending old-generation response.
- **Existing neighboring tests:** `TraceExplorer.messagingMetadata.test.tsx` exercises delayed old-generation messaging values and custom choices under jsdom; `TraceExplorer.attributeMetadata.test.tsx` tests narrowed advanced-value discovery, loading empty values and old-generation discard. These are **deterministic test assertions**, not newly inspected CAP-23 Electron screenshots nor authenticated Tempo races.
- **Other invalid states:** native form range validity, negative duration and blank custom-range error appear in CAP-22/source/controller tests; CAP-23 itself did **not** drive them. No claim about escaping safety for arbitrary Unicode/control characters, real injection or provider round trips follows from the single quoted/backslash fixture.

## 7. Five-image screenshot manifest and native visual inspection

The original ZIP contains **exactly these five CAP-23 PNGs**, no extra/missing CAP-23 screenshots. Every original PNG was opened **individually** at source resolution **1440 × 900**, without scaling its UI before inspection. Checksum prefixes below are SHA-256 of downloaded **original PNG bytes**, not derived display copies. Every observation has `dpr=1`, `zoom=1`, `width=1440`, `height=900`, semantic target `(x=248,y=40,w=1192,h=860)` with positive area, and `overflow=false`.

| Original CAP-23 screenshot | SHA-256 prefix | What native inspection confirms |
| --- | --- | --- |
| `cap23-tempo-messaging-desktop.png` | `f91e2975985d7b83c265` | Kafka and Publish selected, destination visibly typed, active Messaging row, multi-line escaped TraceQL readable, no page overflow |
| `cap23-tempo-database-desktop.png` | `28567869651b460dc9c4` | Database-only controls, PostgreSQL and quoted operation, multi-line database aliases in generated query, no leaked messaging clause |
| `cap23-tempo-comparators-desktop.png` | `aa599a9c7d2becd99943` | Advanced section open, single selected status-code facet and `>=`/`500`; generated query visible; selected attribute chip visually abbreviated |
| `cap23-tempo-exact-span-desktop.png` | `f8c0cb0546724fc48017` | Exact span name, 125 ms minimum, selected sample 100, date-range toolbar and generated predicate shown; query results not yet fetched in this frame |
| `cap23-tempo-no-options-desktop.png` | `3ba9b0adff96802d420e` | Explicit empty attribute dropdown; no Kafka value; `!= nil` fallback; prior synthetic result list persists after metadata refresh, as distinct from a fresh query |

**Visual judgment:** All five are valid full-resolution observations with no horizontal document overflow or missing screenshot; the builder scroll area keeps dense advanced controls inside the workspace. The expanded attribute listbox overlays the Generated TraceQL section in the no-options frame, as a popover normally does, and the lower result pane is a separate scroll container. No image proves initial loading, error, retry, keyboard-option traversal or selected range *change*.

**Confirmed visible usability concern:** In these **1440px** screenshots, the small inline Sample size Combobox clips `250 traces` and `100 traces` to short `25…`/`10…`-style labels, even though the associated accessible state and measurements identify the complete values. The Time range button also ellipsizes its detailed summary. Record as a small but **actually inspected** toolbar-label readability defect/candidate, not as a broken request parameter. Separately, the selected advanced-attribute chip abbreviates its long name; the full field label below still identifies the attribute.

**Provenance validation:**

| Evidence | Recorded source | Status |
| --- | --- | --- |
| `batches/CAP-23/measurements.json` | `8306fb19cd476d2125153fa297bd00a86f5e63f0`; 5 observations, 13 interaction records, 5 synthetic discovery records, 1 search request | Correct |
| `batches/CAP-23/status.json` | Same sourceHead; `id=cap-23`, `status=success` | Correct |
| `batches/index.json` | Same sourceHead; `cap-18`, `cap-20`, `cap-23` all `success` | Correct |
| Visual preview workflow | `38779965647` checked out the identical SHA, complete/success | Correct |
| Original PR head observed for recovery | Identical `8306fb...`; original still draft/open when checked | Correct |
| CAP module screenshot array | Exact one-to-one match with five originals | Correct |

A green generated artifact is **not** itself an inspected UX verdict; the explicit individual inspections above provide VV.

## 8. Implementation ownership and shared-component comparison

- `TraceBuilderPanel.tsx` owns Tempo-specific messaging/DB conditional fields, advanced filters, names and matching-mode choices. It already composes shared `BuilderForm`, `BuilderRow`, `FormField`, `Combobox`/`MultiCombobox`, `TextInput`, `CollapsibleSection` and `GeneratedQueryPanel`. Similar field shells should remain shared; their TraceQL semantics should **not** be moved into SQL/PromQL/LogQL generators.
- `src/renderer/src/lib/traceBuilder.ts` owns `buildTraceql`, alias OR groups, protocol-specific predicate exclusion, quoted values, advanced comparison serialization, default duration and exact span name. Source and `traceBuilder.test.ts` provide broader deterministic edges; CAP-23 directly verifies the named runtime expressions.
- `TraceExplorer.tsx` owns the active Builder state, metadata requests, visible query, shared `QueryToolbar` / `TimeRangeField`, sampling selection and Run intent. `useTempoTraceSearchController.ts` owns range validation, query operation/generation lifecycle, provider-facing options, sampled versus complete progress and response/error handling.
- `src/shared/tempo.ts` owns Tempo request types. Shared `TimeRangeField` owns picker presentation and validation; Tempo owns how its selected range is passed to a search. Query editor/copy/Grafana handoff are neighboring shared shell behaviors, **not retested by this five-image batch**.
- CAP-22's separate report was consulted for HTTP/RPC/metadata and Builder/field comparisons. Its evidence remains a separate provenance set; its stated overall `PARTIAL` result is not silently promoted or inherited as new CAP-23 BV evidence. Source-specific protocol rows are an **intentional** difference from SQL/Loki/Prometheus Builders, not proof of unjustified duplication.

## 9. Stable Visual Convergence Atlas candidates

These are *audit observations and decisions for later synthesis*, not authorization to change production UX.

| ID | Scope / pattern / screenshot | Classification | Impact/confidence and proposed direction |
| --- | --- | --- | --- |
| **VC23-01** | T13, Tempo query toolbar sample/time presentation; all five original screenshots | **CONFIRMED_VISUAL_DEFECT** for truncated sample-size label at 1440px; range summary also truncated | Low–medium UX impact; high visual confidence. Compare responsive `QueryToolbar`/`TraceExplorer.module.css` sizing with other source toolbars. Preserve value semantics and per-profile persistence; possible bounded label-width/tooltip alignment later. |
| **VC23-02** | T09/T10/T11, Builder detail/advanced chrome; messaging/database/comparator images; comparison to CAP-22 and existing V-10 | **ALREADY_CONVERGED** shell, **INTENTIONAL_DIFFERENCE** in datasource predicates | High source/runtime confidence. Reuse shared form/combobox/GeneratedQueryPanel chrome; keep Tempo key aliases and protocol-specific values in `traceBuilder`. |
| **VC23-03** | T09/T10, saved inactive protocol drafts; messaging/database images and state observations | **INTENTIONAL_DIFFERENCE**, pending product confirmation about stale *generic* facets | High verified state confidence. Inactive messaging/DB fields persist but do not generate wrong-protocol predicates. Do not blanket-clear on switch or conflate protocol drafts with independent advanced attributes. |
| **VC23-04** | T11, advanced facet chip/collapsible density; comparator image | **NEEDS_VERIFICATION** for readability/long attribute labels, not a proven query defect | Medium visual confidence; inspect alongside CAP-22 and narrow windows, accessible full labels and keyboard focus before proposing a style change. |
| **VC23-05** | T09/T11/T13, empty metadata vs transient stale/loading/error and after-result sampling; no image for unexecuted branches | **NEEDS_VERIFICATION**; no false cross-datasource parity claim | Medium to high behavior impact, low new runtime confidence. Keep isolated Tempo async and sampling rules; add deterministic Electron edge coverage before reporting fully converged recovery policy. |

## 10. Findings, intentional behavior, and unresolved expectations

**Confirmed:** Native screenshot evidence shows truncated sample-size labels at 1440px (VC23-01). No newly proven TraceQL serialization or unexpected query dispatch defect in the executed subset. All six tested comparison operators serialized as expected; synthetic query identity/range/sample size matched the explicit Run assertion.

**Intentional:** The protocol system retains inactive messaging and DB draft values while serializing only the active protocol. Selecting Messaging with no specific fields creates a presence predicate. Generic advanced predicates are independent of protocol; whether to warn about cross-domain combinations is a **product decision not settled by this batch**. Search-window bounds are API options, not TraceQL syntax. Existing result cards can remain visible after a metadata-only refresh; do not misrepresent them as a newly executed query.

**Unresolved:** Live Tempo syntax/parser/backend result acceptance; unknown/custom/missing DB systems; optional discovery loading/error/retry; actual stale-response races; advanced include/exclude/multi-value, malformed and resource-scope comparisons; sample `250`/`500`/`all` transport behavior; sample change auto-Run after results; range changes, invalid ranges and recurring-window rejection in **native Electron CAP-23**; very long labels/focus/accessibility across widths; special-character security beyond tested quoting. Raw TraceQL mode, raw editing, Copy, Grafana external navigation and independent authenticated transport are **not CAP-23 acceptance**. No defects are inferred solely from absence of these tests.

## 11. Tests, CI and evidence gaps

**Actual audit execution:** Standalone `cap-23.mjs` ran in the real GitHub Actions Electron renderer with synthetic Tempo IPC. Its `exact()` assertions compare visible CodeMirror Generated TraceQL with independently constructed expected strings; `noDispatch()` compares actual recorded `query:run` request counts; explicit Run compares the **complete** captured request object. The harness validated exact screenshot set, dimensions, geometry and sourceHead. It did **not** exercise real provider authentication, semantic parsing, operational retries, local-formatting steps or a real remote Tempo service.

**Previous generating CI:** [Visual preview 38779965647](https://github.com/cubitouch/DataKoala/actions/runs/38779965647) **success** (capture/publish). [CI 38779965587](https://github.com/cubitouch/DataKoala/actions/runs/38779965587): **UI tests PASS, unit tests PASS, production build PASS, macOS DuckDB package/runtime PASS, Quality FAIL at Check formatting**; overall CI failure. [Documentation 38779965575](https://github.com/cubitouch/DataKoala/actions/runs/38779965575) **success**. Original visual artifact **11994998803**, correct SHA.

**Existing source tests reviewed** (do not count as new CAP-23 native assertion): `traceBuilder.test.ts`, `TraceBuilderPanel.test.tsx`, `TraceExplorer.messagingMetadata.test.tsx`, `TraceExplorer.attributeMetadata.test.tsx`, `useTempoTraceSearchController.test.tsx`; time-range and source ownership tests. Controller tests specifically check recurring-window suppression and invalid bound conversion without dispatch. They are prior deterministic test-suite evidence, with unit/UI CI green on the generating SHA.

**Recovery diff scope:** this report only; CAP-23 module untouched; zero new images committed; original and canonical CAP modules, shared harness, fixtures, workflows, other CAP documents, register and inventory untouched. No local lint or formatting performed by instruction. Newly triggered PR CI (if applicable) must be reported separately: its generating SHA is the report commit and **must not** be confused with the original screenshot sourceHead.

## 12. Final disposition and handoff

**PARTIAL**. Recovery successfully preserves original module and all five reviewed 1440×900 visual states, captures a grounded conditional-control and six-operator matrix, checks one real Electron query dispatch with exact API bounds and sample size, and verifies source/status/index provenance. **Evidence completeness is not behavioral acceptance completeness**: missing error/stale metadata, invalid/multi-value filters and alternate sample/range interactions block a truthful `EVIDENCE_COMPLETE` label.

The integration reviewer may incorporate the **named** VV/BV assertions into #406's coverage register and Atlas, but must keep untested branches `SO`/`UV`. No direct integration-branch changes, no production UX changes and no follow-on CAP-24/Phase 2 work. Leave #424 and the new recovery draft PR open for owner review; do not merge or close either.
