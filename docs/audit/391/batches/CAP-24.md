# CAP-24 — Tempo trace list, lookup, progressive results and scatter

**Disposition: PARTIAL — confirmed displayed-boundary defect.** The standalone Electron **known-defect characterization passes**, but T18 **product acceptance still FAILS**. Evidence was gathered for T14–T18 and all five full-resolution screenshots were downloaded and individually inspected from the new successful run. Do **not** mark CAP-24 `EVIDENCE_COMPLETE`; the displayed `[start, end)` interval does not agree with actual row membership for traces at the displayed boundaries. This audit characterizes the problem but does not modify production UX.

## A. Metadata and chain of custody

| Field | Verified value |
| --- | --- |
| Parent | [#391](https://github.com/cubitouch/DataKoala/issues/391) / Phase 1C |
| Integration PR / isolated base | [#406](https://github.com/cubitouch/DataKoala/pull/406), `audit/391-ux-convergence` at `7322aae7430638c298f240011608504ee0952870` |
| Isolated branch | `audit/391-cap-24-tempo-traces` |
| Draft PR | [#430](https://github.com/cubitouch/DataKoala/pull/430) targeting `audit/391-ux-convergence` (never `main`) |
| Initial standalone-scenario commit | `2b0a3648a84805548b3306d69a0b8ce560bb82cb` |
| Scenario correction commits | `d424c41032ef45275daf3eaad0a366aa56a45916`, `7930ab65176e42b2233ba564b0a5fe31696f75e6`, `e4c7d84067769a926f24b92833a4fe197fba8990` |
| Final generating scenario SHA | `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3` |
| Characterization-only correction commits | `9996c078609ddd57fd5c37b793eaf9c4fb465992`, `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3` |
| Report commit | The commit introducing this document; exact SHA recorded in PR #430's handoff (cannot self-reference a commit SHA inside its own content) |
| Visual Preview workflow | [run 38794494341](https://github.com/cubitouch/DataKoala/actions/runs/38794494341) — **SUCCESS**, capture `116627700460` and publish `116629712842` both successful |
| Audit evidence artifact | [`datakoala-ux-audit-pr-430`, artifact 12001392707](https://github.com/cubitouch/DataKoala/actions/runs/38794494341/artifacts/12001392707), downloaded and individually inspected |
| CI workflow | [run 38794493929](https://github.com/cubitouch/DataKoala/actions/runs/38794493929) |
| Documentation workflow | [run 38794494306](https://github.com/cubitouch/DataKoala/actions/runs/38794494306) — **SUCCESS** |
| Actual Actions merge checkout | `786f1d2d4ad7b755278427e465b613455afc1e13` (`refs/pull/430/merge`, **not** the scenario/source SHA) |
| Merge checkout base in that run | `3cadf2e41ada6f02e53b06f9d500d84a928ca292` (later integration-branch snapshot; isolated branch originally forked from `7322aae7…`) |
| Viewport | 1440 × 900 CSS pixels, DPR = 1, Electron zoom = 1 |
| Ownership | `scripts/visual-preview/audit-batches/cap-24.mjs` and `docs/audit/391/batches/CAP-24.md` only |

The GitHub Actions runner checked out the synthetic PR merge SHA, but `DATAKOALA_AUDIT_HEAD`, `measurements.json.sourceHead`, `status.json.sourceHead` and `batches/index.json` all identify the actual scenario commit `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3`. The full archive was downloaded and the five CAP-24 images were opened individually, at their native dimensions. No live Tempo endpoint was used.

## B. Coverage matrix

`VV` = visually verified from downloaded native screenshot; `BV` = native behavioral assertion/observation (not necessarily passing the expected contract); `SO` = source-only; `UV` = unverified.

| Inventory ID | Inventory scope | Visual | Behavioral | Source owner and evidence | Gaps / outcome |
| --- | --- | --- | --- | --- | --- |
| **T14** | Trace ID lookup | **VV** | **BV** | `TraceExplorer`, `useTempoTraceOpenController`, `TraceOpenedResult`; opened screenshot + synthetic lookup/alert assertions | Found ID retained; missing and provider-error distinct. No authenticated provider semantics; no screenshot specifically of the two alerts. |
| **T15** | Trace search and progress | **VV** | **BV** | `TraceExplorer`, `useTempoTraceSearchController`; partial screenshot, 2 → 5 IPC progress/settled assertions | Pending/settled count and disabled controls verified; interrupted completion and competing stale response remain **UV**. |
| **T16** | Search list | **VV** | **BV** | `TraceSearchResults`, `TraceSearchList`; default/open/empty screenshots, order/status/row-selection assertions | Five rows, identity and ordering verified; high-volume virtualization and keyboard-only navigation are **UV**. |
| **T17** | Scatter cohort view | **VV** | **BV** | `TraceExplorer`, `TraceScatterChart`; actual chart, native Electron drag and filter selection screenshot | 3/5 marks selected, scatter/list share cohort, no extra provider request. Other chart/range combinations **UV**. |
| **T18** | Local time filtering | **VV** | **BV — FAIL** | `TraceExplorer`, `TraceScatterChart.traceScatterLocalRange`, `ResultFilterBar`; screenshot, injected exact displayed-boundary rows, `boundaryFinding` measurements | Local filtering/reset and zero-fetch verified; **displayed half-open boundary contract fails**. Raw sub-millisecond boundary membership has source support but was not asserted with exactly matching raw endpoints. |

The statuses distinguish native evidence *of a defect* from acceptance success. T18 is behaviorally observed, but its central acceptance criterion is not satisfied.

## C. Trace-ID lookup matrix (T14)

All operations used only the synthetic IPC boundary and connected profile `audit-tempo`.

| Case | Exact query / operation | Synthetic response | Native disposition |
| --- | --- | --- | --- |
| Found | `00000000000000000000000000000101` | Successful 16-span trace response, bounded search-row lookup `2026-08-19T16:49:55.000Z` to `16:50:06.480Z` | Opened trace header contains the exact ID, root service/operation and span timeline; back returns to five saved search rows with **no** new request. |
| Not found | `0000000000000000000000000000dead` | `ok:false`, query error, `Synthetic trace not found: <id>` | Alert displays not-found message, no successful open header, request has no searched-row time bounds. |
| Provider failure | `0000000000000000000000000000beef` | `ok:false`, connection error, `Synthetic Tempo lookup provider unavailable` | Dedicated provider-failure alert, not silently treated as successful empty or missing ID. |

## D. Progressive-result matrix (T15/T16/T17)

Synthetic TraceQL was exactly `{ true }` with `parameters=[]` and UTC range `2026-08-19T16:00:00.000Z` to `2026-08-19T17:00:00.000Z`. Each search retained the `audit-tempo` identity and an actual renderer-scoped `progressRequestId`.

| Stage | Results | Native states and assertions | Provider requests |
| --- | --- | --- | --- |
| Initial complete | Five distinct traces | Descending start times; row summaries, status labels `error, ok, ok, error, ok`, span counts and services match fixture | One trace search |
| Held progress | Two traces | `2 traces so far` rendered; existing identities stable; **disabled**: Run, Sample size, direct Open trace, Service map and both trace rows. **Enabled**: List and Scatter selectors. | One additional pending search, one progress envelope; no other dispatch |
| Released completion | Five traces | Pending clears; all five row buttons and Run/Sample/Open/Service map enabled; first two identities preserved. | Same pending request resolves, no new dispatch |
| List → Scatter → List | Five original, then three locally selected | Both changes work without refetch; pending-only Service map guard is not generalized to List/Scatter. | **0** extra requests |
| Clear local filter | Five boundary-fixture rows after explicit fixture substitution | Filter chip removed; local cohort restored; no new provider query | **0** extra requests |
| Completed empty | Zero result rows, not running | Separate empty screenshot; no phantom rows; copy returns to initial-style guidance (this copy itself does not prove empty-vs-never-run semantics) | One new search |
| Provider failed search | Error instead of success | `Synthetic Tempo search unavailable` alert and tab error asserted | One new search |

Total of **seven** synthetic `query:run` operations in the final measurements: four search operations (initial, progressive, empty, failed) and three trace-ID lookups. Neither a stale delayed superseded completion nor an interrupted progressive failure was exercised; both are explicit residual gaps, not implied passes.

## E. Scatter interval and boundary matrix (T17/T18)

A real Electron mouse drag on the rendered ECharts scatter plot created a native result-filter chip displaying:

`[2026-08-19T16:11:24.601Z, 2026-08-19T16:41:24.601Z)`

The original five-trace source cohort was filtered to the three IDs ending `0102`, `0103` and `0104`. The selected scatter screenshot shows three marks. Query dispatch count stayed **5 → 5** through view switching and native brushing, and remained unchanged through the synthetic boundary-row replacement and filter reset.

For an exact edge test, five source rows were then substituted through the renderer store while preserving the native brush-generated filter (this is **fixture replacement**, not a second provider fetch or simulated brush):

| Boundary fixture | Synthetic position | Expected for *displayed* `[start,end)` | Observed in actual List view |
| --- | --- | --- | --- |
| `...0201` | Exactly displayed start, `16:11:24.601Z` | **Included** | **Excluded** — FAIL |
| `...0202` | Exactly displayed end, `16:41:24.601Z` | **Excluded** | **Included** — FAIL |
| `...0203` | Strictly between endpoints | Included | Included |
| `...0204` | Two seconds before start | Excluded | Excluded |
| `...0205` | Two seconds after end | Excluded | Excluded |

The actual DOM inspection recorded exactly `Boundary end excluded` and `Inside interval` in the list (the first string is the fixture name for the expected-excluded row). `measurements.json.boundaryFinding` records expected/actual Boolean membership, five substituted source rows, selected timestamps, and provider request delta **0**.

**Interpretation, with an important precision distinction:** `traceScatterLocalRange` retains the ECharts numeric `coordRange`, which may contain fractional milliseconds. `TraceExplorer` compares raw numeric `startTimeMs >= localRange.startMs && startTimeMs < localRange.endMs`. The shared result filter chip, however, shows `new Date(...).toISOString()` bounds rounded/truncated to whole milliseconds. A trace placed precisely at an *advertised* boundary need not fall at the unrounded internal boundary. Thus this audit confirms a **displayed-contract mismatch**, not necessarily incorrect ordering at the unrounded floating-point boundaries. This distinction must be retained in any fix and regression test.

**Acceptance result:** native brush causes no Tempo fetch = **PASS**; local reset restores cohort = **PASS**; displayed exact `[start, end)` boundary membership = **FAIL**. The scenario now **passes by explicitly characterizing the known defect**, including the precise observed membership and visible source-service identities. The assertion fails if the observed behavior changes; a future production fix MUST replace/update its expected characterization and demonstrate passing `[start, end)` product acceptance. **A successful audit is not a T18 acceptance pass.**

## F. Screenshot manifest and visual inspection

All files exist in `batches/CAP-24/` within artifact **12001392707**. Individual final-artifact inspections were performed at **1440 × 900**, no resizing; each is RGB PNG, DPR = 1, zoom = 1; `measurements.json` reports positive target rectangle, non-overflowing document, correct source SHA and semantic result state.

| PNG | Semantic target | Measured target bounds (x,y,w,h) | Inspection |
| --- | --- | --- | --- |
| `cap24-traces-default-desktop.png` | Five ordered list entries | (248,40,1192,860) | **VV**: five distinct legible rows, green/red status dots, durations, start times and matched span counts; no clipping/horizontal overflow. |
| `cap24-traces-open-desktop.png` | Opened trace detail header/timeline | (248,378,1192,57) | **VV**: canonical `...0101` in header, operation/service, span counts and waterfall; internal vertical scrolling is expected, not viewport clipping. |
| `cap24-tempo-partial-desktop.png` | Pending two-row cohort | (248,40,1192,860) | **VV**: `2 traces so far`, two stable rows and visually disabled pending actions, no accidental open affordance. |
| `cap24-scatter-selected-desktop.png` | Populated filtered scatter | (248,475,1192,425) | **VV**: three positioned scatter marks, legible time/duration axes and statuses, visible local `[start,end)` filter chip; no chart overflow. |
| `cap24-traces-empty-desktop.png` | Completed zero-row search | (248,40,1192,860) | **VV**: no phantom rows, no loading overlay, central empty-state guidance; copy resembles never-searched guidance, a further messaging question. |

The exact five screenshot names match the registered budget. The `status.json` entry is **`success`** with exact `sourceHead` `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3`; `batches/index.json` likewise has CAP-24 **`success`**, `error: null`, and the same `sourceHead` as `measurements.json`. The workflow log records `CAP24_KNOWN_DEFECT_CHARACTERIZED` with `productAcceptance: "FAIL"` and the unchanged exact mismatch in `measurements.json.boundaryFinding`. **These success statuses describe execution of the characterization, NOT acceptance of the faulty product behavior.**

## G. Visual Convergence Atlas candidates (V-01 / V-06)

| Stable ID | Classification | Scope / owners / native evidence | Impact, confidence, future direction |
| --- | --- | --- | --- |
| **VC24-01** | `UNNECESSARY_DIFFERENCE` (bounded chrome only) | **V-01**, T16 vs Loki log list; `TraceSearchList`, `LogResultExplorer`; current trace default screenshot and the existing `compare-lists.png` in the artifact | Medium maintenance and density consistency, medium confidence: openable row focus/selection shell remains distinct. Status dots versus severity badges, duration/operation versus log text are **intentional domain differences**; only converge common accessible row chrome after cross-source review. |
| **VC24-02** | `INTENTIONAL_DIFFERENCE` | **V-06**, T15/T17; `TraceSearchResults`, Tempo progress controller; partial screenshot and exact disabled-state assertions | High confidence, moderate usability relevance: Tempo retains a partially populated cohort and keeps List/Scatter selectable while row open and Service map are disabled. Do not impose blanket loading-disabled policy or drop progressive provenance. |
| **VC24-03** | `CONFIRMED_DEFECT` | **V-06**, T18; `TraceScatterChart.traceScatterLocalRange`, `TraceExplorer` and result-range chip formatting; native brush screenshot + measured DOM boundary replacement | **High impact on exact boundary predictability, high confidence**. Fractional brush bounds disagree with whole-millisecond displayed chip; `...0201` excluded at shown start, `...0202` included at shown end. Future isolated fix should normalize/filter/display bounds to the same precision or present actual representable boundaries; retain half-open semantics and add exact native edge regression. No production fix in this PR. |
| **VC24-04** | `ALREADY_CONVERGED` | **V-06**, T17/T18; shared `ResultFilterBar`, `TraceExplorer` local filter; scatter screenshot and request count 5 → 5 | High confidence: consistent chip removal and List/Scatter cohort switching; leave the existing shared result-filter shell in place, fix only the precision contract. |
| **VC24-05** | `UNVERIFIED` | **V-06**, T15/T16; failure/empty states, progressive controller; completed empty screenshot and native error assertions | Medium confidence limitation: empty completed search uses guidance resembling first-run copy. Product-intended distinction from never-run, interrupted progress and stale completion ownership require a separate native scenario; do not classify as a confirmed defect from this five-image run. |

Every candidate above is an observation/roadmap lead only. There is no shared refactor or Phase 2 implementation.

## H. CI, assertions and acceptance

- **Visual Preview**: [run **38794494341**](https://github.com/cubitouch/DataKoala/actions/runs/38794494341) — **SUCCESS**, including capture and publish jobs; CAP-24 executed successfully with the explicit known-defect characterization, all five screenshots and `measurements.json` generated, and final artifact **12001392707** downloaded. The preceding failing run **38790956402** remains historical evidence only: its unconditional `CAP24_BOUNDARY_CONTRACT_FAILURE` was removed, **not** the fixture, observed mismatch or failed product acceptance. The generating SHA for the newly inspected images is exclusively `ee031b9d3969bf81f4e6ed36e11314dcaefdd0b3`.
- **Main CI**: run **38794493929** — **Production build, UI tests, unit tests, DuckDB macOS runtime/package PASS**; **Quality fails at Check formatting** (26 pre-existing warnings elsewhere in this accumulated integration diff). Formatting failure is independent of the synthetic Tempo boundary mismatch. As requested, no local lint or format command was run.
- **Documentation**: run **38794494306** — build **PASS**, deploy skipped for draft PR.
- **Assertions verified natively**: exact trace profile and query payloads, search order/visible summary/statuses, row selection and bounded trace lookup, found/not-found/provider error distinction, stable back navigation, two-to-five progressive completion, exact disabled/enabled controls, List/Scatter zero-fetch, native mouse brush and subset, filter-chip removal and cohort reset, empty successful search, failed search alert, positive geometry, DPR and viewport, source provenance.
- **Known-defect characterization PASS; product acceptance FAIL**: an exact native assertion expects and verifies the *currently observed* start-at-displayed-bound excluded, end-at-displayed-bound included, inside trace included and outside traces excluded, with exactly `["Boundary end excluded", "Inside interval"]` visible in that order. It fails on unexpectedly changed behavior; a future production fix requires revising this audit assertion to prove the correct displayed `[start, end)` semantics. The unchanged failing fixture, observed membership, product-acceptance `expected` fields and zero provider-call delta remain in `measurements.json.boundaryFinding`.
- **Not executed**: authenticated Tempo calls; stale or superseded progressive completions; interrupted progressive failure; high-cardinality list virtualization; exact raw floating-point boundary member injection; empty scatter dataset as a *separate* scatter-state screenshot (empty search is visually covered, scatter empty behavior is source-only).

## I. Final disposition and handoff

**`PARTIAL` — do not advance the central coverage register to `EVIDENCE_COMPLETE`.**

All five specified PNGs were captured and individually inspected in the new successful workflow. CAP-24 standalone execution is `success` by intentional known-defect characterization, while its report disposition remains **PARTIAL** and T18 product acceptance remains **FAIL**. T14–T17 native baseline scenarios and the zero-extra-fetch part of T18 were verified. The exact displayed `[start,end)` acceptance criterion fails reproducibly: **VC24-03**. The audit preserves the failure, its fixture inputs, and the unrounded-versus-displayed precision distinction without changing production code.

Follow-up, outside CAP-24: address the interval precision/display contract in a separate authorized production slice, rerun native boundary regression and other residual cases, then update the central register only after confirmed acceptance. **Do not merge PR #430 or PR #406 as part of this audit; do not proceed to CAP-25 or Phase 2 here.**
