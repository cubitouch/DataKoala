# CAP-25 — Tempo service map, span hierarchy and inspector

**Parent:** [#391](https://github.com/cubitouch/DataKoala/issues/391) · **Integration:** [draft #406](https://github.com/cubitouch/DataKoala/pull/406) · **Isolated audit PR:** [draft #431](https://github.com/cubitouch/DataKoala/pull/431)

**Disposition: PARTIAL.** The standalone Electron batch succeeded and its five original-resolution screenshots were inspected, but several scoped edge cases and provider behavior remain unverified. No production changes, merges, shared harness edits or central-register updates were made.

## A. Execution metadata and provenance

| Field | Value |
| --- | --- |
| Integration branch / base | audit/391-ux-convergence / **7322aae7430638c298f240011608504ee0952870** |
| Isolated branch | audit/391-cap-25-tempo-map-inspector |
| Scenario commits | ae2c1ecaac13214d098668071cb21bf99b2ec587 (initial); c0969854579d7d88dc4a6feefef5c090f4b7a5b0 (predicate); af47ffe81741922912fdc6446040267125e986ce (duration label); **e0b3b8e547d711d9f27168ea35d9f285fd46abbb** (Grafana range and accepted generating source) |
| Separate report commit | The commit containing this report; a file cannot embed its own future SHA |
| Visual Preview | [run 38789455942](https://github.com/cubitouch/DataKoala/actions/runs/38789455942), **success**, both capture and publish |
| Original evidence artifact | [11998819921](https://github.com/cubitouch/DataKoala/actions/runs/38789455942/artifacts/11998819921), datakoala-ux-audit-pr-431 |
| GitHub Actions synthetic merge checkout | 2097cf12dd33c2ab7afa0d2ccbe419873200a29b, merging accepted source into base; **not** the generating sourceHead |
| Provenance | sourceHead **e0b3b8e547d711d9f27168ea35d9f285fd46abbb** in measurements.json, status.json and batches/index.json |
| Renderer / viewport | Real Electron renderer; isolated synthetic Tempo query IPC, intercepted synthetic Grafana URL; 1440 × 900, DPR 1, zoom 1 |
| Other workflows at accepted source SHA | Documentation run 38789455891 **success**; CI run 38789455875 **failure at Quality / Check formatting only**. UI tests, unit tests, production build and macOS DuckDB runtime/package jobs succeeded. |
| Local commands | No local linting or formatting |

The Quality job found formatting issues in 26 other integration reports, register entries and tests; the CAP-25 module was **not** among the reported formatting violations. Its failure is separate from successful Electron behavior and images, but overall CI must not be described as green. A prior run at af47ffe... failed only on an incorrectly assumed ISO-text Grafana range; the accepted scenario validates the actual pane payload's epoch-millisecond values.

**Evidence vocabulary:** VV = inspected original 1440×900 PNG for the named subbehavior; BV = actual Electron interaction and asserted deterministic IPC/renderer behavior; SO = source-only in this CAP; UV = unverified. Per-ID partial verification is not blanket completion.

## B. Independent T19–T24 inventory coverage

| ID | Implementation owner | Visual | Behavioral | Verified subset / gap |
| --- | --- | --- | --- | --- |
| **T19** Service Map | TraceExplorer; useTraceCohortAnalysis; TraceServiceMap/Canvas | **VV** | **BV** | Full-trace map analysis from 3→2 filtered traces, 8→6 service nodes and 6→5 edges, no local view-toggle refetch; missing native node/edge click, brush-while-loading, and machine-level assertion of each rendered graph cell identity |
| **T20** Hierarchy and opened trace | useTempoTraceOpenController; TraceOpenedResult; TraceWaterfall; traceViewer | **VV** | **BV** | Exact A root/child/grandchild, nested ordering and collapse/re-expand; no trace-to-trace switch, very large trace, or keyboard test |
| **T21** Hidden spans and kinds | TraceResultHeader; withoutAsyncTraceBranches; buildVisibleTraceTree | **VV** | **BV** | Default 3/5 visible, async 5/5 visible, kind hiding removes inspector without substituting identity; not all combinations/keyboard actions exercised |
| **T22** Gap compression | TraceWaterfall; buildTraceTimelineScale | **VV** | **BV** | Known 10-second timeline, compressed markers, wall-clock toggle, original 80ms span duration preserved, no extra provider calls; other thresholds/tick boundaries untested |
| **T23** Inspector and V-09 | SpanInspector; TraceOpenedResult | **VV** | **BV** | Exact selected span/parent, service/operation, status, attributes, event DOM, close/reopen and selection on collapse/hide; some long content remains below screenshot viewport; trace-switch stale inspection unverified |
| **T24** Grafana handoff | GrafanaHandoffActions; grafanaExplore | **SO** | **BV** | Actual menu Open action, intercepted precise datasource/query/time-range URL, no provider refetch; menu not captured as separate PNG and current control is query-level, not a span-ID deep link |

## C. Filtered cohort / graph identity matrix

Deterministic trace IDs: **A** = 00000000000000000000000000000201; **B** = 00000000000000000000000000000202; **C** = 00000000000000000000000000000203. Fixture-defined **D** = 00000000000000000000000000000204 is a root-only trace, not independently opened.

| Active predicate | Included trace IDs | Expected service nodes | Expected edges | Actual |
| --- | --- | --- | --- | --- |
| Initial span:duration > 300ms | A/B/C | gateway, checkout, database, queue, worker, cache, legacy-only, retired (**8**) | gateway→checkout; checkout→database; gateway→queue; queue→worker; checkout→cache; legacy-only→retired (**6**) | **3 analyzed, 8 nodes, 6 edges** |
| resource.service.name != "legacy-only" | A/B | gateway, checkout, database, queue, worker, cache (**6**) | gateway→checkout; checkout→database; gateway→queue; queue→worker; checkout→cache (**5**) | **2 analyzed, 6 nodes, 5 edges**; all six services and five relationships inspected in service-map image; no legacy-only/retired relationship |
| span.name = "cap25-empty" | None | None | None | Zero search rows, no stale graph or opened waterfall; native empty-state image inspected |

Request ledger: one initial search + three separate full-trace map lookups; one filtered search + two full-trace map lookups; one user-opened full trace; one empty search = **9 synthetic provider requests**. Map construction intentionally fetches the selected cohort's full traces; map/list/scatter presentation toggles and local hierarchy/inspector/compression do not refetch. Graph counts are asserted mechanically; the exact visible node/edge identities were matched to fixture expectations by original-pixel inspection, **not** through a dedicated graph-model DOM assertion. The filtered and empty TraceQL strings were installed via controlled session store, then the real **Run** UI was clicked. Live Tempo parser semantics are not established.

## D. Hierarchy and selection matrix

| Span ID | Parent | Service / operation | Offset | Duration | Kind |
| --- | --- | --- | --- | --- | --- |
| 00000000000000a1 | — | gateway / inbound request | +0ms | 10000ms | SERVER |
| 00000000000000a2 | a1 | checkout / authorize payment | +100ms | 900ms | CLIENT |
| 00000000000000a3 | a2 | database / SELECT account | +180ms | 80ms | CLIENT |
| 00000000000000a4 | a1 | queue / publish work | +6500ms | 110ms | PRODUCER |
| 00000000000000a5 | a4 | worker / consume work | +6650ms | 160ms | CONSUMER |

Actual sequence: open trace A from first filtered result and assert exactly a1/a2/a3 visible. Collapse a1 → only a1; expand → same three IDs; select a3 → inspector exact a3. Collapse its ancestor while a3 selected → inspector **retains a3 under current implementation contract**, although its row is collapsed; expand restores same identity. Hide CLIENT kind → inspector disappears; **Show all kinds** restores inspector a3; **Show async branches** exposes a4 and a5 (5/5). Close inspector and select a2 → correct reopened inspector. **No additional provider request** for these local operations.

## E. Timeline / compression matrix

Source trace A starts **2026-08-19T16:20:00.000Z**, timestamp 1787156400000ms, spans +0–10000ms. Database child a3 spans +180–260ms and must always remain **80ms**, irrespective of display.

| Mode | Visible rows | Gap markers | Native visual observation | Data/request invariant |
| --- | --- | --- | --- | --- |
| Default; async pruned | a1/a2/a3 | **1** | 10.0s wall time → **706ms** visual scale | a3 duration remains **80.0ms**; no refetch |
| Async shown; compressed | a1/a2/a3/a4/a5 | **2** | 10.0s wall time → **1.51s** visual scale | Source offsets/durations unchanged |
| **Use wall-clock scale** | Same 5 | **0** | Compression markers absent | Duration still 80.0ms; no refetch |
| **Compress idle gaps** again | Same 5 | **positive** | Markers reappear | No provider call |

These are display-transform assertions, not a pixel-derived reinterpretation of source timestamps. Other gap thresholds and boundary tick layouts remain unverified.

## F. Inspector detail matrix

For selected span **a3**: visible service **database**, operation **SELECT account**, ERROR badge, message **Synthetic database timeout**, +180ms start, **80.0ms** duration, CLIENT kind and synthetic scope. Inspector Identity section correctly exposes trace A, a3 and parent a2. Database attributes include db.system **postgresql** and db.operation.name **SELECT**; an exception event with TimeoutError and a long custom attribute were checked in the renderer content. The original screenshot shows inspector header, identity and Database sections, but some lower entries are below its independent scrollbar. Collapsing the selected span's ancestor keeps the inspector on a3, hiding CLIENT removes it, restoring kinds brings a3 back, closing then selecting a2 correctly opens a2. Different trace selection and very long attribute visual scrolling are not independently verified.

## G. Grafana handoff matrix

Actual query-toolbar Grafana menu and **Open in Grafana ↗** used. Intercepted URL: origin **https://grafana.example.invalid**, path **/explore**, orgId **1**, pane **datakoala**, datasource UID **example-tempo** and type **tempo**, queryType **traceql**, exact query **{ resource.service.name != "legacy-only" }**. Range is **from 1787155200000 to 1787158800000**, representing **2026-08-19 16:00–17:00 UTC** as epoch milliseconds. Selected trace A and reopened inspector span a2 did not change, and no Tempo provider request was added. The current UI is a **query-level handoff**: the URL is not asserted or represented as a selected trace/span deep link. No real Grafana navigation occurred.

## H. Screenshot manifest and mandatory visual inspection

Downloaded **artifact 11998819921**; opened **every PNG individually at full original 1440×900**, DPR/zoom 1. Semantic measurements for each have positive target width/height, no body horizontal overflow, and matched filename/sourceHead. The module's measurements.json, CAP-25 status.json and batches/index.json all point to generating SHA **e0b3b8e...** (not synthetic checkout **2097cf1...**).

| Filename | Intended state and original-pixel review | Visual |
| --- | --- | --- |
| cap25-tempo-service-map-desktop.png | Filtered six-service/five-edge graph, legible bottleneck details and node/edge labels; excluded service relationships absent; no viewport clipping | **VV** |
| cap25-traces-open-desktop.png | Three nested visible rows, async hidden, root waterfall and one compressed gap | **VV** |
| cap25-span-inspector-desktop.png | Correct a3 ERROR inspector, parent/trace IDs, labels and attributes; independent scrollbar with lower content outside screenshot | **VV** |
| cap25-traces-expanded-desktop.png | Full five-span hierarchy, selected a3 unchanged, producer→consumer branch, two gap markers | **VV** |
| cap25-tempo-empty-or-error-desktop.png | Native empty cohort after real Run, no stale graph or waterfall, centered empty message; **not** a failed-detail lookup screenshot | **VV** |

The top Tempo query-toolbar sample-size value is visibly truncated at 1440px, corroborating already-recorded CAP-23 finding VC23-01; no new production change is introduced. Successful workflow alone is not treated as visual acceptance.

## I. Convergence Atlas candidates — analysis only

| ID | Inventory / owner | Classification | Evidence, impact and recommended later direction |
| --- | --- | --- | --- |
| **VC25-01** | T20/T23, TraceOpenedResult/SpanInspector, V-09 | **INTENTIONAL_DIFFERENCE** | Tempo's fixed waterfall/inspector grid vs Loki's shared resizable detail shell. High source/native-image confidence, medium layout impact; retain trace-specific timeline, converge selection/close semantics where useful. |
| **VC25-02** | T20/T21/T23, hierarchy/inspector | **ALREADY_CONVERGED** | Accurate row selection, inspector identity, close/reopen, hidden-kind reconciliation in tested interactions; high runtime confidence. Add trace-switch regression before broad claims. |
| **VC25-03** | T19, useTraceCohortAnalysis | **INTENTIONAL_DIFFERENCE** | A service map requires new full-trace detail requests unlike pure local result charts. Exact 3→2 lookups and no toggle refetch proved; high runtime confidence. Keep progress/request behavior explicit. |
| **VC25-04** | T19/T24, local time brush and handoff | **UNVERIFIED** | In-flight locally brushed interval, stale async graph, and trace/span-specific deep links not exercised; potentially high cohort-identity impact. Add focused runtime scenarios, preserve query-level handoff distinction. |
| **VC25-05** | T20/T23, trace lifecycle/keyboard | **UNVERIFIED** | Root-only D and unavailable trace-detail were fixture-defined but not opened, switching trace with inspector and keyboard not independently tested; medium impact. Add explicit isolated edge coverage. |
| **VC25-06** | T19/T24 toolbar, see VC23-01 | **CONFIRMED_DEFECT** (existing, not new) | Native filtered map screenshot shows truncated sample-size toolbar value (“10…”); low–medium UX impact, high visual confidence; deduplicate with VC23-01 in future Atlas, address toolbar sizing/accessibility later. |

Do not unify map, waterfall or inspector engines on the strength of this audit.

## J. Acceptance and final disposition

**Confirmed:** Visual Preview **success** at scenario SHA e0b3b8e...; five out of five original-resolution PNGs individually inspected; all relevant semantic dimensions/zoom/provenance validated; CAP-25 status **success** in status.json and batches/index.json. The run also reported success for preceding standalone CAP-18 through CAP-23 modules. Nine requests and bounded trace/cohort/inspector/compression/handoff assertions passed.

**Other CI:** Documentation succeeded; overall CI failed on pre-existing formatting warnings in 26 non-CAP25 files. UI, unit, production build and macOS runtime/package jobs succeeded. No local lint/formatting performed, and no unrelated file was edited.

**Remaining verification:** real Tempo/Grafana acceptance; filtered time brush while map analysis is in progress; graph node/edge click and individual DOM graph identity; switching selected traces without stale inspector; root-only and failed/missing lookup; service-map unavailable state; full long-attribute visual scroll, keyboard accessibility, timeline boundary/threshold cases, and actual CodeMirror typing. These prevent exhaustive scoped acceptance.

**Final status: PARTIAL, NOT EVIDENCE_COMPLETE.** Keep review on draft PR #431. Do not merge, modify integration #406 directly, edit central registers, start CAP-26/Phase 2, or generate the final Atlas in this batch.
